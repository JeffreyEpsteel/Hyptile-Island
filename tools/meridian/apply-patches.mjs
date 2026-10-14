// Wave 21A: the root patches that wire Meridian in, as exact anchor / replacement pairs (each anchor must occur once).
//   node tools/meridian/apply-patches.mjs --check <dir>   copies the patched files to <dir> (same relative paths) and checks
//                                                         every anchor applies once and every result parses (node --check)
//   node tools/meridian/apply-patches.mjs --apply         patches the tree in place (root only)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = resolve( import.meta.dirname, '..', '..' );

export const PATCHES = [
	// ---- TerrainData: Meridian's tile attached while the heightmap builds (before the GPU reads the tiles)
	{ file: 'src/world/TerrainData.js',
		anchor: `import { ensureBlackwater } from './islands/BlackwaterTerrain.js';`,
		replace: `import { ensureBlackwater } from './islands/BlackwaterTerrain.js';\nimport { ensureMeridian } from './islands/MeridianTerrain.js';` },
	{ file: 'src/world/TerrainData.js',
		anchor: `		ensureBlackwater( this ); // wave 14D: Blackwater's tile far south, clear of the seaplane's take-off run`,
		replace: `		ensureBlackwater( this ); // wave 14D: Blackwater's tile far south, clear of the seaplane's take-off run\n		ensureMeridian( this ); // wave 21A: Meridian, the city island west of home, on its own tile` },
	// ---- WorldLayout: WORLD.meridian, the island and the port entry (agents, map, discovery read them)
	{ file: 'src/world/WorldLayout.js',
		anchor: `import { TIDEMARK, tidemarkWorld } from './terrain/IslandShape.js'; // Tidemark (wave 12A)`,
		replace: `import { TIDEMARK, tidemarkWorld } from './terrain/IslandShape.js'; // Tidemark (wave 12A)\nimport { registerMeridian } from './islands/meridian/World.js'; // Meridian (wave 21A)` },
	{ file: 'src/world/WorldLayout.js',
		anchor: `		lagoon: { ...WORLD.tidemark.bay },\n	} );\n\n}\n`,
		replace: `		lagoon: { ...WORLD.tidemark.bay },\n	} );\n\n}\n\n// Meridian (wave 21A): the city island west of home on its own terrain tile (islands/meridian/World.js: WORLD.meridian with\n// its dock, bay, airstrip and town; the island entry, tile: true, city: true; the port entry, size 2)\nregisterMeridian( WORLD );\n` },
	// ---- Ports: the city and its traders, markers, discovery spots, per-frame update
	{ file: 'src/game/ports/Ports.js',
		anchor: `import { PORT_FOLK } from '../../world/residents/ResidentData.js';`,
		replace: `import { PORT_FOLK } from '../../world/residents/ResidentData.js';\nimport { Meridian } from '../../world/islands/meridian/Meridian.js';\nimport { MeridianPort, MERIDIAN_STAND } from '../../world/islands/meridian/MeridianPort.js';` },
	{ file: 'src/game/ports/Ports.js',
		anchor: `export const PORT_IDS = [ 'gull', 'key', 'haven', 'shrine', 'shoal', 'inverted', 'tidemark' ];`,
		replace: `export const PORT_IDS = [ 'gull', 'key', 'haven', 'shrine', 'shoal', 'inverted', 'tidemark', 'meridian' ];` },
	{ file: 'src/game/ports/Ports.js',
		anchor: `		registerTidemarkFolk( PORT_FOLK );\n`,
		replace: `		registerTidemarkFolk( PORT_FOLK );\n		// Meridian (wave 21A): the city island west of home (its tile, the city, the handle the cars and citywreck use: app.meridian)\n		this.meridian = new Meridian( { scene, terrain, colliders } );\n		this.meridianPort = new MeridianPort( { scene, terrain, colliders } );\n` },
	{ file: 'src/game/ports/Ports.js',
		anchor: `this.shrinePort.vendor, ...this.tidemarkPort.vendors ];`,
		replace: `this.shrinePort.vendor, ...this.tidemarkPort.vendors, ...this.meridianPort.vendors ];` },
	{ file: 'src/game/ports/Ports.js',
		anchor: `...this.tidemark.lights, ...this.tidemarkPort.lights ];`,
		replace: `...this.tidemark.lights, ...this.tidemarkPort.lights, ...this.meridian.lights, ...this.meridianPort.lights ];` },
	{ file: 'src/game/ports/Ports.js',
		anchor: `		for ( const id of [ 'haven', 'shrine', 'shoal', 'inverted', 'tidemark' ] ) {`,
		replace: `		for ( const id of [ 'haven', 'shrine', 'shoal', 'inverted', 'tidemark', 'meridian' ] ) {` },
	{ file: 'src/game/ports/Ports.js',
		anchor: `			{ id: 'tidemark:airstrip', name: 'Airstrip', x: this.tidemark.airstrip.x, z: this.tidemark.airstrip.z, icon: 'plane', port: 'tidemark' },\n`,
		replace: `			{ id: 'tidemark:airstrip', name: 'Airstrip', x: this.tidemark.airstrip.x, z: this.tidemark.airstrip.z, icon: 'plane', port: 'tidemark' },\n			{ id: 'meridian', name: 'Meridian', x: MERIDIAN_STAND.x, z: MERIDIAN_STAND.z, icon: 'anchor' },\n			{ id: 'meridian:airstrip', name: 'Meridian Airport', x: WORLD.meridian.airstrip.x, z: WORLD.meridian.airstrip.z, icon: 'plane', port: 'meridian' },\n` },
	{ file: 'src/game/ports/Ports.js',
		anchor: `		this._spots.tidemark.push( new Vector3( ap.x, 0, ap.z ), new Vector3( this.tidemark.airstrip.x, 0, this.tidemark.airstrip.z ) );\n`,
		replace: `		this._spots.tidemark.push( new Vector3( ap.x, 0, ap.z ), new Vector3( this.tidemark.airstrip.x, 0, this.tidemark.airstrip.z ) );\n		// Meridian: the airport's apron and runway, the Twins' plaza, the ferry slip\n		const M = WORLD.meridian;\n		this._spots.meridian.push( new Vector3( M.airstrip.pad.x, 0, M.airstrip.pad.z ), new Vector3( M.airstrip.x, 0, M.airstrip.z ), new Vector3( M.town.x, 0, M.town.z ) );\n` },
	{ file: 'src/game/ports/Ports.js',
		anchor: `		this.tidemarkPort.update( dt, this.tidemark.distance );\n`,
		replace: `		this.tidemarkPort.update( dt, this.tidemark.distance );\n		this.meridian.update( dt );\n		this.meridianPort.update( dt );\n` },
	// ---- App: the handle where the cars (21B) and citywreck (21C) look for it
	{ file: 'src/App.js',
		anchor: `		this.ports = new Ports( { scene, terrain: this.terrainData, colliders: this.colliders, village: this.village } );\n`,
		replace: `		this.ports = new Ports( { scene, terrain: this.terrainData, colliders: this.colliders, village: this.village } );\n		this.meridian = this.ports.meridian; // wave 21A: Meridian's handle (plan, building( id ), roadHeight, onStage, signalState)\n` },
	// ---- seaplane: two islands have airstrips now; a caller may ask for the nearest (without \`near\`: the first, as before)
	{ file: 'src/features/seaplane/Site.js',
		anchor: `export function findAirstrip( world ) {\n\n	if ( ! world ) return null;\n	for ( const isl of world.islands || [] ) {\n\n		const s = isl && world[ isl.id ] && world[ isl.id ].airstrip;\n		if ( s && Number.isFinite( s.x ) && Number.isFinite( s.z ) ) return { island: isl.id, ...s };\n\n	}\n\n	return null;`,
		replace: `export function findAirstrip( world, near = null ) {\n\n	if ( ! world ) return null;\n	let best = null, bd = Infinity;\n	for ( const isl of world.islands || [] ) {\n\n		const s = isl && world[ isl.id ] && world[ isl.id ].airstrip;\n		if ( ! s || ! Number.isFinite( s.x ) || ! Number.isFinite( s.z ) ) continue;\n		if ( ! near ) return { island: isl.id, ...s };\n		const d = Math.hypot( s.x - near.x, s.z - near.z ); // (wave 21A: Meridian's airport too: the nearest strip)\n		if ( d < bd ) { bd = d; best = { island: isl.id, ...s }; }\n\n	}\n\n	return best;` },
	// ---- townlife: Meridian's port quarter
	{ file: 'src/features/townlife/Towns.js',
		anchor: `import { BLACKWATER_SHACKS } from '../../world/islands/Blackwater.js';`,
		replace: `import { BLACKWATER_SHACKS } from '../../world/islands/Blackwater.js';\nimport { meridianTownPlan, MERIDIAN_POPULATION } from '../../world/islands/meridian/TownLife.js';` },
	{ file: 'src/features/townlife/Towns.js',
		anchor: `	blackwater: { roles: { pirate: 10, pirateHand: 3, fence: 1, pirateWatch: 2 } },\n`,
		replace: `	blackwater: { roles: { pirate: 10, pirateHand: 3, fence: 1, pirateWatch: 2 } },\n	meridian: MERIDIAN_POPULATION,\n` },
	{ file: 'src/features/townlife/index.js',
		anchor: `		const built = id === 'home' ? a.village && a.village.seats : id === 'tidemark' ?`,
		replace: `		const built = id === 'meridian' ? ( a.meridian && a.meridian.seats ) || [] : id === 'home' ? a.village && a.village.seats : id === 'tidemark' ?` },
	// ---- the tests that count the islands' parts: Meridian's added (its traders, lights, markers, tile)
	{ file: 'test/feature-islands.mjs',
		anchor: `ok( ports.vendors.length === 6 && ports.havenPort`,
		replace: `ok( ports.vendors.length === 8 && ports.meridianPort.market.kind === 'buyer' && ports.meridianPort.chandler.kind === 'shop' && ports.havenPort` },
	{ file: 'test/feature-islands.mjs',
		anchor: `ok( ports.lights.length >= 8 + 14 + 3 && ports.lights.length <= 8 + 24 + 6, 'lights: a few per island'`,
		replace: `ok( ports.lights.length - ports.meridian.lights.length - ports.meridianPort.lights.length >= 8 + 14 + 3 && ports.lights.length - ports.meridian.lights.length - ports.meridianPort.lights.length <= 8 + 24 + 6 && ports.meridian.lights.length < 400, 'lights: a few per island (Meridian\\'s street lamps: LocalLights takes the 16 nearest)'` },
	{ file: 'test/feature-islands.mjs',
		anchor: `ok( ports.markers.length === 8 && ports.markers.every(`,
		replace: `ok( ports.markers.length === 10 && ports.markers.some( ( m ) => m.id === 'meridian:airstrip' ) && ports.markers.every(` },
	{ file: 'test/feature-blackwater-tile.mjs',
		anchor: `	ok( tiles.length === 2 && tiles[ 0 ].id === 'tidemark' && tiles[ 1 ].id === 'blackwater', 'terrainTiles: Tidemark then Blackwater'`,
		replace: `	ok( tiles.length === 3 && tiles[ 0 ].id === 'tidemark' && tiles[ 1 ].id === 'blackwater' && tiles[ 2 ].id === 'meridian', 'terrainTiles: Tidemark, Blackwater, then Meridian (wave 21A)'` },
	{ file: 'test/feature-blackwater-tile.mjs',
		anchor: `( wgsl.match( /if \\( f\\.x >= 0\\.0/g ) || [] ).length === 2, 'one tile branch each in the WGSL' );`,
		replace: `( wgsl.match( /if \\( f\\.x >= 0\\.0/g ) || [] ).length === 3, 'one tile branch each in the WGSL' );` },
	// ---- the townlife test: Meridian's quarter (its benches from the builder, its 42 desktop townsfolk)
	{ file: 'test/feature-townlife.mjs',
		anchor: `import { blackwaterSeats } from '../src/world/islands/Blackwater.js';`,
		replace: `import { blackwaterSeats } from '../src/world/islands/Blackwater.js';\nimport { Meridian } from '../src/world/islands/meridian/Meridian.js';` },
	{ file: 'test/feature-townlife.mjs',
		anchor: `	blackwater: externalSeats( blackwaterSeats( terrain ), ( x, z ) => terrain.heightAt( x, z ) ),\n};`,
		replace: `	blackwater: externalSeats( blackwaterSeats( terrain ), ( x, z ) => terrain.heightAt( x, z ) ),\n};\nglobalThis.__quietKit = true;\nconst meridianCity = new Meridian( { scene: null, terrain, colliders: null, kit: false } );\n{\n\n	const mg = plans.find( ( p ) => p.id === 'meridian' ).grid, F = mg.frame;\n	SEATS.meridian = externalSeats( meridianCity.seats.filter( ( s ) => s.x - F.x > mg.u0 + 2 && s.x - F.x < mg.u1 - 2 && s.z - F.z > mg.v0 + 2 && s.z - F.z < mg.v1 - 2 ), ( x, z ) => terrain.heightAt( x, z ) );\n\n}` },
	{ file: 'test/feature-townlife.mjs',
		anchor: `		player: { mode: 'walk', position: new Vector3( p.x, terrain.heightAt( p.x, p.z ), p.z ) },\n	};`,
		replace: `		player: { mode: 'walk', position: new Vector3( p.x, terrain.heightAt( p.x, p.z ), p.z ) },\n		meridian: meridianCity,\n	};` },
	{ file: 'test/feature-townlife.mjs',
		anchor: `	const want = { home: 12, tidemark: 47, blackwater: 16 };`,
		replace: `	const want = { home: 12, tidemark: 47, blackwater: 16, meridian: 42 };` },
	{ file: 'src/features/townlife/Towns.js',
		anchor: `	if ( ! cache ) cache = [ homePlan(), tidemarkPlan(), blackwaterPlan() ];`,
		replace: `	if ( ! cache ) cache = [ homePlan(), tidemarkPlan(), blackwaterPlan(), meridianTownPlan() ];` },
];

