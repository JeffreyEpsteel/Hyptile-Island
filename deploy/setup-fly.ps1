# One-time setup of the shared Hyptile Island universe on Fly.io (docs/HOSTING.md, "The shared universe").
# Run it from the repository with deploy\SETUP_FLY.cmd (Windows PowerShell 5.1 or later). Every step is skipped when it
# was done before, so running it again is safe. It does what the guide lists by hand:
#   1. flyctl installed (Fly's own installer, after you say yes)    2. fly auth signup / login (a browser opens)
#   3. fly launch --copy-config --yes --no-deploy (the app from fly.toml)
#   4. fly volumes create universe_data --size 1 --region fra       5. fly secrets set ADMIN_TOKEN=<random> (kept in your
#      user folder, never in the repository)                        6. fly deploy --remote-only (Fly builds the image)
#   7. fly tokens create deploy -> the GitHub secret FLY_API_TOKEN (set with the gh CLI when it is installed, else printed
#      with the steps to paste it)                                   8. GET /health
$ErrorActionPreference = 'Continue' # (5.1: 'Stop' turns a native command's stderr into an error; exit codes are checked instead)
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

function Say( $text ) { Write-Host "`n== $text" -ForegroundColor Cyan }
function Fly { & $script:fly @args; if ( $LASTEXITCODE -ne 0 ) { throw "fly $( $args -join ' ' ) failed ($LASTEXITCODE)" } }
function FlyQuiet { & $script:fly @args 2>$null; return $LASTEXITCODE -eq 0 }

$app = ( Select-String -Path fly.toml -Pattern "^app\s*=\s*'([^']+)'" ).Matches[ 0 ].Groups[ 1 ].Value
$region = ( Select-String -Path fly.toml -Pattern "^primary_region\s*=\s*'([^']+)'" ).Matches[ 0 ].Groups[ 1 ].Value
Write-Host "Fly app '$app' in region '$region' (fly.toml)"

Say '1. flyctl'
$cmd = Get-Command flyctl -ErrorAction SilentlyContinue
if ( -not $cmd ) { $cmd = Get-Command fly -ErrorAction SilentlyContinue }
if ( -not $cmd -and ( Test-Path "$env:USERPROFILE\.fly\bin\flyctl.exe" ) ) { $cmd = Get-Item "$env:USERPROFILE\.fly\bin\flyctl.exe" }
if ( -not $cmd ) {
	$yes = Read-Host 'flyctl is not installed. Install it now with Fly''s installer (https://fly.io/install.ps1)? [y/N]'
	if ( $yes -notmatch '^[yY]' ) { Write-Host 'Install it from https://fly.io/docs/flyctl/install/ and run this again.'; exit 1 }
	Invoke-WebRequest -UseBasicParsing https://fly.io/install.ps1 | Invoke-Expression
	$cmd = Get-Item "$env:USERPROFILE\.fly\bin\flyctl.exe"
}
$script:fly = if ( $cmd.Source ) { $cmd.Source } else { $cmd.FullName }
Write-Host "using $script:fly"

Say '2. Fly account'
if ( -not ( FlyQuiet auth whoami ) ) {
	$new = Read-Host 'Do you already have a Fly.io account? [y/N]'
	if ( $new -match '^[yY]' ) { Fly auth login } else { Fly auth signup }
}
Fly auth whoami

Say "3. the app $app"
if ( FlyQuiet status --app $app ) { Write-Host 'exists' }
else { Fly launch --copy-config --yes --no-deploy --name $app --region $region }

Say '4. the volume universe_data (1 GB, the saves)'
$vols = & $script:fly volumes list --app $app --json 2>$null | Out-String
if ( $vols -match '"universe_data"' ) { Write-Host 'exists' }
else { Fly volumes create universe_data --size 1 --region $region --app $app --yes }

Say '5. ADMIN_TOKEN (the admin HTTP routes)'
$tokenFile = Join-Path $env:USERPROFILE '.hyptile-universe-admin-token.txt'
$secrets = & $script:fly secrets list --app $app 2>$null | Out-String
if ( $secrets -match 'ADMIN_TOKEN' ) { Write-Host "set (your copy: $tokenFile)" }
else {
	$bytes = New-Object byte[] 24
	[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes( $bytes )
	$token = -join ( $bytes | ForEach-Object { $_.ToString( 'x2' ) } )
	Set-Content -Path $tokenFile -Value $token -Encoding ascii
	Fly secrets set "ADMIN_TOKEN=$token" --app $app --stage
	Write-Host "saved in $tokenFile (keep it; it is not in the repository)"
}

Say '6. the first deploy (Fly builds the image; a few minutes)'
Fly deploy --remote-only --app $app

Say '7. the GitHub secret FLY_API_TOKEN (every push to main deploys from then on)'
$deployToken = ( & $script:fly tokens create deploy --app $app --expiry 87600h 2>$null | Out-String ).Trim()
if ( -not $deployToken ) { throw 'fly tokens create deploy failed' }
$gh = Get-Command gh -ErrorAction SilentlyContinue
$set = $false
if ( $gh ) {
	$deployToken | & $gh.Source secret set FLY_API_TOKEN 2>$null
	$set = $LASTEXITCODE -eq 0
}
if ( $set ) { Write-Host 'FLY_API_TOKEN is set on the GitHub repository (gh)' }
else {
	Write-Host 'Add it by hand: GitHub > the repository > Settings > Secrets and variables > Actions > New repository secret'
	Write-Host 'Name: FLY_API_TOKEN    Secret: the line below (it starts with FlyV1)'
	Write-Host $deployToken -ForegroundColor Yellow
}

Say '8. /health'
try { ( Invoke-WebRequest -UseBasicParsing "https://$app.fly.dev/health" ).Content } catch { Write-Host "no answer yet: $( $_.Exception.Message )" }
Write-Host "`nDone. The game's Multiplayer button joins wss://$app.fly.dev/universe."
