# Call theme successor verification

## Baseline
- Repository: `main@e5ecc9f145ec64a079f9c1d5110f155ed795e1c4` (clean before edit)
- Original `public/myfile/theme-mode-v1.js` SHA-256: `BA1CC8E3751825B998AE8FB36AA5AB7E8E6AE7034FC29FF54B9673DEA5681F3A`
- Command: `node scripts/validate-site.js`
- Exit: `0`
- Literal output: `Static V26 validation passed for v26-converged-20260822: 186 characters, 5826 titles.`

## Modified source
- Changed branch: shared theme bootstrap in `public/myfile/theme-mode-v1.js`; when `document.body` exists it calls `install()` synchronously instead of waiting for `DOMContentLoaded`.
- Cache boundary: all ten HTML references now use `theme-mode-v1.js?v=20260906` (previous `20260828`).
- Modified SHA-256: `C452AFD98C75E61CB71040235F934B1F79A0C9ECFB8E05997D878DDD4DA3487F`
- Command: `node scripts/validate-site.js`
- Exit: `0`
- Literal output: `Static V26 validation passed for v26-converged-20260822: 186 characters, 5826 titles.`
- Command: `node --test tests/*.test.mjs`
- Exit: `0`
- Literal output: `12 tests, 12 pass, 0 fail; V26 story sprite bridge tests passed.`

## Deployment and served-file check
- Command: `npx wrangler pages deploy public --project-name magireco-call-search-cn --branch main --commit-dirty=true`
- Exit: `0`
- Literal output: `Deployment complete! Take a peek over at https://e40db262.magireco-call-search-cn.pages.dev`
- Command: `Invoke-WebRequest https://e40db262.magireco-call-search-cn.pages.dev/{story.html,?callTheme=1,myfile/theme-mode-v1.js?v=20260906}`
- Exit: `0`
- Literal result: story `200`, root `200`, script `200`; both HTML pages reference `v20260906`; served script contains `if (document.body) {`.

## Browser acceptance
- Desktop viewport `1440x1000`, wait `>=2500ms`: root after story toggle/return has `localStorage('magireco-call-theme-v1')=dark`, `data-call-theme=dark`, button `aria-label=切换至日间模式`, `pageErrors=0`, `requestFailures=0`.
- Mobile viewport `390x844`, same flow and assertions: `PASS` (owner-run regression; no page errors/request failures).

## Rollback
- Command: `powershell -NoProfile -ExecutionPolicy Bypass -File reports/call-theme-successor-20260906/rollback.ps1 -TargetRoot reports/call-theme-successor-20260906/rollback-fixture`
- Exit: `0`
- Literal output: `ThemeSha256=BA1CC8E3751825B998AE8FB36AA5AB7E8E6AE7034FC29FF54B9673DEA5681F3A; RestoredScriptRefs=2`.

## Stable-domain command-line recheck (2026-09-06)
- Command: `node reports/call-theme-successor-20260906/stable-domain-recheck.mjs`
- Exit: `0`
- Artifact: `stable-domain-recheck.json`
- Result: `magireco-call-search-cn.pages.dev` story/root/script all HTTP 200; desktop `1440x1000` and mobile `390x844` flows both PASS with stored `dark`, root `data-call-theme=dark`, root button `aria-label=切换至日间模式`, `pageErrors=[]`, `requestFailures=[]`.
