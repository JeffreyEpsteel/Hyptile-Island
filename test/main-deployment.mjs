// Static release safety checks; no network, credentials, process launch or build.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync( new URL( '../' + path, import.meta.url ), 'utf8' );
const pages = read( '.github/workflows/pages.yml' );
const fly = read( '.github/workflows/deploy-universe.yml' );
const config = read( 'fly.toml' );
const docker = read( 'Dockerfile' );
let checks = 0;
const check = ( condition, message ) => { assert.ok( condition, message ); checks ++; };
const equal = ( actual, expected, message ) => { assert.deepEqual( actual, expected, message ); checks ++; };

// Evaluate the actual small workflow expressions against synthetic GitHub events.
// Only property reads, literals and boolean operators are accepted here.
function expression( text ) {
	check( /^[\w.\s'"&|=!()\/-]+$/.test( text ), 'workflow expression uses only the expected simple expression syntax' );
	return new Function( 'github', 'return (' + text + ');' );
}
const repository = 'JeffreyEpsteel/Hyptile-Island';
const event = ( overrides = {} ) => ( {
	repository, ref: 'refs/heads/main', sha: '2222222222222222222222222222222222222222', event_name: 'workflow_run',
	event: { workflow_run: { conclusion: 'success', head_branch: 'main', head_sha: '1111111111111111111111111111111111111111', head_repository: { full_name: repository } } }, ...overrides,
} );
const pagesGuard = expression( /^    if:\s*(.+)$/m.exec( pages )?.[ 1 ] || '' );
check( pagesGuard( event( { event_name: 'push' } ) ), 'original repository main may build Pages' );
check( ! pagesGuard( event( { repository: 'JeffreyEpsteel/alpha-astra' } ) ), 'a different repository does not deploy this original site' );
check( ! pagesGuard( event( { ref: 'refs/heads/feature' } ) ), 'non-main branches cannot publish Pages' );

const folded = /^    if: >-\r?\n((?:      .+\r?\n)+)/m.exec( fly )?.[ 1 ];
check( !! folded, 'Fly job has an explicit repository/event guard' );
const flyGuard = expression( folded.trim().replace( /\s*\r?\n\s*/g, ' ' ) );
check( flyGuard( event() ), 'successful original main Pages run may deploy Fly' );
for ( const [ field, value ] of [ [ 'conclusion', 'failure' ], [ 'head_branch', 'feature' ], [ 'head_repository', { full_name: 'someone/fork' } ] ] ) {
	const e = event(); e.event.workflow_run[ field ] = value;
	check( ! flyGuard( e ), 'Fly rejects mismatched upstream ' + field );
}
check( ! flyGuard( event( { repository: 'someone/fork' } ) ), 'Fly cannot deploy from a fork repository' );
check( flyGuard( event( { event_name: 'workflow_dispatch', event: {} } ) ), 'manual main deployment remains available' );
check( ! flyGuard( event( { event_name: 'workflow_dispatch', ref: 'refs/heads/feature', event: {} } ) ), 'manual non-main deployment is refused' );

const refs = text => [ ...text.matchAll( /^\s+ref: \$\{\{ (.+) \}\}\s*$/gm ) ].map( m => m[ 1 ] );
equal( refs( pages ), [ 'github.sha' ], 'Pages checks out exactly its triggering commit' );
equal( refs( fly ).length, 1, 'Fly has a single checkout reference' );
const release = expression( refs( fly )[ 0 ] );
equal( release( event() ), event().event.workflow_run.head_sha, 'workflow_run uses the Pages SHA even when github.sha differs' );
equal( release( event( { event_name: 'workflow_dispatch', event: {} } ) ), event().sha, 'manual deployment uses its immutable SHA' );
check( fly.includes( 'RELEASE_SHA: ${{ ' + refs( fly )[ 0 ] + ' }}' ), 'checkout and release verification use the same expression' );
check( fly.includes( 'test "$(git rev-parse HEAD)" = "$RELEASE_SHA"' ), 'deployment checks the full checked-out commit before using credentials' );
check( fly.indexOf( 'Verify the exact release commit' ) < fly.indexOf( 'Is Fly set up?' ), 'release identity is checked before deployment setup' );
check( /git rev-parse --short=7 HEAD/.test( fly ) && /--build-arg BUILD_HASH=\$\{\{ steps\.build\.outputs\.hash \}\}/.test( fly ), 'server stamp comes from the checked-out release, not the workflow context' );
check( ! /^\s+ref:\s*(?:live|main)\s*$/m.test( pages + fly ), 'neither workflow checks out a moving branch' );

const pagesName = /^name:\s*(.+)$/m.exec( pages )[ 1 ].trim();
check( fly.includes( 'workflows: [ "' + pagesName + '" ]' ), 'Fly follows the unchanged Pages workflow name' );
check( /types: \[ completed \]/.test( fly ) && /branches: \[ main \]/.test( fly ), 'Fly follows completed main workflow runs' );
check( pages.indexOf( 'npm run test:release' ) < pages.indexOf( 'npm run build' ) && pages.includes( 'npm run test:release' ), 'release regression checks precede the Pages build' );
check( /VITE_UNIVERSE_URL:\s*wss:\/\/hyptile-universe\.fly\.dev\/universe/.test( pages ), 'production build explicitly targets the existing shared universe' );
check( /cancel-in-progress: false/.test( fly ), 'an in-progress machine update is not cancelled' );
check( /::error::FLY_API_TOKEN is not set/.test( fly ) && ! /go=false/.test( fly ), 'missing deployment credentials fail visibly' );

check( /flyctl status --app/.test( fly ) && /flyctl volumes list --app[^\n]*--json/.test( fly ), 'Fly app and volumes are read before deploy' );
check( ! /flyctl\s+(?:apps\s+create|volumes\s+(?:create|destroy|delete|extend|fork)|scale)/.test( fly ), 'workflow cannot create, replace, resize or scale persistent resources' );
check( /--app hyptile-universe --config fly\.toml/.test( fly ), 'deploy explicitly targets the existing app and checked-in configuration' );
check( /v\.name === 'universe_data' && v\.region === 'fra'/.test( fly ) && /refusing to provision a replacement/.test( fly ), 'only the existing Frankfurt save volume satisfies the gate' );
check( fly.indexOf( 'flyctl volumes list' ) < fly.indexOf( 'run: flyctl deploy' ), 'resource checks precede image deployment' );
check( /\.fly\.dev\/health/.test( fly ) && /steps\.build\.outputs\.hash/.test( fly.slice( fly.indexOf( 'name: /health' ) ) ), 'post-deploy health must report this release stamp' );
check( /^app\s*=\s*'hyptile-universe'/m.test( config ) && /^primary_region\s*=\s*'fra'/m.test( config ), 'existing app and region stay unchanged' );
check( /source\s*=\s*'universe_data'/.test( config ) && /destination\s*=\s*'\/data'/.test( config ), 'existing save volume remains mounted at /data' );
check( /kill_signal\s*=\s*'SIGTERM'/.test( config ) && /kill_timeout\s*=\s*'30s'/.test( config ), 'server keeps its graceful-save shutdown window' );
check( /"--universe", "hyptile", "--data", "\/data"/.test( docker ) && /"--max-players", "24"/.test( docker ), 'container keeps the existing universe identity, save path and capacity' );
console.log( `${ checks } original-main deployment safety checks passed; static only, no network/build/process launch.` );
