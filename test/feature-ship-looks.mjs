// Wave 24C: the rebuilt ships (tools/ships/build_ships.py): every class GLB and its two LOD files (nodes, materials, textures,
// triangle budgets), the game's measurements kept (hull length / beam / keel / masthead, the walkable decks of ShipDecks.js on
// the planks, the collision lines inside the hull, the swivel mounts inside the side), the sail / flag UV codes the shader reads,
// the helm wheels the game carves or lifts out, then naval's ModelSet on a headless GPU: the ship materials (ShipLooks.js), the
// LOD swaps by distance, a fleet of twelve within its triangle budget, and one frame drawn with no GPU errors.
//   node test/feature-ship-looks.mjs [--no-gpu]
import './headless.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGLB } from '../src/engine/loaders/GLTF.js';
import { BufferAttribute, BufferGeometry, Group, Mesh, Matrix4, Vector3, Quaternion } from '../src/engine/index.js';
import { SHIP_CLASSES } from '../src/features/naval/ShipClasses.js';
import { BOATS } from '../src/game/Boats.js';
import { walkSurfaces, helmDeckY } from '../src/world/boat/ShipDecks.js';
import { SimpleHullLines } from '../src/world/boat/SimpleHullLines.js';
import { centreOnHull } from '../src/world/boat/ShipFrame.js';
import { MAST_MESH } from '../src/features/naval/MastFall.js';
import { ModelSet, lodFor, lodUrl, LOD_DIST, carveShipWheel } from '../src/features/naval/Models.js';
import { shipMaterials, SAIL_BRACE } from '../src/features/naval/ShipLooks.js';
import { liftWheel, drawNavy } from '../src/features/navy/NavyModels.js';
import { Ship } from '../src/features/naval/Ship.js';

const ROOT = fileURLToPath( new URL( '..', import.meta.url ) );
const NO_GPU = process.argv.includes( '--no-gpu' );
let fails = 0, passes = 0;
const ok = ( c, msg ) => {

	if ( ! c ) { fails ++; console.log( 'FAIL', msg ); } else { passes ++; console.log( 'ok  ', msg ); }

};
const section = ( s ) => console.log( '\n== ' + s );
const f2 = ( v ) => Number( v ).toFixed( 2 );

const KINDS = [ 'trawler', 'sloop', 'brigantine', 'frigate', 'revenue' ];
const NODE = { trawler: 'SM_Trawler', sloop: 'SM_Sloop', brigantine: 'SM_Brigantine', frigate: 'SM_Frigate', revenue: 'SM_Revenue' };
const ROOT_X = { trawler: 54.666, sloop: 0, brigantine: 24.533, frigate: 0, revenue: 0 };
const urlOf = ( k ) => SHIP_CLASSES[ k ].glb || SHIP_CLASSES[ k ].navyGlb;
const HULL = /HullPlank|SheerStripe|HullTar|NavyHull/;

function readGLB( url ) {

	const b = readFileSync( join( ROOT, 'public', url ) );
	const json = JSON.parse( b.subarray( 20, 20 + b.readUInt32LE( 12 ) ).toString( 'utf8' ) );
	const g = parseGLB( b.buffer.slice( b.byteOffset, b.byteOffset + b.byteLength ) );
	return { json, g, bytes: b.length, b };

}

// an image's size from its bytes (PNG / JPEG)
function imageSize( u8 ) {

	if ( u8[ 0 ] === 0x89 ) return [ ( u8[ 16 ] << 24 | u8[ 17 ] << 16 | u8[ 18 ] << 8 | u8[ 19 ] ) >>> 0, ( u8[ 20 ] << 24 | u8[ 21 ] << 16 | u8[ 22 ] << 8 | u8[ 23 ] ) >>> 0 ];
	let i = 2;
	while ( i < u8.length ) {

		if ( u8[ i ] !== 0xff ) { i ++; continue; }
		const m = u8[ i + 1 ];
		if ( m >= 0xc0 && m <= 0xc2 ) return [ u8[ i + 7 ] << 8 | u8[ i + 8 ], u8[ i + 5 ] << 8 | u8[ i + 6 ] ];
		i += 2 + ( u8[ i + 2 ] << 8 | u8[ i + 3 ] );

	}

	return [ 0, 0 ];

}

