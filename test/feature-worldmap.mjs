// Plain-node tests of the world map (src/features/worldmap + src/ui/WorldMap.js marker logic): the bounds, the fog grid
// and its save, the pan / zoom view, the waypoint (feature, minimap hand-off, arrival), discovery, the marker list
// (stalls, ports, ships, bounties, search zones, seaplane, peers, boat) and the shared terrain bake.
import { WORLD } from '../src/world/WorldLayout.js';
import { install, WorldMapFeature } from '../src/features/worldmap/index.js';
import { FogGrid, MapView, worldBounds, edgeClamp, niceScale, pickWaypoint, revealRadius, compass, viewAngle, yawAngle, FOG_CELL } from '../src/features/worldmap/MapLogic.js';
import { WorldMap } from '../src/ui/WorldMap.js';
import { Minimap, TerrainBake, ICON } from '../src/game/Minimap.js';
import { CAMP } from '../src/features/melee/MeleeData.js';

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) { fails ++; console.log( 'FAIL', msg ); } else console.log( 'ok  ', msg );

};
const near = ( a, b, e = 1e-6 ) => Math.abs( a - b ) <= e;

// ---- bounds: the heightmap plus every island and port
{

	const B = worldBounds( WORLD, { size: 2048, origin: - 1024 } );
	ok( B.x0 <= - 1024 && B.z0 <= - 1024 && B.x1 >= 1024 && B.z1 >= 1024, 'bounds cover the heightmap' );
	const inside = ( x, z ) => x > B.x0 && x < B.x1 && z > B.z0 && z < B.z1;
	ok( WORLD.islands.every( ( i ) => inside( i.center.x, i.center.z ) ) && WORLD.ports.every( ( p ) => inside( p.stand.x, p.stand.z ) ), 'every island and port is inside' );
	const far = worldBounds( { islands: [ { id: 'far', center: { x: 3000, z: - 2500 }, radius: 100 } ], ports: [] }, { size: 2048, origin: - 1024 } );
	ok( far.x1 >= 3100 && far.z0 <= - 2600, 'an island beyond the heightmap widens the map' );
	const none = worldBounds( {}, null );
	ok( none.x0 < 0 && none.x1 > 0, 'no data: a default square' );

}

// ---- fog grid
{

	const B = { x0: - 1024, z0: - 1024, x1: 1024, z1: 1024 };
	const f = new FogGrid( B, FOG_CELL );
	ok( f.nx === 32 && f.nz === 32 && f.count === 0, 'a 2048 m world: 32 x 32 cells of 64 m, all fogged' );
	const v0 = f.version;
	const n = f.reveal( 0, 0, 120 );
	ok( n > 4 && f.count === n && f.version > v0, `revealing 120 m clears ${ n } cells and bumps the version` );
	ok( f.revealedAt( 10, - 10 ) && ! f.revealedAt( 900, 900 ), 'revealedAt: near yes, far no' );
	ok( f.reveal( 0, 0, 120 ) === 0, 'revealing the same place again adds nothing' );
	ok( f.reveal( 500, 500, 0 ) === 1, 'radius 0 still clears the cell underfoot' );
	ok( f.reveal( NaN, 0, 100 ) === 0 && f.reveal( 99999, 99999, 50 ) === 0, 'bad or outside positions reveal nothing' );
	const soft = f.softAt( null, 0, 0 );
	ok( soft > 0.5 && f.softAt( null, - 900, - 900 ) === 0, 'softAt: explored ~1, unexplored 0' );
	const mask = f.circleMask( [ { x: - 600, z: - 600, r: 100 } ] );
	ok( mask[ f.index( - 600, - 600 ) ] === 1 && ! mask[ f.index( 600, - 600 ) ], 'circleMask marks a charted island' );
	ok( f.softAt( mask, - 600, - 600 ) > 0.5, 'softAt counts the charted mask' );

	// save round trip
	const j = JSON.parse( JSON.stringify( f.toJSON() ) );
	const g = new FogGrid( B, FOG_CELL );
	ok( g.fromJSON( j ) && g.count === f.count && g.revealedAt( 0, 0 ) && g.revealedAt( 500, 500 ), 'fog survives the save' );
	ok( j.bits.length === Math.ceil( 32 * 32 / 4 ), 'the save is compact (4 cells per hex digit)' );

	// a grown world: the old cells are remapped by their centres
	const big = new FogGrid( { x0: - 2048, z0: - 1024, x1: 2048, z1: 2048 }, FOG_CELL );
	ok( big.fromJSON( j ) && big.count === f.count && big.revealedAt( 0, 0 ) && big.revealedAt( 500, 500 ), 'an older grid is remapped onto wider bounds' );

	// junk is refused
	ok( ! g.fromJSON( null ) && g.count === 0, 'null clears' );
	ok( ! g.fromJSON( { bits: 'zz', cell: 64, x0: 0, z0: 0, nx: 1, nz: 1 } ) && ! g.fromJSON( { bits: 'f', cell: - 1, x0: 0, z0: 0, nx: 1, nz: 1 } ), 'bad data is refused' );
	ok( ! g.fromJSON( { bits: '', cell: 64, x0: 0, z0: 0, nx: 1e6, nz: 1e6 } ), 'an absurd grid is refused' );
	g.revealAll();
	ok( g.count === g.cells.length, 'revealAll' );
	g.clear();
	ok( g.count === 0, 'clear' );

}

