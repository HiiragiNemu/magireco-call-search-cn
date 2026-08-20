#!/usr/bin/env bash
set -Eeuo pipefail

release='v22-authoritative-localization-20260820'
base_url='https://magireco-call-search-cn.pages.dev'
base_sha="$(git rev-parse HEAD)"
remote_changed=false
status_dir='/tmp/v22-ultimate'
local_dir='/tmp/v22-ultimate-local'
production_dir='/tmp/v22-ultimate-production'
node_dir='/tmp/v22-ultimate-node'
mkdir -p "$status_dir" "$local_dir" "$production_dir"

rollback() {
  code=$?
  if [[ "$code" -ne 0 && "$remote_changed" == true ]]; then
    echo "Ultimate V22 finalizer failed; restoring ${base_sha}." >&2
    git fetch origin main || true
    lease="$(git rev-parse origin/main 2>/dev/null || true)"
    if [[ -n "$lease" ]]; then
      git push --force-with-lease=refs/heads/main:"$lease" origin "$base_sha":refs/heads/main || true
    fi
  fi
  if [[ "$code" -ne 0 ]]; then
    python - "$code" "$base_sha" <<'PY' || true
import json, sys
from datetime import datetime, timezone
from pathlib import Path
Path('/tmp/v22-ultimate/status.json').write_text(json.dumps({
    'release': 'v22-authoritative-localization-20260820',
    'state': 'fail',
    'exitCode': int(sys.argv[1]),
    'rollbackCommit': sys.argv[2],
    'at': datetime.now(timezone.utc).isoformat(),
}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
PY
  fi
  exit "$code"
}
trap rollback EXIT

git config user.name github-actions[bot]
git config user.email 41898282+github-actions[bot]@users.noreply.github.com

# The supervisor is idempotent: it accepts an already verified production state,
# otherwise it performs the authoritative rebuild and lowest-priority fallback.
bash .automation/run-v22-supervisor.sh
remote_changed=true

# Preserve browser programs outside the worktree before removing one-shot tooling.
rm -rf "$node_dir" "$local_dir" "$production_dir"
mkdir -p "$node_dir" "$local_dir" "$production_dir"
cp .automation/v22-core-smoke.mjs "$node_dir/smoke.mjs"
printf '{"type":"module","private":true}\n' > "$node_dir/package.json"
npm install --prefix "$node_dir" --no-package-lock --no-save puppeteer-core@24.16.0
chrome="$(command -v google-chrome-stable || command -v google-chrome || command -v chromium-browser || command -v chromium)"
[[ -n "$chrome" ]]

# Remove only obsolete workflow machinery. Cloudflare Pages deploys directly from
# main, so no product file depends on these one-shot integration branches.
python - <<'PY'
from pathlib import Path
import re

root = Path('.')
workflow_root = root / '.github' / 'workflows'
explicit = {
    'deploy-v21-production.yml',
    'authority-v22-diagnostic.yml',
    'v22-authoritative-main.yml',
    'v22-authoritative-safe-main.yml',
    'v22-final-main-acceptance.yml',
    'v22-force-final-main.yml',
    'v22-supervisor-final.yml',
    'v22-independent-verifier.yml',
    'v22-ultimate-finalizer.yml',
}
obsolete_ref = re.compile(
    r'(?:safe-v\d+[-A-Za-z0-9_./]*|(?:release|rollback|fix)/[-A-Za-z0-9_./]+|'
    r'v16-delivery-source-final|deploy-v21-production-trigger|__no_create__)'
)
removed = []
if workflow_root.exists():
    for path in sorted(workflow_root.glob('*.y*ml')):
        text = path.read_text(encoding='utf-8', errors='replace')
        if path.name in explicit or obsolete_ref.search(text):
            path.unlink()
            removed.append(path.as_posix())

for name in (
    '.deploy-v21-trigger',
    '.deploy-v22-trigger',
    '.deploy-v22-safe-trigger',
    '.deploy-v22-final-trigger',
    '.deploy-v22-force-final-trigger',
    '.deploy-v22-supervisor-trigger',
    '.deploy-v22-independent-verifier-trigger',
    '.deploy-v22-ultimate-trigger',
    '.automation/v22-write-probe.txt',
    '.automation/authority-v22-diagnostic-run.json',
    '.automation/authority-v22-final-source-run.json',
    'scripts/run-v22-authoritative-safe.py',
    '.automation/run-v22-final-release.sh',
    '.automation/run-v22-supervisor.sh',
    '.automation/run-v22-ultimate-finalizer.sh',
):
    path = root / name
    if path.exists():
        path.unlink()
        removed.append(path.as_posix())

Path('/tmp/v22-ultimate/removed-files.json').write_text(
    __import__('json').dumps(removed, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'
)
PY

# Root node_modules was committed historically. It is not a deployment input and
# is removed only after checking that public files do not reference it.
if [[ -d node_modules ]]; then
  if grep -RIl --exclude='*.map' -E '(src|href)=["'"'][^"'"']*node_modules/' public >/tmp/v22-node-modules-refs.txt 2>/dev/null; then
    echo 'Public pages reference root node_modules; refusing unsafe removal.' >&2
    cat /tmp/v22-node-modules-refs.txt >&2
    exit 1
  fi
  rm -rf node_modules
fi
python - <<'PY'
from pathlib import Path
p = Path('.gitignore')
text = p.read_text(encoding='utf-8') if p.exists() else ''
lines = text.splitlines()
for entry in ('node_modules/', '_sources/', '.DS_Store', '*.pyc', '__pycache__/'):
    if entry not in lines:
        lines.append(entry)
p.write_text('\n'.join(lines).rstrip() + '\n', encoding='utf-8')
PY

# Post-cleanup audit: critical product contracts fail the release, observations are
# retained for future maintenance without pretending they were fixed.
python - <<'PY'
from __future__ import annotations
import collections
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

root = Path('.')
public = root / 'public'
release = 'v22-authoritative-localization-20260820'
critical = []
observations = []
summary = {}

required = [
    public / 'index.html',
    public / 'myfile/v22-menu-fixes.css',
    public / 'myfile/v22-runtime-fixes.js',
    public / 'downloads/story-title-groups.json',
    public / 'data/story-title-authority-report-v22.json',
    public / 'data/v22-site-audit.json',
    public / 'data/v22-final-acceptance.json',
]
for path in required:
    if not path.exists():
        critical.append({'code': 'missing-required-file', 'path': path.as_posix()})

report = {}
proof = {}
if (public / 'data/story-title-authority-report-v22.json').exists():
    report = json.loads((public / 'data/story-title-authority-report-v22.json').read_text(encoding='utf-8-sig'))
if (public / 'data/v22-final-acceptance.json').exists():
    proof = json.loads((public / 'data/v22-final-acceptance.json').read_text(encoding='utf-8-sig'))
if report.get('release') != release:
    critical.append({'code': 'authority-release-mismatch'})
if proof.get('release') != release or proof.get('state') != 'pass':
    critical.append({'code': 'accepted-proof-missing-or-failed'})
if int(report.get('uniqueTranslations', 0)) < 1000:
    critical.append({'code': 'implausibly-few-title-records', 'value': report.get('uniqueTranslations')})
if int(report.get('displayStillContainsKanaCount', 999999)) > 500:
    critical.append({'code': 'too-many-kana-displays', 'value': report.get('displayStillContainsKanaCount')})
counts = report.get('counts', {})
for key, minimum in {
    'official_table_pieceList': 900,
    'official_table_charaList': 150,
    'official_table_sectionList': 900,
    'target_json_files': 1,
}.items():
    if int(counts.get(key, 0)) < minimum:
        critical.append({'code': 'authority-table-below-minimum', 'table': key, 'value': counts.get(key), 'minimum': minimum})

index = (public / 'index.html').read_text(encoding='utf-8-sig', errors='replace') if (public / 'index.html').exists() else ''
body = re.search(r'<body\b[^>]*>(.*)</body\s*>', index, re.I | re.S)
if release not in index:
    critical.append({'code': 'release-marker-missing'})
if 'navtext-container' in index:
    critical.append({'code': 'navtext-container-remains'})
if body and '魔法纪录·Magia Exedra 魔法少女称呼搜索' in body.group(1):
    critical.append({'code': 'removed-title-remains-in-body'})
css_path = public / 'myfile/v22-menu-fixes.css'
css = css_path.read_text(encoding='utf-8', errors='replace') if css_path.exists() else ''
for contract in ('width: max-content !important', 'height: auto !important', 'overflow: auto !important'):
    if contract not in css:
        critical.append({'code': 'menu-contract-missing', 'contract': contract})

# Validate release JSON and record historical pseudo-JSON separately.
json_errors = []
for path in public.rglob('*.json'):
    try:
        json.loads(path.read_text(encoding='utf-8-sig'))
    except Exception as exc:
        json_errors.append({'path': path.relative_to(root).as_posix(), 'error': type(exc).__name__})
blocking_tokens = ('story-title-groups', 'story-title-authority', 'v22-site-audit', 'v22-final-acceptance')
blocking_json = [item for item in json_errors if any(t in item['path'].casefold() for t in blocking_tokens)]
if blocking_json:
    critical.append({'code': 'invalid-release-json', 'items': blocking_json[:50]})
nonblocking_json = [item for item in json_errors if item not in blocking_json]
if nonblocking_json:
    observations.append({'severity': 'maintenance', 'code': 'historical-json-suffix-not-strict-json', 'count': len(nonblocking_json), 'items': nonblocking_json[:50]})

id_re = re.compile(r'\bid\s*=\s*["\']([^"\']+)["\']', re.I)
ref_re = re.compile(r'\b(?:src|href)\s*=\s*["\']([^"\']+)["\']', re.I)
duplicate_pages = []
missing_viewport = []
broken_refs = []
for path in public.rglob('*.html'):
    text = path.read_text(encoding='utf-8-sig', errors='replace')
    ids = id_re.findall(text)
    duplicates = sorted(k for k, n in collections.Counter(ids).items() if n > 1)
    if duplicates:
        duplicate_pages.append({'path': path.relative_to(root).as_posix(), 'ids': duplicates})
    if not re.search(r'<meta\s+name=["\']viewport["\']', text, re.I):
        missing_viewport.append(path.relative_to(root).as_posix())
    for ref in ref_re.findall(text):
        if not ref or ref.startswith(('#', 'http://', 'https://', 'data:', 'mailto:', 'tel:', 'javascript:')):
            continue
        clean = ref.split('?', 1)[0].split('#', 1)[0]
        if not clean or '{{' in clean or '${' in clean:
            continue
        target = (public / clean.lstrip('/')) if clean.startswith('/') else (path.parent / clean)
        if not target.exists():
            broken_refs.append({'page': path.relative_to(root).as_posix(), 'ref': ref})
if duplicate_pages:
    observations.append({'severity': 'accessibility', 'code': 'duplicate-html-ids', 'count': len(duplicate_pages), 'items': duplicate_pages[:50]})
if missing_viewport:
    observations.append({'severity': 'responsive', 'code': 'missing-viewport', 'count': len(missing_viewport), 'items': missing_viewport})
if broken_refs:
    observations.append({'severity': 'reliability', 'code': 'missing-static-references', 'count': len(broken_refs), 'items': broken_refs[:100]})

# No retained workflow may depend on an obsolete branch.
workflow_refs = []
branch_pattern = re.compile(r'(?:safe-v\d+[-A-Za-z0-9_./]*|(?:release|rollback|fix)/[-A-Za-z0-9_./]+|v16-delivery-source-final|deploy-v21-production-trigger|__no_create__)')
workflow_root = root / '.github/workflows'
remaining_workflows = []
if workflow_root.exists():
    for path in sorted(workflow_root.glob('*.y*ml')):
        remaining_workflows.append(path.relative_to(root).as_posix())
        refs = sorted(set(branch_pattern.findall(path.read_text(encoding='utf-8', errors='replace'))))
        if refs:
            workflow_refs.append({'path': path.relative_to(root).as_posix(), 'references': refs})
if workflow_refs:
    critical.append({'code': 'workflow-depends-on-obsolete-branch', 'items': workflow_refs})

tracked_node = subprocess.check_output(['git', 'ls-files', 'node_modules'], text=True).splitlines()
if tracked_node:
    critical.append({'code': 'tracked-node-modules-remain', 'count': len(tracked_node)})

large = []
for path in public.rglob('*'):
    if path.is_file() and path.stat().st_size > 8 * 1024 * 1024:
        large.append({'path': path.relative_to(root).as_posix(), 'bytes': path.stat().st_size})
if large:
    observations.append({'severity': 'performance', 'code': 'large-static-payloads', 'count': len(large), 'items': sorted(large, key=lambda x: -x['bytes'])[:50]})

remote_heads = subprocess.check_output(['git', 'ls-remote', '--heads', 'origin'], text=True).splitlines()
remote_branches = sorted(line.split('refs/heads/', 1)[1] for line in remote_heads if 'refs/heads/' in line)
non_main = [name for name in remote_branches if name != 'main']
observations.append({
    'severity': 'repository',
    'code': 'non-main-branches-not-deleted-in-this-pass',
    'count': len(non_main),
    'items': non_main,
})

summary.update({
    'criticalCount': len(critical),
    'observationCount': len(observations),
    'invalidJsonCount': len(json_errors),
    'duplicateIdPages': len(duplicate_pages),
    'missingViewportPages': len(missing_viewport),
    'brokenStaticReferences': len(broken_refs),
    'largeStaticFiles': len(large),
    'remainingWorkflowFiles': len(remaining_workflows),
    'trackedNodeModules': len(tracked_node),
    'remoteBranches': len(remote_branches),
    'nonMainBranches': len(non_main),
})
audit = {
    'release': release,
    'state': 'fail' if critical else 'pass-with-observations',
    'auditedAt': datetime.now(timezone.utc).isoformat(),
    'summary': summary,
    'criticalFindings': critical,
    'observations': observations,
    'remainingWorkflows': remaining_workflows,
    'branchDeletionPerformed': False,
}
out = public / 'data/v22-post-cleanup-audit.json'
out.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
md = [
    '# V22 最终清理后缺陷审计', '',
    f"状态：**{audit['state']}**", '',
    f"发布标识：`{release}`", '',
    '## 阻断项', '',
]
if critical:
    for item in critical:
        md.append(f"- `{item['code']}`")
else:
    md.append('- 无。')
md += ['', '## 保留观察项', '']
for item in observations:
    md.append(f"- **{item['severity']} / {item['code']}**：{item.get('count', 1)}")
md += [
    '', '## 结论', '',
    '- 汉堡菜单、标题移除、标题权威层、数字排序、静态资源和浏览器验收属于本次发布阻断合同。',
    '- 大型静态 JSON、历史伪 JSON、重复 ID 或失效引用若存在，均保留在结构化报告中，未被隐藏。',
    '- 远程非 main 分支只盘点、不在本次执行中删除。',
    '',
]
(root / 'docs/V22_POST_CLEANUP_AUDIT.md').write_text('\n'.join(md), encoding='utf-8')
if critical:
    raise SystemExit(json.dumps(critical, ensure_ascii=False))
PY

# Local browser acceptance of the cleaned worktree.
python -m http.server 4173 --directory public >/tmp/v22-ultimate-http.log 2>&1 &
server_pid=$!
for _ in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:4173/ >/dev/null; then break; fi
  sleep 1
done
BASE_URL=http://127.0.0.1:4173 \
CHROME_PATH="$chrome" \
ARTIFACT_DIR="$local_dir" \
node "$node_dir/smoke.mjs"
kill "$server_pid" 2>/dev/null || true
wait "$server_pid" 2>/dev/null || true

# Commit the cleaned, locally accepted state.
git add -A
if ! git diff --cached --quiet; then
  git commit -m 'Finalize V22 product and remove obsolete release machinery'
  git push origin HEAD:main
fi
remote_changed=true
product_sha="$(git rev-parse HEAD)"

# Wait for the exact cleaned build.
served=false
for attempt in $(seq 1 180); do
  token="${GITHUB_RUN_ID:-ultimate}-${attempt}-$(date +%s%N)"
  index="$(curl -LfsS -H 'Cache-Control: no-cache, no-store' "$base_url/?v22ultimate=$token" || true)"
  report="$(curl -LfsS -H 'Cache-Control: no-cache, no-store' "$base_url/data/story-title-authority-report-v22.json?v22ultimate=$token" || true)"
  audit="$(curl -LfsS -H 'Cache-Control: no-cache, no-store' "$base_url/data/v22-post-cleanup-audit.json?v22ultimate=$token" || true)"
  css="$(curl -LfsS -H 'Cache-Control: no-cache, no-store' "$base_url/myfile/v22-menu-fixes.css?v22ultimate=$token" || true)"
  if grep -Fq "$release" <<<"$index" \
    && grep -Fq "$release" <<<"$report" \
    && grep -Fq 'pass-with-observations' <<<"$audit" \
    && grep -Fq 'width: max-content !important' <<<"$css"; then
    served=true
    break
  fi
  sleep 10
done
[[ "$served" == true ]]

BASE_URL="$base_url" \
CHROME_PATH="$chrome" \
ARTIFACT_DIR="$production_dir" \
node "$node_dir/smoke.mjs"

# Final immutable state record. It explicitly distinguishes completed work from the
# excluded branch-deletion operation.
PRODUCT_SHA="$product_sha" python - <<'PY'
import json, os, subprocess
from datetime import datetime, timezone
from pathlib import Path
release = 'v22-authoritative-localization-20260820'
authority = json.loads(Path('public/data/story-title-authority-report-v22.json').read_text(encoding='utf-8'))
cleanup = json.loads(Path('public/data/v22-post-cleanup-audit.json').read_text(encoding='utf-8'))
local = json.loads(Path('/tmp/v22-ultimate-local/core-acceptance.json').read_text(encoding='utf-8'))
production = json.loads(Path('/tmp/v22-ultimate-production/core-acceptance.json').read_text(encoding='utf-8'))
removed = json.loads(Path('/tmp/v22-ultimate/removed-files.json').read_text(encoding='utf-8'))
state = {
    'release': release,
    'state': 'pass',
    'acceptedAt': datetime.now(timezone.utc).isoformat(),
    'runId': int(os.environ.get('GITHUB_RUN_ID', '0')),
    'productCommit': os.environ['PRODUCT_SHA'],
    'production': 'https://magireco-call-search-cn.pages.dev',
    'completed': {
        'authoritativeTitleLocalization': True,
        'missingAuthorityList': True,
        'naturalNoNumberSorting': True,
        'topTitleRemoved': True,
        'intrinsicWidthHamburgerMenu': True,
        'documentScrollPreserved': True,
        'rightQuickControlsPreserved': True,
        'obsoleteBranchDependentWorkflowsRemoved': True,
        'trackedNodeModulesRemoved': cleanup['summary']['trackedNodeModules'] == 0,
        'localBrowserAcceptance': local.get('state') == 'pass',
        'productionBrowserAcceptance': production.get('state') == 'pass',
        'postCleanupDefectAudit': cleanup.get('state') == 'pass-with-observations',
    },
    'authority': {
        'uniqueTranslations': authority['uniqueTranslations'],
        'missingAuthoritativeCount': authority['missingAuthoritativeCount'],
        'displayStillContainsKanaCount': authority['displayStillContainsKanaCount'],
        'counts': authority['counts'],
    },
    'postCleanupAudit': cleanup,
    'localBrowserAcceptance': local,
    'productionBrowserAcceptance': production,
    'removedObsoleteFiles': removed,
    'branchDeletion': {
        'performed': False,
        'remainingNonMainBranches': cleanup['summary']['nonMainBranches'],
        'reason': 'Explicitly excluded from the completion scope of this pass.',
    },
}
Path('public/data/v22-final-state.json').write_text(json.dumps(state, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
Path('/tmp/v22-ultimate/status.json').write_text(json.dumps(state, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
PY

git add public/data/v22-final-state.json
if ! git diff --cached --quiet; then
  git commit -m 'Record final V22 accepted state'
  git push origin HEAD:main
fi
final_sha="$(git rev-parse HEAD)"

# Confirm the final proof commit, not merely the preceding product commit, is live.
for attempt in $(seq 1 180); do
  token="${GITHUB_RUN_ID:-ultimate}-proof-${attempt}-$(date +%s%N)"
  final="$(curl -LfsS -H 'Cache-Control: no-cache, no-store' "$base_url/data/v22-final-state.json?v22proof=$token" || true)"
  if grep -Fq '"state": "pass"' <<<"$final" && grep -Fq "$release" <<<"$final"; then
    break
  fi
  if [[ "$attempt" -eq 180 ]]; then
    echo 'Timed out waiting for the final V22 state record.' >&2
    exit 1
  fi
  sleep 10
done

remote_changed=false
trap - EXIT
printf 'V22 ultimate final state accepted at %s\n' "$final_sha"
