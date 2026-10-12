# Seaplane model -> public/models/seaplane/Seaplane.glb (procedural Blender build, see build_seaplane.py).
# Run from anywhere:  powershell -ExecutionPolicy Bypass -File tools/seaplane/build.ps1 [preview.png]
$ErrorActionPreference = 'Continue'
$Root = (Resolve-Path "$PSScriptRoot\..\..").Path
$Blender = if ($env:BLENDER) { $env:BLENDER } else { 'D:\blender\blender.exe' }
$out = "$Root\public\models\seaplane\Seaplane.glb"
New-Item -ItemType Directory -Force "$Root\public\models\seaplane" | Out-Null
$extra = @()
if ($args.Count -gt 0) { $extra = @($args[0]) }
& $Blender -b --python "$PSScriptRoot\build_seaplane.py" -- $out @extra 2>&1 | Select-String -Pattern 'SEAPLANE|EXPORTED|PREVIEW|Error|Traceback' | ForEach-Object { $_.Line }
