#!/usr/bin/env bash
set -Eeuo pipefail

release='v22-authoritative-localization-20260820'
base_url='https://magireco-call-search-cn.pages.dev'
root="$(pwd)"
base_sha="$(git rev-parse HEAD)"
pushed=false
product_sha="$base_sha"
status_dir='/tmp/v22-final-release'
local_dir='/tmp/v22-local-acceptance'
production_dir='/tmp/v22-production-acceptance'
mkdir -p "$status_dir" "$local_dir" "$production_dir"

rollback() {
  code=$?
  if [[ "$code" -ne 0 && "$pushed" == true ]]; then
    echo "V22 release failed after pushing; restoring $base_sha" >&2
    git fetch origin main || true
    lease="$(git rev-parse origin/main 2>/dev/null || true)"
    if [[ -n "$lease" ]]; then
      git push --force-with-lease=refs/heads/main:"$lease" origin "$base_sha":refs/heads/main || true
    fi
  fi
  if [[ "$code" -ne 0 ]]; then
    python - "$code" "$base_sha" "$product_sha" <<'PY' || true
import json, sys
from datetime import datetime, timezone
from pathlib import Path
Path('/tmp/v22-final-release/status.json').write_text(json.dumps({
    'release': 'v22-authoritative-localization-20260820',
    'state': 'fail',
    'exitCode': int(sys.argv[1]),
    'baseCommit': sys.argv[2],
    'productCommit': sys.argv[3],
    'at': datetime.now(timezone.utc).isoformat(),
}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
PY
  fi
  exit "$code"
}
trap rollback EXIT

echo '== Clone authoritative sources =='
rm -rf _sources
mkdir -p _sources

git clone --depth 1 --filter=blob:none --sparse \
  https://github.com/HiiragiNemu/magireco-cn-patch.git \
  _sources/magireco-cn-patch
git -C _sources/magireco-cn-patch sparse-checkout set magica/js/libs

git clone --depth 1 --filter=blob:none --sparse \
  https://github.com/HiiragiNemu/magi-reader.git \
  _sources/magi-reader
git -C _sources/magi-reader sparse-checkout set --no-cone \
  '/website/public/story_index.json' \
  '/website/public/data/titles.json' \
  '/artifacts/' \
  '**/titles.json' \
  '**/*title*.json' \
  '**/*story*index*.json' \
  '**/*dictionary*.json' \
  '**/*manifest*.json'

if [[ -n "${WIKI_TOKEN:-}" ]]; then
  wiki_url="https://x-access-token:${WIKI_TOKEN}@github.com/HiiragiNemu/magireco-wiki-data.git"
  if git clone --depth 1 --filter=blob:none --sparse "$wiki_url" _sources/magireco-wiki-data; then
    git -C _sources/magireco-wiki-data sparse-checkout set \
      data/characters.json data/memoria.json data/story.json data/pages_index.json
    git -C _sources/magireco-wiki-data remote set-url origin https://github.com/HiiragiNemu/magireco-wiki-data.git
  else
    rm -rf _sources/magireco-wiki-data
    echo 'Structured Wiki checkout unavailable; continuing with the curated Wiki seed.'
  fi
fi

echo '== Validate and build =='
python -m py_compile \
  scripts/build-authoritative-localization-v22.py \
  scripts/run-v22-authoritative-safe-v2.py
node --check .automation/v22-production-smoke.mjs
python -m pip install --quiet openpyxl
python scripts/run-v22-authoritative-safe-v2.py

# Remove superseded one-shot workflows and their triggers. The final workflow and
# reusable source/audit scripts remain on main.
rm -f \
  .github/workflows/v22-authoritative-main.yml \
  .github/workflows/v22-authoritative-safe-main.yml \
  .github/workflows/v22-final-main-acceptance.yml \
  .deploy-v22-trigger \
  .deploy-v22-safe-trigger \
  .deploy-v22-final-trigger \
  .automation/v22-write-probe.txt \
  scripts/run-v22-authoritative-safe.py

echo '== JavaScript syntax audit =='
failed=0
while IFS= read -r -d '' file; do
  if ! node --check "$file" > /tmp/v22-node-check.log 2>&1; then
    echo "JavaScript syntax failure: $file" >&2
    cat /tmp/v22-node-check.log >&2
    failed=1
  fi
done < <(find public -type f -name '*.js' -size -8M -print0)
[[ "$failed" -eq 0 ]]

echo '== Isolated browser environment =='
rm -rf /tmp/v22-node "$local_dir" "$production_dir"
mkdir -p /tmp/v22-node "$local_dir" "$production_dir"
cp .automation/v22-production-smoke.mjs /tmp/v22-node/smoke.mjs
printf '{"type":"module","private":true}\n' > /tmp/v22-node/package.json
npm install --prefix /tmp/v22-node --no-package-lock --no-save puppeteer-core@24.16.0
chrome="$(command -v google-chrome-stable || command -v google-chrome || command -v chromium-browser || command -v chromium)"
[[ -n "$chrome" ]]

echo '== Local browser acceptance =='
python -m http.server 4173 --directory public > /tmp/v22-http.log 2>&1 &
server_pid=$!
for _ in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:4173/ > /dev/null; then break; fi
  sleep 1
done
BASE_URL=http://127.0.0.1:4173 \
CHROME_PATH="$chrome" \
ARTIFACT_DIR="$local_dir" \
node /tmp/v22-node/smoke.mjs
kill "$server_pid" 2>/dev/null || true
wait "$server_pid" 2>/dev/null || true

echo '== Commit locally accepted product =='
rm -rf _sources
git config user.name github-actions[bot]
git config user.email 41898282+github-actions[bot]@users.noreply.github.com
git add -A
if ! git diff --cached --quiet; then
  git commit -m 'Complete V22 authoritative localization and site repair'
  git push origin HEAD:main
  pushed=true
fi
product_sha="$(git rev-parse HEAD)"

echo '== Wait for Cloudflare Pages =='
served=false
for attempt in $(seq 1 180); do
  token="${GITHUB_RUN_ID:-manual}-${attempt}-$(date +%s%N)"
  index="$(curl -LfsS -H 'Cache-Control: no-cache, no-store' "$base_url/?v22final=$token" || true)"
  report="$(curl -LfsS -H 'Cache-Control: no-cache, no-store' "$base_url/data/story-title-authority-report-v22.json?v22final=$token" || true)"
  css="$(curl -LfsS -H 'Cache-Control: no-cache, no-store' "$base_url/myfile/v22-menu-fixes.css?v22final=$token" || true)"
  groups_head="$(curl -LfsS -H 'Cache-Control: no-cache, no-store' "$base_url/downloads/story-title-groups.json?v22final=$token" 2>/dev/null | head -c 1 || true)"
  if grep -Fq "$release" <<<"$index" \
    && grep -Fq "$release" <<<"$report" \
    && grep -Fq "$release" <<<"$css" \
    && [[ "$groups_head" == '{' || "$groups_head" == '[' ]]; then
    served=true
    break
  fi
  sleep 10
done
[[ "$served" == true ]]

echo '== Production browser acceptance =='
BASE_URL="$base_url" \
CHROME_PATH="$chrome" \
ARTIFACT_DIR="$production_dir" \
node /tmp/v22-node/smoke.mjs

echo '== Record final proof =='
PRODUCT_SHA="$product_sha" python - <<'PY'
import json, os
from datetime import datetime, timezone
from pathlib import Path
acceptance = json.loads(Path('/tmp/v22-production-acceptance/acceptance.json').read_text(encoding='utf-8'))
authority = json.loads(Path('public/data/story-title-authority-report-v22.json').read_text(encoding='utf-8'))
audit = json.loads(Path('public/data/v22-site-audit.json').read_text(encoding='utf-8'))
proof = {
    'release': 'v22-authoritative-localization-20260820',
    'state': 'pass',
    'acceptedAt': datetime.now(timezone.utc).isoformat(),
    'runId': int(os.environ.get('GITHUB_RUN_ID', '0')),
    'productCommit': os.environ['PRODUCT_SHA'],
    'production': 'https://magireco-call-search-cn.pages.dev',
    'localAndProductionBrowserAcceptance': True,
    'missingAuthoritativeCount': authority['missingAuthoritativeCount'],
    'displayStillContainsKanaCount': authority['displayStillContainsKanaCount'],
    'authorityCounts': authority['counts'],
    'siteAuditSummary': audit['summary'],
    'browserWarnings': acceptance.get('warnings', []),
}
Path('public/data/v22-final-acceptance.json').write_text(
    json.dumps(proof, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'
)
Path('/tmp/v22-final-release/status.json').write_text(
    json.dumps(proof, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'
)
PY

git add public/data/v22-final-acceptance.json
if ! git diff --cached --quiet; then
  git commit -m 'Record final V22 production acceptance'
  git push origin HEAD:main
fi
product_sha="$(git rev-parse HEAD)"
pushed=false
trap - EXIT
printf 'V22 accepted at %s\n' "$product_sha"