const trisOf = ( json ) => json.meshes.reduce( ( n, m ) => n + m.primitives.reduce( ( a, p ) => a + json.accessors[ p.indices ].count / 3, 0 ), 0 );

// the primitives with their material names (raw mesh positions: the node translation is the fork's layout offset)
function prims( g ) {

	const out = [];
	g.nodes.forEach( ( n ) => { if ( n.mesh !== undefined ) for ( const p of g.meshes[ n.mesh ] ) out.push( { name: g.materials[ p.material ].name, p } ); } );
	return out;

}

// a loaded-GLB stand-in for the carve: StaticGLB's meshes (node transform baked, 'ship-' + material), centred
function fakeGLB( g ) {

	const meshes = [];
	g.nodes.forEach( ( n ) => {

		if ( n.mesh === undefined ) return;
		const w = new Matrix4().compose( new Vector3( ...n.t ), new Quaternion( ...n.r ), new Vector3( ...n.s ) );
		for ( const p of g.meshes[ n.mesh ] ) {

			const geo = new BufferGeometry();
			geo.setAttribute( 'position', new BufferAttribute( Float32Array.from( p.attributes.POSITION.array ), 3 ).applyMatrix4( w ) );
			if ( p.attributes.NORMAL ) geo.setAttribute( 'normal', new BufferAttribute( Float32Array.from( p.attributes.NORMAL.array ), 3 ) );
			geo.setIndex( new BufferAttribute( Uint32Array.from( p.indices ), 1 ) );
			geo.computeBoundingBox();
			const m = new Mesh( geo, { name: 'ship-' + g.materials[ p.material ].name } );
			m.name = 'ship-' + g.materials[ p.material ].name;
			meshes.push( m );

		}

	} );
	return { meshes, materials: [] };

}

