# Download the Microsoft Rocketbox motion-capture clips listed in tools/roster/rocketbox/clips.json (MIT license,
# https://github.com/microsoft/Microsoft-Rocketbox) into tools/roster/rocketbox/, plus the license text. Existing files
# are skipped. Git LFS media URL first, raw.githubusercontent.com as the fallback (the clips are plain git blobs).
#   powershell -ExecutionPolicy Bypass -File tools/roster/fetch-rocketbox.ps1 [-Force]
param( [switch] $Force )
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Dir = Join-Path $PSScriptRoot 'rocketbox'
$Manifest = Get-Content -Raw (Join-Path $Dir 'clips.json') | ConvertFrom-Json
$Repo = 'microsoft/Microsoft-Rocketbox/master'
function Get-Repo( [string] $path, [string] $out ) {
	$u = ($path -replace ' ', '%20')
	foreach ($base in @('https://media.githubusercontent.com/media/', 'https://raw.githubusercontent.com/')) {
		try {
			Invoke-WebRequest -UseBasicParsing -Uri "$base$Repo/$u" -OutFile $out -ErrorAction Stop
			if ((Get-Item $out).Length -gt 1024) { return $true }   # an LFS pointer is ~130 bytes
		} catch { }
	}
	if (Test-Path $out) { Remove-Item $out -Force }
	return $false
}
$got = 0; $have = 0; $failed = @()
$lic = Join-Path $Dir 'LICENSE.md'
if ($Force -or -not (Test-Path $lic)) { if (-not (Get-Repo 'LICENSE.md' $lic)) { $failed += 'LICENSE.md' } }
foreach ($c in $Manifest.clips) {
	$f = "$($c.file).max.fbx"
	$out = Join-Path $Dir $f
	if (-not $Force -and (Test-Path $out) -and (Get-Item $out).Length -gt 1024) { $have++; continue }
	if (Get-Repo "Assets/Animations/all_animations_max_motextr_$($c.set)/$f" $out) { $got++; Write-Host "fetched $f" } else { $failed += $f }
}
Write-Host "Rocketbox clips: $got fetched, $have already present, $($failed.Count) failed"
if ($failed.Count -gt 0) { Write-Host ("FAILED: " + ($failed -join ', ')); exit 1 }
