# Ship-module kit from the naval fork (Assets/NavalModules) -> public/models/modules/*.glb (+ a lantern rig).
# Run from the project root:  powershell -ExecutionPolicy Bypass -File tools/modules/build.ps1
$ErrorActionPreference = 'Continue'
$Root = (Resolve-Path "$PSScriptRoot\..\..").Path
$Blender = if ($env:BLENDER) { $env:BLENDER } else { 'D:\blender\blender.exe' }
$W = if ($env:FISHING_WORKSPACE) { $env:FISHING_WORKSPACE } else { 'D:\fishing game' }
$F = "$W\Forks\Fishing_Naval_20261007"
New-Item -ItemType Directory -Force "$Root\public\models\modules", "$Root\tools\modules\logs" | Out-Null
$log = "$Root\tools\modules\logs\convert.log"
& $Blender -b --python "$PSScriptRoot\convert.py" -- "$F\Assets\NavalModules\exports" "$Root\public\models\modules" 2>&1 | Out-File -Encoding utf8 $log
Select-String -Path $log -Pattern 'EXPORTED|MODULE|DONE|Error|Traceback' | ForEach-Object { $_.Line }
