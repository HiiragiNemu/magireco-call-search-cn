param([string]$TargetRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path)
$ErrorActionPreference = 'Stop'
$original = Join-Path $PSScriptRoot 'original/theme-mode-v1.js'
$theme = Join-Path $TargetRoot 'public/myfile/theme-mode-v1.js'
if (!(Test-Path $original)) { throw "Missing original artifact: $original" }
Copy-Item -LiteralPath $original -Destination $theme -Force
Get-ChildItem -LiteralPath (Join-Path $TargetRoot 'public') -Filter '*.html' | ForEach-Object {
  $path = $_.FullName
  $text = Get-Content -LiteralPath $path -Raw
  $restored = $text.Replace('theme-mode-v1.js?v=20260906', 'theme-mode-v1.js?v=20260828')
  if ($restored -ne $text) { Set-Content -LiteralPath $path -Value $restored -NoNewline }
}
[pscustomobject]@{
  ThemeSha256 = (Get-FileHash -LiteralPath $theme -Algorithm SHA256).Hash
  RestoredScriptRefs = (Get-ChildItem -LiteralPath (Join-Path $TargetRoot 'public') -Filter '*.html' | Select-String -Pattern 'theme-mode-v1.js\?v=20260828').Count
}