// ---- the view: pan / zoom, clamped
{

	const B = { x0: - 1000, z0: - 1000, x1: 1000, z1: 1000 };
	const v = new MapView( B );
	v.setSize( 1000, 500 );
	ok( near( v.kMin, 0.25 ), 'kMin fits the whole world (500 px / 2000 m)' );
	v.k = 100;
	v.clamp();
	ok( v.k === v.kMax, 'zoom clamps to kMax' );
	v.k = 0.001;
	v.clamp();
	ok( v.k === v.kMin && v.cx === 0 && v.cz === 0, 'zoomed all the way out: the world is centred' );
	v.k = 1;
	v.centerOn( 100, - 200 );
	const s = v.toScreen( 130, - 180 ), w = v.toWorld( s.x, s.y );
	ok( near( w.x, 130 ) && near( w.z, - 180 ), 'toScreen / toWorld are inverse' );
	ok( near( s.x, 530 ) && near( s.y, 270 ), 'north up, x right, z down' );
	const before = v.toWorld( 800, 100 );
	v.zoomAt( 1.5, 800, 100 );
	const after = v.toWorld( 800, 100 );
	ok( near( before.x, after.x, 1e-6 ) && near( before.z, after.z, 1e-6 ), 'wheel zoom keeps the point under the cursor' );
	v.centerOn( 99999, 99999 );
	ok( v.cx + v.w / 2 / v.k <= 1000 + 1e-9 && v.cz + v.h / 2 / v.k <= 1000 + 1e-9, 'panning stops at the world edge' );
	const cx = v.cx;
	v.panBy( - 100, 0 );
	ok( v.cx === cx, 'a drag past the edge does not move' );
	v.panBy( 100, 0 );
	ok( v.cx < cx, 'dragging right moves the view west' );

}

// ---- the view keeps the title bar and the status line clear
{

	const B = { x0: - 1000, z0: - 1000, x1: 1000, z1: 1000 };
	const v = new MapView( B );
	v.setSize( 1000, 800 );
	v.setInsets( { top: 70, bottom: 60, left: 10, right: 10 } );
	v.fit();
	ok( near( v.k, 670 / 2000 ), 'the fit uses the free height (800 - 70 - 60)' );
	const nw = v.toScreen( B.x0, B.z0 ), se = v.toScreen( B.x1, B.z1 );
	ok( nw.y >= 70 - 1e-6 && se.y <= 800 - 60 + 1e-6 && nw.x >= 10 && se.x <= 990, 'fitted: the whole world lies inside the free area' );
	ok( near( ( nw.y + se.y ) / 2, ( 70 + 740 ) / 2 ), 'and is centred in it' );
	v.zoomAt( 3 );
	v.centerOn( - 99999, - 99999 );
	const nw2 = v.toScreen( B.x0, B.z0 );
	ok( near( nw2.y, 70 ) && near( nw2.x, 10 ), 'zoomed in at the north-west corner: the world edge stops below the title bar' );
	v.centerOn( 99999, 99999 );
	const se2 = v.toScreen( B.x1, B.z1 );
	ok( near( se2.y, 740 ) && near( se2.x, 990 ), 'and at the south-east corner above the status line' );
	v.setInsets( { top: 5000 } );
	ok( v.freeH === 200 && v.k >= v.kMin, 'absurd insets keep a usable area' );
	v.setInsets( {} );
	ok( near( v.kMin, 800 / 2000 ), 'no insets: the plain fit' );

}

