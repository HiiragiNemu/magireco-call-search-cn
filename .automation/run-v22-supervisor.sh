#!/usr/bin/env bash
set -Eeuo pipefail

release='v22-authoritative-localization-20260820'
base_url='https://magireco-call-search-cn.pages.dev'
root="$(pwd)"
base_sha="$(git rev-parse HEAD)"
pushed=false
status_dir='/tmp/v22-supervisor'
local_dir='/tmp/v22-supervisor-local'
production_dir='/tmp/v22-supervisor-production'
mkdir -p "$status_dir" "$local_dir" "$production_dir"

rollback() {
  code=$?
  if [[ "$code" -ne 0 && "$pushed" == true ]]; then
    git fetch origin main || true
    lease="$(git rev-parse origin/main 2>/dev/null || true)"
    if [[ -n "$lease" ]]; then
      git push --force-with-lease=refs/heads/main:"$lease" origin "$base_sha":refs/heads/main || true
    fi
  fi
  if [[ "$code" -ne 0 ]]; then
    printf '{"release":"%s","state":"fail","exitCode":%s,"baseCommit":"%s"}\n' \
      "$release" "$code" "$base_sha" > "$status_dir/status.json"
  fi
  exit "$code"
}
trap rollback EXIT

git config user.name github-actions[bot]
git config user.email 41898282+github-actions[bot]@users.noreply.github.com

proof_ok=false
if [[ -f public/data/v22-final-acceptance.json ]]; then
  if python - <<'PY'
import json
from pathlib import Path
p = json.loads(Path('public/data/v22-final-acceptance.json').read_text(encoding='utf-8'))
raise SystemExit(0 if p.get('release') == 'v22-authoritative-localization-20260820' and p.get('state') == 'pass' else 1)
PY
  then
    token="supervisor-$(date +%s%N)"
    if curl -LfsS -H 'Cache-Control: no-cache, no-store' "$base_url/?v22supervisor=$token" | grep -Fq "$release"; then
      proof_ok=true
    fi
  fi
fi

cleanup_superseded() {
  rm -f \
    .github/workflows/v22-authoritative-main.yml \
    .github/workflows/v22-authoritative-safe-main.yml \
    .github/workflows/v22-final-main-acceptance.yml \
    .github/workflows/v22-force-final-main.yml \
    .deploy-v22-trigger \
    .deploy-v22-safe-trigger \
    .deploy-v22-final-trigger \
    .deploy-v22-force-final-trigger \
    .automation/v22-write-probe.txt \
    scripts/run-v22-authoritative-safe.py
}

if [[ "$proof_ok" == true ]]; then
  cleanup_superseded
  git add -A
  if ! git diff --cached --quiet; then
    git commit -m 'Remove superseded V22 one-shot workflows'
    git push origin HEAD:main
  fi
  cp public/data/v22-final-acceptance.json "$status_dir/status.json"
  trap - EXIT
  exit 0
fi

echo 'Accepted V22 proof is absent; starting supervised rebuild.'
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
  fi
fi

python -m py_compile \
  scripts/build-authoritative-localization-v22.py \
  scripts/run-v22-authoritative-safe-v2.py \
  scripts/prepare-v22-offline-fallback.py
node --check .automation/v22-core-smoke.mjs
python -m pip install --quiet openpyxl

if ! V22_MAX_MACHINE_TRANSLATIONS=3000 python scripts/run-v22-authoritative-safe-v2.py; then
  echo 'Network fallback was insufficient; preparing offline lowest-priority cache.'
  python -m pip install --quiet torch --index-url https://download.pytorch.org/whl/cpu
  python -m pip install --quiet 'transformers>=4.44,<5' sentencepiece sacremoses
  python scripts/prepare-v22-offline-fallback.py
  V22_MAX_MACHINE_TRANSLATIONS=0 python scripts/run-v22-authoritative-safe-v2.py
fi

cleanup_superseded

failed=0
for file in public/myfile/v22-runtime-fixes.js; do
  node --check "$file" || failed=1
done
[[ "$failed" -eq 0 ]]

