# Marine life + harbour props from the naval fork -> public/models/marine and public/models/harbour.
# Run from the project root:  powershell -ExecutionPolicy Bypass -File tools/dressing/build.ps1
$ErrorActionPreference = 'Continue'
$Root = (Resolve-Path "$PSScriptRoot\..\..").Path
$Blender = if ($env:BLENDER) { $env:BLENDER } else { 'D:\blender\blender.exe' }
$W = if ($env:FISHING_WORKSPACE) { $env:FISHING_WORKSPACE } else { 'D:\fishing game' }
$F = "$W\Forks\Fishing_Naval_20261007"
New-Item -ItemType Directory -Force "$Root\public\models\marine", "$Root\public\models\harbour", "$Root\tools\dressing\logs" | Out-Null
$log = "$Root\tools\dressing\logs\convert.log"
& $Blender -b --python "$PSScriptRoot\convert.py" -- "$F\Assets\MarineLife\exports" "$Root\public\models\marine" `
	"$F\Deliverables\Fishing_Browser_Prototype_20261011_v2\web\assets\port" "$Root\public\models\harbour" 2>&1 | Out-File -Encoding utf8 $log
Select-String -Path $log -Pattern 'EXPORTED|MARINE|NET|COPIED|Error|Traceback' | ForEach-Object { $_.Line }