// ---- helpers
{

	const in1 = edgeClamp( 100, 100, 400, 300, 20 );
	ok( ! in1.edge && in1.x === 100, 'edgeClamp: inside stays' );
	const out = edgeClamp( 2000, 150, 400, 300, 20 );
	ok( out.edge && near( out.x, 380 ) && near( out.y, 150 ) && near( out.angle, Math.PI / 2 ), 'edgeClamp: off to the east sits on the edge, chevron east' );
	const up = edgeClamp( 200, - 5000, 400, 300, 20 );
	ok( up.edge && near( up.y, 20 ) && near( up.angle, 0 ), 'edgeClamp: north is angle 0' );
	const sc = niceScale( 0.5, 110 );
	ok( sc.metres === 200 && sc.px === 100 && sc.label === '200 m', 'scale bar: 200 m at 0.5 px/m' );
	ok( niceScale( 0.05, 110 ).label === '2 km', 'scale bar in km' );
	const wp = pickWaypoint( null, 12.345, - 7.89, 1 );
	ok( wp && wp.x === 12.3 && wp.z === - 7.9, 'a click sets a rounded waypoint' );
	ok( pickWaypoint( wp, 14, - 8, 1, 16 ) === null, 'a click on the waypoint clears it' );
	const moved = pickWaypoint( wp, 200, 50, 1, 16 );
	ok( moved && moved.x === 200, 'a click elsewhere moves it' );
	ok( pickWaypoint( wp, NaN, 0, 1 ) === wp, 'a bad click keeps it' );
	ok( revealRadius( 'walk' ) === 120 && revealRadius( 'boat' ) === 240 && revealRadius( 'walk', 200 ) > 400 && revealRadius( 'walk', 1e6 ) === 900, 'reveal radius: on foot, at sea, up high (capped)' );
	ok( compass( 0, - 10 ) === 'N' && compass( 10, 0 ) === 'E' && compass( - 5, 5 ) === 'SW', 'compass words (north is -z)' );
	ok( near( viewAngle( 1, 0 ), Math.PI / 2 ) && near( yawAngle( 0 ), Math.PI ) && near( yawAngle( Math.PI / 2 ), Math.PI / 2 ), 'view / yaw angles' );

}

// ---- the feature: waypoint, discovery, fog, save
const mkFeatures = ( { sandbox = false, discovered = [] } = {} ) => {

	const events = [];
	const reg = new Map();
	const claims = [];
	const f = {
		sandbox, state: { discovered },
		claimKey: ( code, name ) => { claims.push( [ code, name ] ); return true; },
		emit: ( n, d ) => events.push( [ n, d ] ),
		get: ( n ) => reg.get( n ) || null,
		events, reg, claims,
	};
	return f;

};