// ================================================================================================ 1. files
section( '1. the GLBs and their LOD files' );
const parsed = {};
for ( const k of KINDS ) {

	const url = urlOf( k );
	const files = [ 0, 1, 2 ].map( ( l ) => lodUrl( url, l ) );
	ok( files.every( ( f ) => existsSync( join( ROOT, 'public', f ) ) ), `${ k }: ${ files.join( ', ' ) }` );
	const L = files.map( readGLB );
	parsed[ k ] = L;
	const [ j0, j1, j2 ] = L.map( ( x ) => x.json );
	const names0 = j0.materials.map( ( m ) => m.name );
	ok( j0.nodes.length === 1 && j0.nodes[ 0 ].name === NODE[ k ] && j0.meshes[ 0 ].primitives.length === names0.length && new Set( names0 ).size === names0.length, `${ k }: one node ${ NODE[ k ] }, one primitive per material (${ names0.length })` );
	ok( Math.abs( ( j0.nodes[ 0 ].translation || [ 0 ] )[ 0 ] - ROOT_X[ k ] ) < 0.01 && Math.abs( ( j1.nodes[ 0 ].translation || [ 0 ] )[ 0 ] - ROOT_X[ k ] ) < 0.01, `${ k }: the fork's layout offset kept (${ ROOT_X[ k ] })` );
	const sizes = ( j0.images || [] ).map( ( im ) => { const bv = j0.bufferViews[ im.bufferView ]; const bin = 20 + L[ 0 ].b.readUInt32LE( 12 ) + 8; return imageSize( L[ 0 ].b.subarray( bin + ( bv.byteOffset || 0 ), bin + ( bv.byteOffset || 0 ) + bv.byteLength ) ); } );
	ok( sizes.length >= 4 && sizes.length <= 7 && sizes.every( ( [ w, h ] ) => w > 0 && w <= 512 && h <= 512 ), `${ k }: ${ sizes.length } maps, ${ sizes.map( ( s ) => s.join( 'x' ) ).join( ' ' ) }` );
	ok( names0.some( ( n ) => /SailCanvas/.test( n ) ) && names0.some( ( n ) => /SparTimber/.test( n ) ) && names0.some( ( n ) => /RiggingHemp/.test( n ) ) && names0.some( ( n ) => /Glass/.test( n ) ) && names0.some( ( n ) => /DeckPlank/.test( n ) ), `${ k }: canvas, spars, rigging (MastFall's), the lantern glass, the deck planks` );
	ok( names0.filter( ( n ) => MAST_MESH.test( n ) ).length >= 3 && ! names0.filter( ( n ) => MAST_MESH.test( n ) ).some( ( n ) => HULL.test( n ) ), `${ k }: a shot-away mast takes ${ names0.filter( ( n ) => MAST_MESH.test( n ) ).join( ', ' ) }` );
	const t = [ j0, j1, j2 ].map( trisOf );
	ok( t[ 0 ] > 9000 && t[ 0 ] < 39000 && t[ 1 ] < t[ 0 ] * 0.65 && t[ 2 ] < 2200 && t[ 2 ] < t[ 1 ] * 0.3, `${ k }: ${ t.join( ' / ' ) } triangles (LOD 0 / 1 / 2)` );
	const n1 = new Set( j1.materials.map( ( m ) => m.name ) ), n2 = new Set( j2.materials.map( ( m ) => m.name ) );
	ok( names0.every( ( n ) => n1.has( n ) && n2.has( n ) ), `${ k }: every material of the full model has a primitive in both LOD files (the geometry swap)` );
	ok( ! ( j1.images || [] ).length && ! ( j2.images || [] ).length && L[ 2 ].bytes < 120000, `${ k }: the LOD files carry no maps (${ ( L[ 1 ].bytes / 1e3 ).toFixed( 0 ) } / ${ ( L[ 2 ].bytes / 1e3 ).toFixed( 0 ) } kB)` );

}

// the player's four small boats (tools/ships/build_boats.py): one node in the boat frame, the keel at the draft, the bow (+Z)
// the narrower end, a sail on the cutter, the launch's cuddy glass
for ( const [ id, file ] of [ [ 'skiff', 'SM_MarshSkiff' ], [ 'canoe', 'SM_Outrigger' ], [ 'cutter', 'SM_SailCutter' ], [ 'launch', 'SM_CabinLaunch' ] ] ) {

	const { json, g } = readGLB( 'models/fleet/' + file + '.glb' ), b = BOATS[ id ];
	let bot = Infinity, zlo = Infinity, zhi = - Infinity;
	const pts = [];
	for ( const { p } of prims( g ) ) { const P = p.attributes.POSITION.array; for ( let i = 0; i < P.length; i += 3 ) { bot = Math.min( bot, P[ i + 1 ] ); if ( P[ i + 1 ] > - 0.05 && P[ i + 1 ] < 0.4 && Math.abs( P[ i ] ) < 1.2 ) { zlo = Math.min( zlo, P[ i + 2 ] ); zhi = Math.max( zhi, P[ i + 2 ] ); pts.push( P[ i ], P[ i + 2 ] ); } } }
	const w = ( z0, z1 ) => { let m = 0; for ( let i = 0; i < pts.length; i += 2 ) if ( pts[ i + 1 ] >= z0 && pts[ i + 1 ] <= z1 ) m = Math.max( m, Math.abs( pts[ i ] ) ); return m; };
	const names = json.materials.map( ( m ) => m.name ), tris = trisOf( json );
	ok( json.nodes.length === 1 && json.nodes[ 0 ].name === file && Math.abs( bot + b.draft ) < 0.02 && tris > 2500 && tris < 9000, `${ id }: ${ file }, keel ${ f2( bot ) } (draft ${ b.draft }), ${ tris } triangles` );
	ok( w( zhi - 0.4, zhi ) < w( - 1.6, - 1.2 ), `${ id }: the bow (+Z) is the fine end (${ f2( w( zhi - 0.4, zhi ) ) } vs ${ f2( w( - 1.6, - 1.2 ) ) } m)` );
	if ( id === 'cutter' ) ok( names.includes( 'M_NavalSailCanvas' ), 'cutter: her sail on the ship sail shader' );
	if ( id === 'launch' ) ok( names.some( ( n ) => /Glass/.test( n ) ), 'launch: the cuddy glass (the boat-glass of FleetBoatModel)' );

}

