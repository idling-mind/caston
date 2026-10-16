# Vendors Google Font latin subsets into static/vendor/fonts and emits a local fonts.css
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$root    = Split-Path -Parent $PSScriptRoot
$fontDir = Join-Path $root 'static\vendor\fonts'
New-Item -ItemType Directory -Force -Path $fontDir | Out-Null

$ua  = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
$url = 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400..700&family=Inter:wght@400..800&display=swap'
$css = (Invoke-WebRequest -Uri $url -UserAgent $ua -TimeoutSec 30).Content

# Split into @font-face blocks, keep only the latin subset (unicode-range containing U+0000-00FF)
$blocks = [regex]::Matches($css, '@font-face\s*\{[^}]*\}')
$out = New-Object System.Collections.Generic.List[string]

foreach ($b in $blocks) {
    $text = $b.Value
    if ($text -notmatch 'U\+0000-00FF') { continue }

    $family = [regex]::Match($text, "font-family:\s*'([^']+)'").Groups[1].Value
    $weight = [regex]::Match($text, 'font-weight:\s*([0-9 ]+);').Groups[1].Value.Trim()
    $src    = [regex]::Match($text, 'url\((https://[^)]+\.woff2)\)').Groups[1].Value
    if (-not $src) { continue }

    $slug = ($family -replace '\s+', '') + '-' + ($weight -replace '\s+', '_')
    $file = "$slug.woff2"
    Invoke-WebRequest -Uri $src -OutFile (Join-Path $fontDir $file) -UserAgent $ua -TimeoutSec 30

    $out.Add(@"
@font-face {
  font-family: '$family';
  font-style: normal;
  font-weight: $weight;
  font-display: swap;
  src: url('./$file') format('woff2');
}

"@)
    Write-Host "saved $file"
}

Set-Content -Path (Join-Path $fontDir 'fonts.css') -Value ($out -join '') -Encoding UTF8
Write-Host "Wrote fonts.css"