{

	const minimapCalls = [];
	const toasts = [];
	const app = {
		terrainData: { size: 2048, origin: - 1024 },
		player: { position: { x: 0, y: 2, z: 0 }, mode: 'walk' },
		camera: { position: { x: 0, y: 6, z: 4 } },
		game: { minimap: { setWaypoint: ( p ) => minimapCalls.push( p ) }, toast: ( s ) => toasts.push( s ) },
	};
	const F = mkFeatures( { discovered: [ 'pons' ] } );
	const m = install( app, F );
	ok( m instanceof WorldMapFeature, 'install returns the feature' );
	ok( F.claims.some( ( [ c, n ] ) => c === 'KeyM' && n === 'worldmap' ), 'claims M' );
	ok( ! m.isOpen && ! m.wantsMouse(), 'closed at start (no DOM: no UI)' );
	ok( m.open() === false && ! m.isOpen, 'open without a HUD does nothing' );
	ok( m.discovered( 'home' ) && m.discovered( 'pons' ) && ! m.discovered( 'gull' ), 'discovery follows GameState.discovered (home always)' );

	m.setWaypoint( { x: 300, z: 200 } );
	ok( m.waypoint.x === 300 && F.events.some( ( [ n, d ] ) => n === 'waypointChanged' && d.waypoint.x === 300 ), 'setWaypoint emits waypointChanged' );
	ok( minimapCalls.length === 1 && minimapCalls[ 0 ].x === 300, 'the minimap gets the waypoint' );
	m.setWaypoint( { x: 300, z: 200 } );
	ok( F.events.filter( ( [ n ] ) => n === 'waypointChanged' ).length === 1, 'the same waypoint again is not re-emitted' );
	m.update( 0.3 );
	ok( minimapCalls.length === 1, 'no repeated minimap writes per frame' );
	ok( m.fog.revealedAt( 0, 0 ) && ! m.fog.revealedAt( 600, 600 ), 'update reveals the fog around the player' );

	// a minimap built later (the HUD is lazy) still gets the waypoint
	const later = [];
	app.game.minimap = { setWaypoint: ( p ) => later.push( p ) };
	m.update( 0.01 );
	ok( later.length === 1 && later[ 0 ].x === 300, 'a new minimap is synced' );

	// the free camera does not lift the fog
	app.freeCam = true;
	app.player.position = { x: 800, y: 2, z: 800 };
	m.update( 1 );
	ok( ! m.fog.revealedAt( 800, 800 ), 'the free camera reveals nothing' );
	app.freeCam = false;

	// save
	const j = JSON.parse( JSON.stringify( m.toJSON() ) );
	const m2 = install( { ...app, game: { minimap: null } }, mkFeatures() );
	m2.fromJSON( j );
	ok( m2.waypoint && m2.waypoint.x === 300 && m2.fog.count === m.fog.count && m2.fog.revealedAt( 0, 0 ), 'fog and waypoint survive the save' );
	m2.fromJSON( { v: 1, fog: null, wp: { x: 'a' } } );
	ok( m2.waypoint === null && m2.fog.count === 0, 'a broken save loads empty' );
	m2.fromJSON( null );
	ok( m2.fog.count === 0, 'null is ignored' );

	// arrival clears the waypoint
	app.player.position = { x: 305, y: 1, z: 195 };
	m.update( 0.3 );
	ok( m.waypoint === null && toasts.some( ( s ) => /waypoint/i.test( s ) ), 'reaching the waypoint clears it with a toast' );
	ok( later[ later.length - 1 ] === null, 'and clears the minimap flag' );

	m.setWaypoint( { x: 1, z: 2 } );
	m.reset();
	ok( m.waypoint === null && m.fog.count === 0, 'reset: no waypoint, all fogged' );

	// sandbox: everything charted
	const s = install( app, mkFeatures( { sandbox: true } ) );
	ok( s.discovered( 'gull' ) && s.discovered( 'anything' ), 'the sandbox charts every island' );
	s.dispose();
	m.dispose();

}

