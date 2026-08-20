#!/usr/bin/env bash
set -Eeuo pipefail

# The post-cleanup audit examines the Git index before the final commit. Remove the
# historical dependency tree from the index first so the audit can verify the
# intended clean state, while the child finalizer removes its working-tree copy.
cp .automation/run-v22-ultimate-finalizer.sh /tmp/run-v22-ultimate-finalizer.sh
if [[ -d node_modules ]] || git ls-files --error-unmatch node_modules >/dev/null 2>&1; then
  git rm -r --cached --ignore-unmatch node_modules >/dev/null
fi
rm -f .automation/run-v22-ultimate-finalizer-v2.sh
bash /tmp/run-v22-ultimate-finalizer.sh