rm -rf /tmp/v22-supervisor-node "$local_dir" "$production_dir"
mkdir -p /tmp/v22-supervisor-node "$local_dir" "$production_dir"
cp .automation/v22-core-smoke.mjs /tmp/v22-supervisor-node/smoke.mjs
printf '{"type":"module","private":true}\n' > /tmp/v22-supervisor-node/package.json
npm install --prefix /tmp/v22-supervisor-node --no-package-lock --no-save puppeteer-core@24.16.0
chrome="$(command -v google-chrome-stable || command -v google-chrome || command -v chromium-browser || command -v chromium)"
[[ -n "$chrome" ]]

python -m http.server 4173 --directory public >/tmp/v22-supervisor-http.log 2>&1 &
server_pid=$!
for _ in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:4173/ >/dev/null; then break; fi
  sleep 1
done
BASE_URL=http://127.0.0.1:4173 \
CHROME_PATH="$chrome" \
ARTIFACT_DIR="$local_dir" \
node /tmp/v22-supervisor-node/smoke.mjs
kill "$server_pid" 2>/dev/null || true
wait "$server_pid" 2>/dev/null || true

rm -rf _sources
git add -A
if ! git diff --cached --quiet; then
  git commit -m 'Complete supervised V22 localization release'
  git push origin HEAD:main
  pushed=true
fi
product_sha="$(git rev-parse HEAD)"

served=false
for attempt in $(seq 1 180); do
  token="${GITHUB_RUN_ID:-supervisor}-${attempt}-$(date +%s%N)"
  index="$(curl -LfsS -H 'Cache-Control: no-cache, no-store' "$base_url/?v22supervisor=$token" || true)"
  report="$(curl -LfsS -H 'Cache-Control: no-cache, no-store' "$base_url/data/story-title-authority-report-v22.json?v22supervisor=$token" || true)"
  css="$(curl -LfsS -H 'Cache-Control: no-cache, no-store' "$base_url/myfile/v22-menu-fixes.css?v22supervisor=$token" || true)"
  if grep -Fq "$release" <<<"$index" && grep -Fq "$release" <<<"$report" && grep -Fq "$release" <<<"$css"; then
    served=true
    break
  fi
  sleep 10
done
[[ "$served" == true ]]

BASE_URL="$base_url" \
CHROME_PATH="$chrome" \
ARTIFACT_DIR="$production_dir" \
node /tmp/v22-supervisor-node/smoke.mjs

PRODUCT_SHA="$product_sha" python - <<'PY'
import json, os
from datetime import datetime, timezone
from pathlib import Path
core = json.loads(Path('/tmp/v22-supervisor-production/core-acceptance.json').read_text(encoding='utf-8'))
authority = json.loads(Path('public/data/story-title-authority-report-v22.json').read_text(encoding='utf-8'))
audit = json.loads(Path('public/data/v22-site-audit.json').read_text(encoding='utf-8'))
proof = {
    'release': 'v22-authoritative-localization-20260820',
    'state': 'pass',
    'acceptedAt': datetime.now(timezone.utc).isoformat(),
    'runId': int(os.environ.get('GITHUB_RUN_ID', '0')),
    'productCommit': os.environ['PRODUCT_SHA'],
    'production': 'https://magireco-call-search-cn.pages.dev',
    'localAndProductionCoreAcceptance': True,
    'missingAuthoritativeCount': authority['missingAuthoritativeCount'],
    'displayStillContainsKanaCount': authority['displayStillContainsKanaCount'],
    'authorityCounts': authority['counts'],
    'siteAuditSummary': audit['summary'],
    'coreObservations': core.get('observations', []),
}
Path('public/data/v22-final-acceptance.json').write_text(json.dumps(proof, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
Path('/tmp/v22-supervisor/status.json').write_text(json.dumps(proof, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
PY

git add public/data/v22-final-acceptance.json
if ! git diff --cached --quiet; then
  git commit -m 'Record supervised V22 production acceptance'
  git push origin HEAD:main
fi
pushed=false
trap - EXIT
