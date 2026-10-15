// Wave 23A: the patches outside Meridian's own files that follow the skyline (the Twins replaced by eight skyscrapers), as
// exact anchor / replacement pairs (each anchor must occur `count` times, default once; `all` replaces every occurrence).
//   node tools/meridian/apply-w23-patches.mjs --check <dir>   writes the patched files to <dir> (same relative paths) and checks
//                                                             every anchor applies and every result parses (node --check)
//   node tools/meridian/apply-w23-patches.mjs --apply         patches the tree in place (root / the files' owners only)
//   node tools/meridian/apply-w23-patches.mjs --apply <dir>   patches a copy of the tree at <dir> in place (verification)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = resolve( import.meta.dirname, '..', '..' );

export const PATCHES = [
	// ---- the map's discovery spots: the comment names the plaza by its new name (WORLD.meridian.town is the same spot)
	{ file: 'src/game/ports/Ports.js',
		anchor: `		// Meridian: the airport's apron and runway, the Twins' plaza, the ferry slip`,
		replace: `		// Meridian: the airport's apron and runway, the Skyline Plaza, the ferry slip` },
	// ---- the perf views: the plaza's new name in their descriptions (same poses)
	{ file: 'tools/perf/scenarios.js',
		anchor: `downtown at the Twins Plaza (the towers, the blocks, the traffic)`,
		replace: `downtown at the Skyline Plaza (the skyscrapers, the blocks, the traffic)` },
	{ file: 'tools/perf/scenarios.js',
		anchor: `about: 'on foot at the west edge of the Twins Plaza at noon, facing the towers: the blocks, the streets, the traffic'`,
		replace: `about: 'on foot at the west edge of the Skyline Plaza at noon, facing the skyscrapers: the blocks, the streets, the traffic'` },
	{ file: 'tools/perf/scenarios.js',
		anchor: `about: 'driving a sedan along the avenue south of the Twins Plaza at 17:30: the traffic, the parked cars, the city'`,
		replace: `about: 'driving a sedan along the avenue south of the Skyline Plaza at 17:30: the traffic, the parked cars, the city'` },
	// ---- codex-city-failover: the roofs it lands on are now the Helix's and the Tidegate's (their roofs at x + 18)
	{ file: 'test/codex-city-failover.mjs', anchor: `twin-north`, replace: `helix-tower`, all: true },
	{ file: 'test/codex-city-failover.mjs', anchor: `twin-south`, replace: `tidegate`, all: true },
	// ---- codex-city: the helipad towers' roofs, pads and plant room; a fallen skyscraper keeps a 9 m stump (STUMP)
	{ file: 'test/codex-city.mjs',
		anchor: `for ( const id of [ 'twin-north', 'twin-south' ] ) {

	const h = city.building( id ), b = h.plan, top = b.y + b.h, x = b.x + 18, z = b.z;`,
		replace: `for ( const id of [ 'helix-tower', 'tidegate' ] ) {

	// (the Tidegate's east prong roof runs x + 6..28: a point 26.5 m out leaves no room for a 6 m landing footprint)
	const h = city.building( id ), b = h.plan, top = b.y + b.h, x = b.x + ( id === 'tidegate' ? 26.5 : 18 ), z = b.z;` },
	{ file: 'test/codex-city.mjs',
		anchor: `	check( city.landingSurfaceAt( b.x + ( id === 'twin-north' ? 8 : 0 ), b.z )?.y === top + ( id === 'twin-south' ? 10 : 6 ), id + ': plant/pavilion roof heights match rendered geometry' );
	if ( id === 'twin-north' ) check( city.landingSurfaceAt( b.x, b.z ) === null, 'north antenna is an obstacle, not a landing pad' );`,
		replace: `	check( city.landingSurfaceAt( b.helipad.x, b.helipad.z )?.y === b.helipad.y && city.landingSurfaceAt( b.helipad.x, b.helipad.z ).pad, id + ': the helipad is the roof the drawn pad sits on' );
	if ( id === 'tidegate' ) check( city.landingSurfaceAt( b.x - 17, b.z ) === null, 'the west prong\\'s plant room is an obstacle, not a landing pad' );` },
	{ file: 'test/codex-city.mjs',
		anchor: `	check( geometry.boundingBox.max.y <= b.y + 4.001, id + ': collapsed facade contains no hidden full-height tower or mast' );`,
		replace: `	check( geometry.boundingBox.max.y <= b.y + 14.001, id + ': collapsed facade contains no hidden full-height tower or mast (a 9 m stump, its jagged top)' );` },
	{ file: 'test/codex-city.mjs',
		anchor: `	check( colliders.groundHeightAt( x, z, top + 1 ) < top && h.colliders[ 0 ].top <= b.y + 4, id + ': no ghost player ground or facade remains high in the air' );`,
		replace: `	check( colliders.groundHeightAt( x, z, top + 1 ) < top && h.colliders.every( ( c ) => ! c.solid || c.top <= b.y + 9.001 ), id + ': no ghost player ground or facade remains high in the air' );` },
	// ---- codex-helicopter: it lands on every tower with a helipad, at the pad; the seaplane rests on the Tidegate's prong
	{ file: 'test/codex-helicopter.mjs',
		anchor: `	const towers = cityPlan().buildings.filter( b => b.kind === 'tower' );
	for ( const b of towers ) city.handles.set( b.id, city._handle( b, { key: 'twins', dirty: false } ) );
	w.app.meridian = city;`,
		replace: `	const towers = cityPlan().buildings.filter( b => b.kind === 'tower' && b.helipad );
	for ( const b of towers ) city.handles.set( b.id, city._handle( b, { key: 'skyline', dirty: false } ) );
	w.app.meridian = city;` },
	{ file: 'test/codex-helicopter.mjs',
		anchor: `		const roof = b.y + b.h, f = w.h.flight, x = b.x + 18;
		f.place( x, roof + 12, b.z );`,
		replace: `		const roof = b.helipad.y, f = w.h.flight, x = b.helipad.x, pz = b.helipad.z;
		f.place( x, roof + 12, pz );` },
	{ file: 'test/codex-helicopter.mjs',
		anchor: `		w.h.piloted = false; w.player.exitVehicle( x, roof, b.z );`,
		replace: `		w.h.piloted = false; w.player.exitVehicle( x, roof, pz );` },
	{ file: 'test/codex-helicopter.mjs',
		anchor: `	sp.flight.position.set( b.x + 8, top + 10, b.z );
	check( sp.flight.groundAt( b.x + 8, b.z ) === top + 6, 'existing seaplane queries the live Meridian plant roof above terrain' );
	sp.flight.position.y = top - 30; check( sp.flight.groundAt( b.x + 8, b.z ) < 10, 'existing seaplane below roof sees terrain, avoiding upward spring teleport' );
	sp.flight.place( b.x + 8, b.z, 0, top + 7 );`,
		replace: `	sp.flight.position.set( b.x + 17, top + 10, b.z );
	check( sp.flight.groundAt( b.x + 17, b.z ) === top, 'existing seaplane queries the live Meridian roof above terrain' );
	sp.flight.position.y = top - 30; check( sp.flight.groundAt( b.x + 17, b.z ) < 10, 'existing seaplane below roof sees terrain, avoiding upward spring teleport' );
	sp.flight.place( b.x + 17, b.z, 0, top + 1 );` },
	{ file: 'test/codex-helicopter.mjs',
		anchor: `	check( events.some( e => e.type === 'touch' && e.surface === 'ground' ) && sp.flight.position.y > top + 5, 'real seaplane rigid-body model touches down and rests on elevated roof support' );`,
		replace: `	check( events.some( e => e.type === 'touch' && e.surface === 'ground' ) && sp.flight.position.y > top - 1, 'real seaplane rigid-body model touches down and rests on elevated roof support' );` },
	{ file: 'test/codex-helicopter.mjs',
		anchor: `	for ( const b of towers ) city.handles.set( b.id, city._handle( b, { key: 'twins', dirty: false } ) ); w.app.meridian = city;`,
		replace: `	for ( const b of towers ) city.handles.set( b.id, city._handle( b, { key: 'skyline', dirty: false } ) ); w.app.meridian = city;` },
	{ file: 'test/codex-helicopter.mjs',
		anchor: `	const south = towers.find( b => b.id === 'twin-south' ), roofY = south.y + south.h;`,
		replace: `	const south = towers.find( b => b.id === 'tidegate' ), roofY = south.y + south.h;` },
];