function patched( text, list, file ) {

	for ( const p of list ) {

		// (some files mix LF and CRLF: the anchor's line ends match either; the replacement takes the matched ones)
		const esc = ( s ) => s.replace( /[.*+?^${}()|[\]\\]/g, '\\$&' );
		const re = new RegExp( p.anchor.split( '\n' ).map( esc ).join( '\r?\n' ), 'g' );
		const found = text.match( re ) || [];
		if ( found.length !== 1 ) throw new Error( `${ file }: anchor found ${ found.length } times: ${ p.anchor.slice( 0, 80 ) }` );
		const eol = found[ 0 ].includes( '\r\n' ) ? '\r\n' : '\n';
		text = text.replace( re, () => p.replace.split( '\n' ).join( eol ) );

	}

	return text;

}

const mode = process.argv[ 2 ];
if ( mode === '--check' || mode === '--apply' ) {

	const out = mode === '--check' ? resolve( process.argv[ 3 ] || 'meridian-patch-check' ) : ROOT;
	const files = [ ...new Set( PATCHES.map( ( p ) => p.file ) ) ];
	for ( const f of files ) {

		const text = patched( readFileSync( join( ROOT, f ), 'utf8' ), PATCHES.filter( ( p ) => p.file === f ), f );
		const dst = join( out, f );
		mkdirSync( dirname( dst ), { recursive: true } );
		writeFileSync( dst, text );
		if ( mode === '--check' ) {

			writeFileSync( join( out, 'package.json' ), '{ "type": "module" }' );
			execFileSync( process.execPath, [ '--check', dst ] );

		}

		console.log( ( mode === '--check' ? 'checked ' : 'patched ' ) + f + ` (${ PATCHES.filter( ( p ) => p.file === f ).length } edits)` );

	}

} else console.log( 'usage: node tools/meridian/apply-patches.mjs --check <dir> | --apply' );
