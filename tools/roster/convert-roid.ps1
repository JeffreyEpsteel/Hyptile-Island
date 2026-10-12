# Captain Roid (the boat seller): D:\fishing game\Forks\Fishing_Naval_20261007\Assets\CaptainRoid -> public/models/npc/captain-roid.glb,
# the portrait and the clicks clip. Run from the project root:  powershell -ExecutionPolicy Bypass -File tools/roster/convert-roid.ps1
# The rig is the 48-bone JadeFisher one; clips Idle / FirstEncounter / Repeat are his own, Talk is HyptileMotion's.
$ErrorActionPreference = 'Continue'
$Root = (Resolve-Path "$PSScriptRoot\..\..").Path
$Blender = if ($env:BLENDER) { $env:BLENDER } else { 'D:\blender\blender.exe' }
$W = if ($env:FISHING_WORKSPACE) { $env:FISHING_WORKSPACE } else { 'D:\fishing game' }
$R = "$W\Forks\Fishing_Naval_20261007\Assets\CaptainRoid"
New-Item -ItemType Directory -Force "$Root\public\models\npc", "$Root\public\ui\roster", "$Root\public\audio", "$Root\tools\roster\logs" | Out-Null
$log = "$Root\tools\roster\logs\captain-roid.log"
& $Blender -b --python "$PSScriptRoot\convert-roid.py" -- "$R\exports\SK_CaptainRoid.fbx" "$Root\public\models\npc\captain-roid.glb" "$Root\public\ui\roster\captain-roid.png" 60000 `
	"Idle=$R\animations\A_CaptainRoid_Idle.fbx" "FirstEncounter=$R\animations\A_CaptainRoid_FirstEncounter.fbx" "Repeat=$R\animations\A_CaptainRoid_Repeat.fbx" "Talk=$W\Assets\HyptileMotion\animations\Talk.fbx" 2>&1 | Out-File -Encoding utf8 $log
Select-String -Path $log -Pattern 'EXPORTED|PORTRAIT|DECIMATED|BAKED|CLIP|NO ACTION|Error|Traceback' | ForEach-Object { $_.Line }
$ff = Get-Command ffmpeg -ErrorAction SilentlyContinue
if ($ff) { & $ff.Source -y -loglevel error -i "$R\audio\CaptainRoid_Clicks.wav" -c:a libvorbis -q:a 4 "$Root\public\audio\captain_roid_clicks.ogg" }
else { Copy-Item "$R\audio\CaptainRoid_Clicks_Original.mp3" "$Root\public\audio\captain_roid_clicks.mp3" -Force }
