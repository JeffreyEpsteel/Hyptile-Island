# Put accepted Kimodo clips (D:\fishing game\Assets\HyptileMotion\kimodo_roster\<Clip>\<Tag>\chars\<id>.fbx, made by
# tools/kimodo_text_encoder_setup/kimodo_clip_pipeline.py in the fishing workspace) into the committed roster GLBs:
# build each character into a scratch folder with those clips as -Override, stand the swim clips up (unpitch-swim.mjs: the
# Kimodo swim takes lie prone, the game pitches upright clips itself), then splice ONLY those clips into
# public/models/roster/<id>.glb (meshes, textures and every other clip stay byte-for-byte; README "Rebased clips").
#   powershell -ExecutionPolicy Bypass -File tools/roster/kimodo-splice.ps1 -Clips Jump,Land_Soft,... [-Only hyptile,pepe] [-Tag v2]
param(
	[string[]]$Clips,
	[string[]]$Only = @('hyptile', 'pepe', 'doge', 'bonk', 'pengu', 'clown', 'bravile', 'heptyle'),
	[string]$Tag = 'v2',
	[string]$Scratch = "$env:TEMP\hyptile-kimodo-splice"
)
$ErrorActionPreference = 'Continue' # (native stderr through 2>&1 must not abort a build)
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$K = 'D:\fishing game\Assets\HyptileMotion\kimodo_roster'
$Clips = @($Clips | ForEach-Object { $_ -split ',' } | Where-Object { $_ })
$Only = @($Only | ForEach-Object { $_ -split ',' } | Where-Object { $_ })
$Swim = @($Clips | Where-Object { $_ -like 'Swim_*' })
foreach ($id in $Only) {
	$out = Join-Path $Scratch $id
	New-Item -ItemType Directory -Force $out | Out-Null
	$parts = @(); $have = @()
	foreach ($n in $Clips) {
		$f = Join-Path $K "$n\$Tag\chars\$id.fbx"
		if (Test-Path $f) { $parts += "$n=$f"; $have += $n } else { Write-Host "  ${id}: no $n ($f)" }
	}
	Write-Host "== $id ($($have.Count) clips)"
	$built = Join-Path $out "$id.glb"
	if (Test-Path $built) { Remove-Item $built } # never splice a stale build
	& powershell -ExecutionPolicy Bypass -File "$PSScriptRoot\build.ps1" -SkipRetarget -Only $id -OutDir $out -PortraitDir $out -Override ($parts -join ',') 2>&1 |
		Select-String -Pattern 'EXPORTED|Error|Traceback' | ForEach-Object { "  " + $_.Line }
	$built = Join-Path $out "$id.glb"
	if (-not (Test-Path $built)) { Write-Host "  BUILD FAILED $id"; continue }
	$swimHere = @($Swim | Where-Object { $have -contains $_ })
	if ($swimHere.Count) {
		& node "$PSScriptRoot\unpitch-swim.mjs" $built $built @swimHere | ForEach-Object { "  " + $_ }
	}
	$dst = Join-Path $Root "public\models\roster\$id.glb"
	& node "$PSScriptRoot\splice-clips.mjs" $dst $built $dst @have | ForEach-Object { "  " + $_ }
}