function patched( text, list, f ) {

	// (some files keep CRLF line ends: the anchors follow the file's)
	const eol = text.includes( String.fromCharCode( 13, 10 ) ) ? String.fromCharCode( 13, 10 ) : String.fromCharCode( 10 );
	for ( const p of list ) {

		const anchor = p.anchor.split( String.fromCharCode( 10 ) ).join( eol ), replace = p.replace.split( String.fromCharCode( 10 ) ).join( eol );
		const n = text.split( anchor ).length - 1;
		if ( p.all ? n < 1 : n !== ( p.count || 1 ) ) throw new Error( `${ f }: anchor found ${ n } times: ${ p.anchor.slice( 0, 80 ) }` );
		text = text.split( anchor ).join( replace );

	}

	return text;

}

const mode = process.argv[ 2 ];
if ( mode === '--check' || mode === '--apply' ) {

	const src = mode === '--apply' && process.argv[ 3 ] ? resolve( process.argv[ 3 ] ) : ROOT;
	const out = mode === '--check' ? resolve( process.argv[ 3 ] || 'meridian-w23-patch-check' ) : src;
	const files = [ ...new Set( PATCHES.map( ( p ) => p.file ) ) ];
	for ( const f of files ) {

		const text = patched( readFileSync( join( src, f ), 'utf8' ), PATCHES.filter( ( p ) => p.file === f ), f );
		const dst = join( out, f );
		mkdirSync( dirname( dst ), { recursive: true } );
		writeFileSync( dst, text );
		if ( mode === '--check' ) {

			writeFileSync( join( out, 'package.json' ), '{ "type": "module" }' );
			execFileSync( process.execPath, [ '--check', dst ] );

		}

		console.log( ( mode === '--check' ? 'checked ' : 'patched ' ) + f + ` (${ PATCHES.filter( ( p ) => p.file === f ).length } edits)` );

	}

} else console.log( 'usage: node tools/meridian/apply-w23-patches.mjs --check <dir> | --apply [<copy of the tree>]' );