// ================================================================================================ 2. measurements
section( '2. the game\'s measurements' );
for ( const k of KINDS ) {

	const c = SHIP_CLASSES[ k ], g = parsed[ k ][ 0 ].g;
	let lo = Infinity, hi = - Infinity, alo = Infinity, ahi = - Infinity, wide = 0, bot = Infinity, top = - Infinity;
	for ( const { name, p } of prims( g ) ) {

		const P = p.attributes.POSITION.array;
		for ( let i = 0; i < P.length; i += 3 ) {

			alo = Math.min( alo, P[ i ] ); ahi = Math.max( ahi, P[ i ] ); bot = Math.min( bot, P[ i + 1 ] ); top = Math.max( top, P[ i + 1 ] );
			if ( HULL.test( name ) ) { lo = Math.min( lo, P[ i ] ); hi = Math.max( hi, P[ i ] ); wide = Math.max( wide, Math.abs( P[ i + 2 ] ) ); }

		}

	}

	ok( Math.abs( hi - lo - c.length ) < 0.6 && Math.abs( lo + hi ) < 0.3, `${ k }: hull ${ f2( hi - lo ) } m long (class ${ c.length }), centred (${ f2( ( lo + hi ) / 2 ) })` );
	ok( Math.abs( wide * 2 - c.beam ) < 0.4, `${ k }: beam ${ f2( wide * 2 ) } m (class ${ c.beam })` );
	ok( Math.abs( bot + c.draft ) < 0.05 && Math.abs( top - c.mast ) < 0.1, `${ k }: keel ${ f2( bot ) } (draft ${ c.draft }), masthead ${ f2( top ) } (class ${ c.mast })` );
	ok( Math.abs( alo + ahi ) < 0.05 && ahi > c.length / 2 + 1.5, `${ k }: the whole model's X extent centred (${ f2( alo ) } .. ${ f2( ahi ) }): the bowsprit balanced, centreOnHull leaves it` );

}

