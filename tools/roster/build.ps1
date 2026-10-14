# Rebuild the Hyptile Island roster (8 characters) and the fleet hulls (4 boats) from the fishing
# workspace sources with Blender 5.x. Run from the project root:
#   powershell -ExecutionPolicy Bypass -File tools/roster/build.ps1 [-Only hyptile,pepe] [-Boats] [-SkipRetarget] [-RetargetOnly]
#     [-OutDir <GLB dir>] [-PortraitDir <PNG dir>]   (defaults: public/models/roster, public/ui/roster)
# Locomotion / idle / gesture clips come from Microsoft Rocketbox mocap, retargeted onto the rig first (retarget.py,
# clip list in tools/roster/rocketbox/clips.json, files fetched by fetch-rocketbox.ps1); the rest stay authored.
param( [int] $Budget = 100000, [string[]] $Only = @(), [switch] $Boats, [switch] $NoCharacters, [switch] $SkipRetarget, [switch] $RetargetOnly, [string[]] $Override = @(),
	[string] $OutDir = '', [string] $PortraitDir = '', [switch] $NoPost )
# -Override "Name=clip.fbx",... replaces (or adds) clips by name after the Rocketbox substitution, e.g. Kimodo clips
# retargeted with retarget.py (D:\fishing game\Assets\HyptileMotion\kimodo_bip01\retargeted).
$ErrorActionPreference = 'Continue'
$Only = @($Only | ForEach-Object { $_ -split ',' } | Where-Object { $_ })
$Blender = if ($env:BLENDER) { $env:BLENDER } else { 'D:\blender\blender.exe' }
$Src = if ($env:FISHING_WORKSPACE) { $env:FISHING_WORKSPACE } else { 'D:\fishing game' }
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$A = "$Src\Assets"
$Clips = @(
	"Idle_Breathe=$Src\JadeFisher_Comfy\animations\Idle_Breathe.fbx",
	"Walk_InPlace=$Src\JadeFisher_Comfy\animations\Walk_InPlace.fbx",
	"Run_InPlace=$Src\JadeFisher_Comfy\animations\Run_InPlace.fbx",
	"Jump=$Src\JadeFisher_Comfy\animations\Jump.fbx",
	"Wave=$Src\JadeFisher_Comfy\animations\Wave.fbx",
	"Fishing_Cast=$Src\JadeFisher_Comfy\animations\Fishing_Cast.fbx",
	"Fishing_Hold=$Src\JadeFisher_Comfy\animations\Fishing_Hold.fbx",
	"Fishing_Reel=$Src\JadeFisher_Comfy\animations\Fishing_Reel.fbx",
	"Fishing_Strike=$Src\JadeFisher_Comfy\animations\Fishing_Strike.fbx",
	"Swim_Idle=$A\HyptileTraversal\animations\Swim_Idle.fbx",
	"Swim_Forward=$A\HyptileTraversal\animations\Swim_Forward.fbx",
	"Swim_Fast=$A\HyptileTraversal\animations\Swim_Fast.fbx",
	"Helm_Idle=$A\FishingFleet\animations\Helm_Idle.fbx",
	"Seated_Idle=$A\HyptileMotion\animations\Seated_Idle.fbx",
	"Catch_Celebrate=$A\HyptileMotion\animations\Catch_Celebrate.fbx",
	"Catch_Disappointed=$A\HyptileMotion\animations\Catch_Disappointed.fbx",
	"Talk=$A\HyptileMotion\animations\Talk.fbx",
	"Dance=$A\HyptileMotion\animations\Dance.fbx",
	"Look_Around=$A\HyptileIslandLife\animations\Look_Around.fbx",
	"Cheer_Clap=$A\HyptileIslandLife\animations\Cheer_Clap.fbx",
	"Friendly_Wave=$A\HyptileIslandLife\animations\Friendly_Wave.fbx",
	"Beckon=$A\HyptileIslandLife\animations\Beckon.fbx",
	"Chat_Gesture=$A\HyptileIslandLife\animations\Chat_Gesture.fbx",
	"Sweep_Work=$A\HyptileIslandLife\animations\Sweep_Work.fbx",
	"Inspect_Catch=$A\HyptileIslandLife\animations\Inspect_Catch.fbx",
	"Offer_Finger=$A\HyptileIslandLife\animations\Offer_Finger.fbx",
	"Prank_Laugh=$A\HyptileIslandLife\animations\Prank_Laugh.fbx",
	"Airborne_Tumble=$A\HyptileIslandLife\animations\Airborne_Tumble.fbx",
	"Laugh=$A\HyptileMotion\animations\Laugh.fbx",
	"Shrug=$A\HyptileMotion\animations\Shrug.fbx",
	"Point=$A\HyptileMotion\animations\Point.fbx",
	"Swagger_Idle=$A\HyptileMotion\animations\Swagger_Idle.fbx",
	"Row_Forward=$A\HyptileMotion\animations\Row_Forward.fbx",
	"Row_Backward=$A\HyptileMotion\animations\Row_Backward.fbx",
	"Paddle_Left=$A\HyptileMotion\animations\Paddle_Left.fbx",
	"Paddle_Right=$A\HyptileMotion\animations\Paddle_Right.fbx",
	"Sit_Down=$A\HyptileMotion\animations\Sit_Down.fbx",
	"Stand_Up=$A\HyptileMotion\animations\Stand_Up.fbx",
	"Steer_Left=$A\HyptileMotion\animations\Steer_Left.fbx",
	"Steer_Right=$A\HyptileMotion\animations\Steer_Right.fbx",
	"Board_Low=$A\HyptileMotion\animations\Board_Low.fbx",
	"Disembark_Low=$A\HyptileMotion\animations\Disembark_Low.fbx",
	"Fall_Loop=$A\HyptileMotion\animations\Fall_Loop.fbx",
	"Land_Soft=$A\HyptileMotion\animations\Land_Soft.fbx",
	"Stumble=$A\HyptileMotion\animations\Stumble.fbx",
	"Knockdown=$A\HyptileMotion\animations\Knockdown.fbx",
	"GetUp_Front=$A\HyptileMotion\animations\GetUp_Front.fbx",	"Hit_Reaction=$A\HyptileMotion\animations\Hit_Reaction.fbx",
	"Melee_Paddle=$A\HyptileMotion\animations\Melee_Paddle.fbx"
)
# ---- retarget stage: Rocketbox clips -> animation-only FBXs on the 48-bone rig (tools/roster/retargeted/<Name>.fbx)
$RbDir = "$PSScriptRoot\rocketbox"
$RtDir = "$PSScriptRoot\retargeted"
$RbClips = @((Get-Content -Raw "$RbDir\clips.json" | ConvertFrom-Json).clips)
if (-not $SkipRetarget -and -not $NoCharacters) {
	$missing = @($RbClips | Where-Object { -not (Test-Path "$RbDir\$($_.file).max.fbx") })
	if ($missing.Count -gt 0) { Write-Host "Rocketbox clips missing, run tools/roster/fetch-rocketbox.ps1 first"; exit 1 }
	New-Item -ItemType Directory -Force $RtDir, "$Root\test\out" | Out-Null
	$specs = @($RbClips | ForEach-Object { "$($_.name)=$RbDir\$($_.file).max.fbx|$($_.opts)" })
	$log = "$Root\tools\roster\logs\retarget.log"
	Write-Host "== retarget ($($specs.Count) clips)"
	& $Blender -b --python "$PSScriptRoot\retarget.py" -- "$A\HyptileEyes\exports\SK_Hyptile_Eyes.fbx" $RtDir @specs 2>&1 | Out-File -Encoding utf8 $log
	Select-String -Path $log -Pattern 'VALIDATE|FAILED|SUMMARY|Traceback' | ForEach-Object { $_.Line }
}
# the retargeted clips replace the authored ones of the same name
$Clips = @($Clips | ForEach-Object {
	$n = ($_ -split '=', 2)[0]
	if ($RbClips | Where-Object { $_.name -eq $n }) { if (Test-Path "$RtDir\$n.fbx") { "$n=$RtDir\$n.fbx" } else { Write-Host "no retargeted $n, keeping the authored clip"; $_ } } else { $_ }
})
# manifest clips the authored list does not have (wave 18E: the way-of-life, chair, walk and turn takes) are added
foreach ($c in $RbClips) {
	if (-not ($Clips | Where-Object { ($_ -split '=', 2)[0] -eq $c.name }) -and (Test-Path "$RtDir\$($c.name).fbx")) { $Clips += "$($c.name)=$RtDir\$($c.name).fbx" }
}
foreach ($o in @($Override | ForEach-Object { $_ -split ',' } | Where-Object { $_ })) {   # -File passes a list as one comma-joined string
	$n, $p = $o -split '=', 2
	if (-not (Test-Path $p)) { Write-Host "override $n missing: $p"; exit 1 }
	$Clips = @($Clips | Where-Object { ($_ -split '=', 2)[0] -ne $n }) + "$n=$p"
	Write-Host "override $n <- $p"
}
# clips that hold one pose and whose FBX skeleton rest is that (posed) first frame: assigned as they are they play the bind
# pose (an A) for their whole length, so convert-character.py rebases them onto the character rest (`|rebase`, rebase_action).
# Every authored clip has the same offset rest, but the others move and the game is tuned to how they play today (README,
# "Rebased clips"); env REBASE_ALL=1 rebases every clip for an experiment.
$Rebase = @('Helm_Idle', 'Seated_Idle', 'Steer_Left', 'Steer_Right', 'Fall_Loop')
$Clips = @($Clips | ForEach-Object { if ($Rebase -contains ($_ -split '=', 2)[0]) { "$_|rebase" } else { $_ } })
if ($RetargetOnly) { exit 0 }
$Chars = [ordered]@{
	hyptile = "$A\HyptileEyes\exports\SK_Hyptile_Eyes.fbx"
	pepe    = "$A\HyptileEyes\roster\Pepe\exports\SK_Pepe_Eyes.fbx"
	doge    = "$A\HyptileEyes\roster\Doge\exports\SK_Doge_Eyes.fbx"
	bonk    = "$A\HyptileEyes\roster\Bonk\exports\SK_Bonk_Eyes.fbx"
	pengu   = "$A\HyptileEyes\roster\Pengu\exports\SK_Pengu_Eyes.fbx"
	clown   = "$A\HyptileEyes\roster\Clown\exports\SK_Clown_Eyes.fbx"
	bravile = "$A\HyptileCousins\exports\SK_Bravile.fbx"
	heptyle = "$A\HyptileCousins\exports\SK_Heptyle.fbx"
}
if (-not $OutDir) { $OutDir = "$Root\public\models\roster" }
if (-not $PortraitDir) { $PortraitDir = "$Root\public\ui\roster" }
New-Item -ItemType Directory -Force $OutDir, $PortraitDir, "$Root\public\models\fleet", "$Root\tools\roster\logs" | Out-Null
if (-not $NoCharacters) {
	foreach ($id in $Chars.Keys) {
		if ($Only.Count -gt 0 -and $Only -notcontains $id) { continue }
		$log = "$Root\tools\roster\logs\$id.log"
		Write-Host "== $id"
		# per-character takes (wave 18E): Sit_Ground is the Kimodo floor sit (kimodo_roster Seated_Idle v2, rejected as a seat)
		$own = @($Clips)
		$sg = "$A\HyptileMotion\kimodo_roster\Seated_Idle\v2\chars\$id.fbx"
		if ((Test-Path $sg) -and -not ($own | Where-Object { ($_ -split '=', 2)[0] -eq 'Sit_Ground' })) { $own += "Sit_Ground=$sg" }
		& $Blender -b --python "$PSScriptRoot\convert-character.py" -- $Chars[$id] "$OutDir\$id.glb" "$PortraitDir\$id.png" $Budget @own 2>&1 | Out-File -Encoding utf8 $log
		Select-String -Path $log -Pattern 'EXPORTED|PORTRAIT|DECIMATED|DETAIL_SPLIT|KEPT|NO ACTION|REBASE|WARNING decimation|Error|Traceback' | ForEach-Object { $_.Line }
		# the leg fix, the seat chaining and the baked pose clips (tools/roster/post-clips.mjs; once per fresh GLB)
		if (-not $NoPost -and (Test-Path "$OutDir\$id.glb")) { & node "$PSScriptRoot\post-clips.mjs" "$OutDir\$id.glb" "$OutDir\$id.glb" 2>&1 | Select-String -Pattern 'POSTED|LEGS|Error' | ForEach-Object { "  " + $_.Line } }
	}
}
if ($Boats) {
	foreach ($b in @('SM_MarshSkiff','SM_Outrigger','SM_SailCutter','SM_CabinLaunch')) {
		$log = "$Root\tools\roster\logs\$b.log"
		Write-Host "== $b"
		& $Blender -b --python "$PSScriptRoot\convert-boat.py" -- "$A\FishingFleet\exports\$b.fbx" "$Root\public\models\fleet\$b.glb" 2>&1 | Out-File -Encoding utf8 $log
		Select-String -Path $log -Pattern 'EXPORTED|Error|Traceback' | ForEach-Object { $_.Line }
	}
}