// ---- the marker list (WorldMap._collect without a DOM)
{

	const reg = new Map();
	const feats = { get: ( n ) => reg.get( n ) || null };
	const F = { discovered: ( id ) => id === 'home' || id === 'pons', waypoint: { x: 10, z: 20 }, sandbox: false };
	const app = {
		features: feats,
		player: { position: { x: 0, y: 0, z: 0 }, mode: 'walk' },
		camera: { position: { x: 0, y: 5, z: 5 }, matrixWorld: { elements: [ 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1 ] } },
		boatCtl: { position: { x: 70, z: - 20 } },
		game: { state: { boat: 'skiff' } },
		ports: { markers: [ { id: 'gull', x: - 555, z: 198, icon: 'anchor' }, { id: 'pons-light', x: 600, z: 500, icon: 'fish' } ] },
		remotePlayers: { peers: new Map( [
			[ 'a', { id: 'a', name: 'Ana', hasPose: true, pose: { mode: 'walk', position: { x: 5, z: 5 } } } ],
			[ 'b', { id: 'b', name: 'Bo', hasPose: true, pose: { mode: 'boat', position: { x: 50, z: 60 } } } ],
			[ 'c', { id: 'c', name: 'Cy', hasPose: false, pose: { mode: 'walk', position: { x: 0, z: 0 } } } ],
		] ) },
	};
	reg.set( 'naval', { ships: [
		{ id: 1, alive: true, faction: 'pirate', x: 300, z: 300 },
		{ id: 2, alive: true, faction: 'pirate', x: 400, z: 300, bounty: { id: 'n1', captain: 'Red Mara' } },
		{ id: 3, alive: false, faction: 'pirate', x: 0, z: 0 },
		{ id: 4, alive: true, faction: 'merchant', x: 1, z: 1 },
	] } );
	reg.set( 'notices', { active: [
		{ id: 'n1', kind: 'bounty', region: { x: 400, z: 300 }, captain: 'Red Mara' },
		{ id: 'n2', kind: 'bounty', region: { x: - 300, z: 500 }, captain: 'Black Ivo' },
		{ id: 'n3', kind: 'notice', region: { x: 1, z: 1 } },
	] } );
	reg.set( 'pirates', { searchZones: () => [ { id: 'z1', x: 200, z: - 400, r: 250, captain: 'Old Vane' }, { id: 'z2', center: { x: 10, z: 10 }, radius: 90 }, { id: 'bad' }, { id: 'n2', x: 0, z: 0 } ] } );
	reg.set( 'seaplane', { marker: () => ( { x: 90, z: 90, heading: Math.PI / 2 } ) } );
	reg.set( 'trade', { sites: { home: { x: 57.8, z: - 75.2 }, pons: { x: 500, z: 480 } } } );

	const wm = Object.create( WorldMap.prototype );
	wm.app = app;
	wm.feature = F;
	const list = [];
	wm._collect( list );
	const keys = new Set( list.map( ( m ) => m.key ) );
	const get = ( k ) => list.find( ( m ) => m.key === k );
	ok( keys.has( 'joe' ) && keys.has( 'marta' ) && keys.has( 'yard' ) && keys.has( 'pons' ), 'the home stall, chandlery, Captain Roid’s yard and Pons' );
	ok( get( 'camp' ) && get( 'camp' ).x === CAMP.x && get( 'camp' ).z === CAMP.z && CAMP.x === 127 && CAMP.z === - 71, 'the raider camp at (127, -71)' );
	ok( ! keys.has( 'port:gull' ) && ! keys.has( 'port:key' ), 'undiscovered ports have no marker' );
	ok( keys.has( 'board:home' ) && keys.has( 'board:pons' ) && keys.has( 'trade:home' ) && keys.has( 'trade:pons' ), 'notice boards and trade stalls of charted ports' );
	ok( get( 'ship:1' ).kind === 'pirate' && ! keys.has( 'ship:3' ) && ! keys.has( 'ship:4' ), 'live pirate ships only' );
	ok( get( 'ship:2' ).kind === 'bounty' && get( 'ship:2' ).label === 'Red Mara' && get( 'ship:2' ).edge, 'a bounty target: labelled, kept on the edge' );
	const regions = wm._regionList;
	ok( regions.some( ( r ) => r.key === 'n2' && ! r.zone ) && ! regions.some( ( r ) => r.key === 'n1' ), 'a hunted bounty with no ship shows its region; one with a ship does not' );
	ok( regions.some( ( r ) => r.key === 'zone:z1' && r.zone && r.r === 250 && r.label === 'Old Vane' ), 'pirate search zones (x / z / r)' );
	ok( regions.some( ( r ) => r.key === 'zone:z2' && r.r === 90 && r.x === 10 ), 'search zones (center / radius)' );
	ok( ! regions.some( ( r ) => r.key === 'zone:bad' ) && ! regions.some( ( r ) => r.key === 'zone:n2' ), 'malformed and duplicate zones are skipped' );
	const pl = get( 'plane' );
	ok( pl && pl.x === 90 && near( pl.rot, Math.PI / 2 ), 'the seaplane, turned to its heading' );
	ok( get( 'boat' ) && get( 'boat' ).x === 70, 'the boat moored elsewhere' );
	ok( get( 'peer:a' ).label === 'Ana' && get( 'peer:b' ).kind === 'peer is-boat' && ! keys.has( 'peer:c' ), 'remote players with names (at sea marked), none before a pose' );
	ok( get( 'wp' ) && get( 'wp' ).edge, 'the waypoint, kept on the edge' );
	ok( get( 'me' ) && get( 'me' ).edge && near( get( 'me' ).rot, 0 ), 'the player, heading from the camera (identity view looks -z = north, up)' );

	// aboard: no separate boat marker; a pirates feature that throws is ignored
	app.player.mode = 'boat';
	reg.set( 'pirates', { searchZones: () => { throw new Error( 'x' ); } } );
	reg.delete( 'seaplane' );
	const l2 = [];
	wm._collect( l2 );
	ok( ! l2.some( ( m ) => m.key === 'boat' ) && ! l2.some( ( m ) => m.key === 'plane' ), 'aboard: no boat marker; no seaplane feature: no plane' );
	ok( ! wm._regionList.some( ( r ) => r.zone ), 'a failing searchZones is ignored' );

	// ports added later by the islands worker (WORLD.ports grows) show once discovered
	WORLD.ports.push( { id: 'testport', name: 'Test Port', stand: { x: 900, z: 900 } } );
	F.discovered = ( id ) => id === 'home' || id === 'testport';
	const l3 = [];
	wm._collect( l3 );
	ok( l3.some( ( m ) => m.key === 'port:testport' ) && ! l3.some( ( m ) => m.key === 'pons' ), 'a new port appears once discovered (read dynamically)' );
	WORLD.ports.pop();

	ok( wm._islandName( { id: 'home' } ) === 'Hyptile Island' && wm._islandName( { id: 'gull' } ) === 'Gull Rock', 'island names from the ports' );

}