// the decks the player walks: every walkable surface of ShipDecks has planks at its height, the lines inside the hull
for ( const k of [ 'trawler', 'sloop', 'brigantine' ] ) {

	const spec = BOATS[ k ], lines = new SimpleHullLines( { ...spec, ...spec.hull } ), g = parsed[ k ][ 0 ].g;
	const tris = [], shell = [];
	for ( const { name, p } of prims( g ) ) {

		const P = p.attributes.POSITION.array, I = p.indices;
		if ( name === 'M_NavalDeckPlank' ) for ( let i = 0; i < I.length; i += 3 ) {

			// boat frame: x = -glTF z, z = glTF x
			const v = ( q ) => [ - P[ 3 * I[ i + q ] + 2 ], P[ 3 * I[ i + q ] + 1 ], P[ 3 * I[ i + q ] ] ];
			const a = v( 0 ), b = v( 1 ), cc = v( 2 );
			const nY = ( b[ 2 ] - a[ 2 ] ) * ( cc[ 0 ] - a[ 0 ] ) - ( b[ 0 ] - a[ 0 ] ) * ( cc[ 2 ] - a[ 2 ] );
			if ( nY > 0 ) tris.push( [ a, b, cc ] );

		}

		if ( /HullPlank|SheerStripe|HullTar/.test( name ) ) for ( let i = 0; i < P.length; i += 3 ) shell.push( [ - P[ i + 2 ], P[ i + 1 ], P[ i ] ] );

	}

	const heights = ( x, z ) => {

		const out = [];
		for ( const [ a, b, c ] of tris ) {

			const d = ( b[ 2 ] - c[ 2 ] ) * ( a[ 0 ] - c[ 0 ] ) + ( c[ 0 ] - b[ 0 ] ) * ( a[ 2 ] - c[ 2 ] );
			if ( Math.abs( d ) < 1e-12 ) continue;
			const l1 = ( ( b[ 2 ] - c[ 2 ] ) * ( x - c[ 0 ] ) + ( c[ 0 ] - b[ 0 ] ) * ( z - c[ 2 ] ) ) / d;
			const l2 = ( ( c[ 2 ] - a[ 2 ] ) * ( x - c[ 0 ] ) + ( a[ 0 ] - c[ 0 ] ) * ( z - c[ 2 ] ) ) / d;
			if ( l1 < - 1e-6 || l2 < - 1e-6 || 1 - l1 - l2 < - 1e-6 ) continue;
			out.push( l1 * a[ 1 ] + l2 * b[ 1 ] + ( 1 - l1 - l2 ) * c[ 1 ] );

		}

		return out;

	};
	let n = 0, miss = 0, worst = 0;
	for ( const s of walkSurfaces( k ) ) {

		for ( let z = s.z0 + 0.07; z < s.z1; z += 0.3 ) for ( let x = Math.max( s.x0, - 3 ) + 0.13; x < Math.min( s.x1, 3 ); x += 0.35 ) {

			if ( Math.abs( x ) > lines.halfBreadth( lines.tAtSheerZ( z ), s.y ) - lines.shell - 0.3 ) continue;
			n ++;
			const h = heights( x, z ).filter( ( y ) => y > s.y - 0.04 && y < s.y + 0.16 );
			if ( ! h.length ) { miss ++; continue; }
			worst = Math.max( worst, Math.min( ...h.map( ( y ) => Math.abs( y - s.y ) ) ) );

		}

	}

	ok( n > 200 && miss <= n * 0.02 && worst < 0.11, `${ k }: planks under every walkable surface (${ n } samples, ${ miss } missed, worst ${ f2( worst ) } m off its level)` );
	// the collision lines' sheer inside the hull shell, at the deck .. rail band
	let short = 0, tested = 0;
	for ( let t = 0.03; t < 0.95; t += 0.04 ) {

		const z = lines.sheerZ( t ), y = helmDeckY( spec ) + 0.4;
		if ( z > lines.zBow - 1.5 ) continue;
		const w = shell.filter( ( p ) => Math.abs( p[ 2 ] - z ) < 0.3 && p[ 1 ] > spec.deckY && p[ 1 ] < y + 0.6 ).reduce( ( a, p ) => Math.max( a, Math.abs( p[ 0 ] ) ), 0 );
		tested ++;
		if ( w < lines.sheerX( t ) - 0.03 ) short ++;

	}

	ok( tested > 15 && short === 0, `${ k }: the collision lines' sheer lies inside the hull (${ tested } stations)` );
	if ( spec.broadside ) {

		const bad = spec.broadside.z.filter( ( z ) => shell.filter( ( p ) => Math.abs( p[ 2 ] - z ) < 0.4 && p[ 1 ] >= spec.deckY && p[ 1 ] <= spec.deckY + 0.8 ).reduce( ( a, p ) => Math.max( a, Math.abs( p[ 0 ] ) ), 0 ) < spec.broadside.x + 0.1 );
		ok( ! bad.length, `${ k }: the swivel mounts stand inside the side (${ spec.broadside.z.length } stations)` );

	}

}

