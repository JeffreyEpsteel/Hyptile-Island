# Wave 18E: put the animation-library clips into the committed roster GLBs without touching anything else. Per character:
# build into a scratch folder (build.ps1 -SkipRetarget -NoPost: the Rocketbox takes of rocketbox/clips.json already retargeted
# into retargeted/, plus the per-character Kimodo Sit_Ground), splice ONLY the named clips into public/models/roster/<id>.glb
# (splice-clips.mjs), then run post-clips.mjs on the committed GLB once (the seat legs and chaining, the baked pose clips).
# One Blender job at a time (Blender is shared). Retarget first when clips.json changed:
#   blender -b --python tools/roster/retarget.py -- <SK_Hyptile_Eyes.fbx> tools/roster/retargeted --only A,B <Name=clip.fbx|opts> ...
#   powershell -ExecutionPolicy Bypass -File tools/roster/anim-splice.ps1 [-Only hyptile,clown] [-Clips A,B] [-NoPost]
param(
	[string[]]$Only = @('hyptile', 'pepe', 'doge', 'bonk', 'pengu', 'clown', 'bravile', 'heptyle'),
	[string[]]$Clips = @('Sit_Chair', 'Sit_Chair_Idle', 'Stand_From_Chair', 'Sit_Down', 'Stand_Up', 'Drink', 'Eat', 'Crouch', 'Kneel_Work',
		'Talk_Group', 'Clap', 'Point_Out', 'Fish_Net', 'Drunk_Walk', 'Walk_Tired', 'Turn_Left', 'Turn_Right', 'Dance_2', 'Sit_Ground'),
	[string]$Scratch = "$env:TEMP\hyptile-anim-splice",
	[switch]$NoPost
)
$ErrorActionPreference = 'Continue' # (native stderr through 2>&1 must not abort a build)
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$Clips = @($Clips | ForEach-Object { $_ -split ',' } | Where-Object { $_ })
$Only = @($Only | ForEach-Object { $_ -split ',' } | Where-Object { $_ })
foreach ($id in $Only) {
	$out = Join-Path $Scratch $id
	New-Item -ItemType Directory -Force $out | Out-Null
	$built = Join-Path $out "$id.glb"
	if (Test-Path $built) { Remove-Item $built } # never splice a stale build
	Write-Host "== $id"
	& powershell -ExecutionPolicy Bypass -File "$PSScriptRoot\build.ps1" -SkipRetarget -NoPost -Only $id -OutDir $out -PortraitDir $out 2>&1 |
		Select-String -Pattern 'EXPORTED|NO ACTION|Error|Traceback' | ForEach-Object { "  " + $_.Line }
	if (-not (Test-Path $built)) { Write-Host "  BUILD FAILED $id"; continue }
	$dst = Join-Path $Root "public\models\roster\$id.glb"
	& node "$PSScriptRoot\splice-clips.mjs" $dst $built $dst @Clips | ForEach-Object { "  " + $_ }
	if (-not $NoPost) { & node "$PSScriptRoot\post-clips.mjs" $dst $dst | ForEach-Object { "  " + $_ } }
}