// ---- the minimap's waypoint and the shared bake
{

	const mm = Object.create( Minimap.prototype );
	mm.setWaypoint( { x: 3, z: 4 } );
	ok( mm.waypoint.x === 3, 'minimap waypoint set' );
	mm.setWaypoint( { x: NaN, z: 1 } );
	ok( mm.waypoint === null, 'minimap waypoint cleared by bad data' );
	ok( typeof ICON.flag === 'string' && ICON.flag.startsWith( '<svg' ), 'shared icons include the flag' );

	// a tiny terrain: a 64 m world, a cone island in the middle
	const res = 16, size = 64;
	const T = {
		res, texel: size / res, origin: - size / 2, size,
		heightAt: ( x, z ) => 6 - Math.hypot( x, z ) * 0.4,
		seagrass: new Uint8Array( res * res ), rubble: new Uint8Array( res * res ), rock: new Uint8Array( res * res ),
		sand: new Uint8Array( res * res ), path: new Uint8Array( res * res ), scarp: new Uint8Array( res * res ), pads: [ { x: 0, z: 0, radius: 2 } ],
	};
	let put = 0, rects = 0;
	const ctx = {
		createImageData: ( w, hh ) => ( { width: w, height: hh, data: new Uint8ClampedArray( w * hh * 4 ) } ),
		putImageData: () => put ++, fillRect: () => rects ++, strokeRect: () => {}, beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => {},
	};
	const n = 32;
	const B = new TerrainBake( ctx, { n, x0: - 32, z0: - 32, ppm: n / 64, jetties: true, keepHeights: true } );
	ok( B.step( T, 10 ) === false && ! B.done && put === 0, 'the bake runs in row chunks' );
	ok( B.heightAt( 0, 0 ) === null, 'no heights before it is done' );
	while ( ! B.step( T, 10 ) );
	ok( B.done && put === 1 && rects > 0, 'done: the image is put once, pads and pier drawn' );
	ok( B.heightAt( 0, 0 ) > 4 && B.heightAt( 30, 30 ) < 0 && B.heightAt( 100, 0 ) === null, 'kept heights answer lookups' );
	const B2 = new TerrainBake( ctx, { n, x0: - 32, z0: - 32, ppm: n / 64 } );
	while ( ! B2.step( T, 100 ) );
	ok( B2.h === null && B2.heightAt( 0, 0 ) === null, 'the minimap bake drops its heights' );

}

console.log( fails ? `\n${ fails } FAILED` : '\nall world map tests passed' );
process.exit( fails ? 1 : 0 );