// ================================================================================================ 3. the UV codes
section( '3. sails and flags carry the codes the shader reads' );
for ( const k of KINDS ) {

	const g = parsed[ k ][ 0 ].g;
	let sails = 0, coded = 0, badKind = 0, flags = 0, flagBad = 0;
	for ( const { name, p } of prims( g ) ) {

		const UV = p.attributes.TEXCOORD_0 && p.attributes.TEXCOORD_0.array;
		if ( ! UV ) continue;
		if ( /SailCanvas/.test( name ) ) for ( let i = 0; i < UV.length; i += 2 ) {

			sails ++;
			const code = Math.floor( UV[ i ] * 0.5 ), kind = Math.floor( ( 1 - UV[ i + 1 ] ) * 0.5 ), t = UV[ i + 1 ] + 2 * kind;
			if ( code > 0 ) coded ++;
			if ( kind < 0 || kind > 1 || t < - 1e-4 || t > 1 + 1e-4 ) badKind ++;

		}

		if ( /FlagCanvas|NavyBlueCanvas/.test( name ) ) for ( let i = 0; i < UV.length; i += 2 ) {

			flags ++;
			const code = Math.floor( UV[ i ] * 0.5 ), u = UV[ i ] - 2 * code;
			if ( code < 3 || ! ( ( u >= 0.009 && u <= 0.491 ) || ( u >= 0.509 && u <= 0.991 ) ) ) flagBad ++;

		}

	}

	ok( sails > 100 && coded > sails * 0.6 && badKind === 0, `${ k }: ${ sails } sail vertices, ${ coded } with a belly code, kinds 0 / 1 only` );
	ok( flags >= 8 && flagBad === 0, `${ k }: ${ flags } flag vertices, each with its length and an atlas cell` );

}

// ================================================================================================ 4. the wheels
section( '4. the helm wheels the game turns' );
for ( const k of [ 'trawler', 'sloop', 'brigantine' ] ) {

	const glb = fakeGLB( parsed[ k ][ 0 ].g );
	centreOnHull( glb );
	const w = await carveShipWheel( k, glb );
	const spec = BOATS[ k ];
	ok( w && w.triangles > 100 && Math.abs( w.position.z - ( spec.helm.z + 0.55 ) ) < 1e-6 && Math.abs( w.position.y - ( helmDeckY( spec ) + 1.05 ) ) < 1e-6, `${ k }: the baked wheel carved out (${ w ? w.triangles : 0 } triangles) at the helm` );

}

for ( const k of [ 'frigate', 'revenue' ] ) {

	const glb = fakeGLB( parsed[ k ][ 0 ].g );
	centreOnHull( glb );
	const w = liftWheel( glb );
	const c = SHIP_CLASSES[ k ].wheel;
	ok( w && Math.abs( w.position.x ) < 0.05 && Math.abs( w.position.y - c.y ) < 0.1 && Math.abs( w.position.z - c.z ) < 0.1, `${ k }: the wheel lifted out at ${ w ? [ w.position.x, w.position.y, w.position.z ].map( f2 ).join( ', ' ) : '-' } (class ${ c.y } / ${ c.z })` );

}

// ================================================================================================ 5. LOD choice and the materials (no GPU)
section( '5. the level by distance, the ship materials' );
ok( lodFor( 20, 0 ) === 0 && lodFor( LOD_DIST[ 0 ] * 1.2, 0 ) === 1 && lodFor( LOD_DIST[ 1 ] * 1.2, 1 ) === 2 && lodFor( LOD_DIST[ 1 ] * 1.2, 0 ) === 2, 'near: full, mid: LOD 1, far: LOD 2' );
ok( lodFor( LOD_DIST[ 0 ] * 1.04, 0 ) === 0 && lodFor( LOD_DIST[ 0 ] * 0.96, 1 ) === 1 && lodFor( LOD_DIST[ 0 ] * 0.9, 1 ) === 0, 'a margin each way: a ship at the edge does not flicker' );
ok( lodUrl( 'models/ships/sloop_v2.glb', 1 ) === 'models/ships/sloop_v2_lod1.glb' && lodUrl( 'models/navy/frigate.glb', 2 ) === 'models/navy/frigate_lod2.glb' && lodUrl( 'models/navy/frigate.glb', 0 ) === 'models/navy/frigate.glb', 'LOD files beside the class GLB' );
{

	const mk = ( name ) => ( { name, vertex: '', surface: '', side: 'front', defines: {}, version: 0, set needsUpdate( v ) { if ( v ) this.version ++; } } );
	const glb = { materials: [ mk( 'ship-M_NavalSailCanvas' ), mk( 'ship-M_NavalFlagCanvas' ), mk( 'ship-M_NavalHullPlank' ), mk( 'ship-M_NavalIron' ), mk( 'boat-M_NavyBlueCanvas' ) ] };
	const n = shipMaterials( glb );
	const [ sail, flag, hull, iron, navyFlag ] = glb.materials;
	ok( n === 4 && shipMaterials( glb ) === 0, 'four of five materials taught, once' );
	ok( sail.side === 'double' && /sDepth/.test( sail.vertex ) && ! /SAIL_SIDE|SAIL_BRACE/.test( sail.vertex ) && sail.vertex.includes( Math.cos( SAIL_BRACE ).toFixed( 6 ) ) && /back/.test( sail.surface ) && sail.version > 0, 'sails: double sided, the wind in the belly, braced square sails, the glow from behind' );
	ok( flag.side === 'double' && /fLen/.test( flag.vertex ) && navyFlag.side === 'double' && /fLen/.test( navyFlag.vertex ), 'flags (the navy\'s blue canvas too) wave' );
	ok( /wet/.test( hull.surface ) && hull.side === 'front' && iron.vertex === '' && iron.surface === '', 'the hull darkens at the waterline; iron is left alone' );
	const m2 = { materials: [ mk( 'boat-M_NavalSailCanvas' ) ] };
	shipMaterials( m2, { mirrored: true } );
	ok( m2.materials[ 0 ].vertex.includes( '( - 1.0 )' ) && ! sail.vertex.includes( '( - 1.0 )' ), 'a mirrored hull (the player\'s brigantine) takes the belly on the other side' );

}

// ================================================================================================ 6. on a headless GPU
if ( ! NO_GPU ) {

	section( '6. naval\'s ModelSet on a headless GPU: LOD swaps, a fleet of twelve, one frame' );
	const { worldHarness } = await import( './world-harness.mjs' );
	const H = await worldHarness( { width: 960, height: 540 } );
	const errors = [];
	H.GPU.onError( ( e ) => errors.push( e ) );
	globalThis.__assetFile = async ( url ) => { const b = readFileSync( join( ROOT, 'public', url.replace( /^\//, '' ) ) ); return b.buffer.slice( b.byteOffset, b.byteOffset + b.byteLength ); };
	globalThis.__assetImage = async () => ( { data: new Uint8Array( 16 ).fill( 170 ), width: 2, height: 2 } );
	const set = new ModelSet( { scene: H.scene, baseUrl: '/' } );
	drawNavy( set );
	const vis = {};
	for ( const k of KINDS ) {

		const v = set.create( k );
		await set.ready( k );
		vis[ k ] = v;
		const sail = v.meshes.find( ( m ) => /SailCanvas/.test( m.name ) );
		ok( v.loaded && sail && sail.material.side === 'double' && /sDepth/.test( sail.material.vertex ), `${ k }: loaded, ${ v.meshes.length } meshes, the sail shader on` );
		ok( v.lod === 0 && v.meshes.every( ( m ) => m.geometry === m.userData.geo0 ), `${ k }: starts at full detail` );

	}

	// far away: the LOD file loads, then the visual swaps every mesh's geometry
	const ship = ( k, d ) => { const s = new Ship( k, { x: 0, z: d, yaw: 0 } ); s.dist = d; return s; };
	for ( const k of KINDS ) {

		const v = vis[ k ], s = ship( k, 400 );
		v.apply( s, s.finalPose( {} ) );
		await set._lodTemplate( k, 2 ).promise;
		v.apply( s, s.finalPose( {} ) );
		const tri = v.meshes.reduce( ( a, m ) => a + ( m.geometry.index ? m.geometry.index.count : 0 ) / 3, 0 );
		ok( v.lod === 2 && tri < 2200 && v.meshes.every( ( m ) => m.geometry !== m.userData.geo0 ) && ( ! v.wheelPivot || ! v.wheelPivot.visible ) && v.meshes.every( ( m ) => ! m.castShadow ), `${ k }: at 400 m the far silhouette (${ tri } triangles), no wheel, no shadow` );
		const hidden = v.meshes.filter( ( m ) => ! m.visible );
		ok( hidden.every( ( m ) => m.userData.lodHidden && m.geometry.userData.lodStandIn ) && v.meshes.filter( ( m ) => m.visible ).every( ( m ) => ! ( m.geometry.userData && m.geometry.userData.lodStandIn ) ), `${ k }: the materials LOD 2 has nothing of are not drawn (${ hidden.length } of ${ v.meshes.length } meshes)` );
		const s1 = ship( k, 120 );
		v.apply( s1, s1.finalPose( {} ) );
		await set._lodTemplate( k, 1 ).promise;
		v.apply( s1, s1.finalPose( {} ) );
		ok( v.lod === 1, `${ k }: at 120 m LOD 1` );
		const s0 = ship( k, 12 );
		v.apply( s0, s0.finalPose( {} ) );
		ok( v.lod === 0 && v.meshes.every( ( m ) => m.geometry === m.userData.geo0 && m.visible ) && ( ! v.wheelPivot || v.wheelPivot.visible ), `${ k }: back to full detail at 12 m, every mesh drawn, the wheel again` );

	}

	// a mast shot away at a distance stays down when the ship comes near (the LOD swap leaves MastFall's hiding alone)
	{

		const { hideMast } = await import( '../src/features/naval/MastFall.js' );
		const v = vis.brigantine, far = ship( 'brigantine', 400 ), near = ship( 'brigantine', 12 );
		v.apply( far, far.finalPose( {} ) );
		const gone = hideMast( v.group );
		v.apply( near, near.finalPose( {} ) );
		const back = v.meshes.filter( ( m ) => /spar|sail|canvas|rigging|mast/i.test( m.name ) && m.visible );
		ok( v.lod === 0 && gone.length >= 2 && back.length === 0, `a mast shot away at LOD 2 stays down at full detail (${ gone.length } hidden, ${ back.length } back)` );
		for ( const m of v.meshes ) { m.visible = true; m.userData.lodHidden = false; }


	}

	// a fleet of twelve on screen at 40..560 m: the triangles drawn stay inside the budget
	const fleet = [];
	let tris = 0;
	for ( let i = 0; i < 12; i ++ ) {

		const k = KINDS[ i % KINDS.length ], d = 40 + i * 47;
		const v = set.create( k ), s = ship( k, d );
		s.x = ( i % 3 - 1 ) * 30;
		for ( const l of [ 1, 2 ] ) await set._lodTemplate( k, l ).promise;
		v.apply( s, s.finalPose( {} ) );
		v.setNear( d < 220 );
		v.setVisible( true );
		fleet.push( v );
		tris += v.meshes.reduce( ( a, m ) => a + ( m.geometry.index ? m.geometry.index.count : 0 ) / 3, 0 );

	}

	ok( tris < 120000, `twelve ships at 40..560 m: ${ Math.round( tris ) } triangles (budget 120 000; ${ fleet.map( ( v ) => v.lod ).join( '' ) })` );
	for ( const v of Object.values( vis ) ) v.setVisible( false );
	H.setView( { pos: [ 0, 8, - 30 ], target: [ 0, 6, 200 ], fov: 55 } );
	H.renderFrame();
	await H.GPU.queue.onSubmittedWorkDone();
	ok( errors.length === 0, `one frame of the fleet drawn (sails, flags, hulls compiled): ${ errors.length } GPU errors${ errors.length ? ' ' + JSON.stringify( errors[ 0 ] ).slice( 0, 300 ) : '' }` );
	set.dispose();

}

console.log( `\n${ passes } passed, ${ fails } failed` );
process.exit( fails ? 1 : 0 );
