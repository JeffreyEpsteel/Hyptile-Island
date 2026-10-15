// Meridian's skyline (wave 23A): downtown's eight fictional skyscrapers, each its own shape, as pure maths (no engine
// imports: the plan, the builder, the colliders, the damage model and the node tests all read it).
//
//   SKYLINE                     the towers' specs: id, name, shape, where (the plaza's (u, v), or a whole downtown block)
//   TOWER_ALIASES               ids of release 3ba863b's Meridian Twins -> the towers that stand where they stood (old saves,
//                               old streams and the codex tests name them)
//   resolveTower( id )          the id with an alias resolved
//   skylineSpec( id )           a tower's spec (null for a building that is not one of them)
//   localForm( spec, far )      the tower in local metres (x east, z south, y up from its ground; the footprint's bounds
//                               centred on 0): { parts, extras, roofs, solids, obstacles, pads, top, w, d }
//   towerForm( b, { far } )     the same in world metres for a plan building (cached per building and LOD)
//   sectionsAt( b, y )          the outlines of every part at world height y: [ [ [ x, z ] ... ] ]  (fire bands, collapse
//                               chunks, decals); a building without a skyline spec answers its footprint box
//   floorHeight( b )            metres per storey; cutRange( b ) -> [ lo, hi ] m above the ground where a top may break off
//   insideAny( outlines, x, z ) point in one of the (convex) outlines
//
// Parts are lofts: rings of equal point count stacked up (a ring: { y, pts }), walls between them; pts run round the outline
// south edge first, west to east (Acc.prism's order: walls face out); `cap` the roof over the last ring, `bottom` a soffit
// under the first, `smooth` radial normals (cylinders). The wedge is its own part kind (a sloping top).

const TAU = Math.PI * 2;
export const SINK = 2; // walls go this far under the ground (as Facades.js)

// u, v: island-relative metres (CityPlan's frame); block: a downtown block the tower takes whole (its centre)
export const SKYLINE = [
	{ id: 'meridian-spire', name: 'Meridian Spire', shape: 'deco', block: 'skyline', u: 118, v: - 22, h: 268, spire: 54, style: 'deco', fh: 3.9 },
	{ id: 'tidegate', name: 'Tidegate Tower', shape: 'split', block: 'skyline', u: 222, v: 58, h: 252, west: 232, style: 'gate', fh: 3.8, helipad: true },
	{ id: 'halo-tower', name: 'Halo Tower', shape: 'ring', block: 'skyline', u: 245, v: - 32, h: 214, deck: [ 172, 184 ], mast: 24, style: 'ring', fh: 3.7 },
	{ id: 'prism-tower', name: 'Prism Tower', shape: 'tri', block: 'b4_2', h: 192, side: 64, style: 'prism', fh: 3.8, helipad: true },
	{ id: 'ziggurat', name: 'The Ziggurat', shape: 'zigg', block: 'b5_2', h: 182, crown: 24, style: 'zigg', fh: 3.6 },
	{ id: 'helix-tower', name: 'Helix Tower', shape: 'twist', block: 'b4_5', h: 226, side: 38, chamfer: 5, twist: Math.PI / 2, style: 'helix', fh: 3.8, helipad: true },
	{ id: 'hanging-gardens', name: 'Hanging Gardens', shape: 'cantilever', block: 'b5_5', h: 166, core: 30, style: 'garden', fh: 3.6, helipad: true },
	{ id: 'ledger-building', name: 'Ledger Building', shape: 'wedge', block: 'b5_1', h: 148, low: 116, style: 'bronze', fh: 3.7 },
];

export const TOWER_ALIASES = { 'twin-north': 'meridian-spire', 'twin-south': 'tidegate' };
const BY_ID = new Map( SKYLINE.map( ( s ) => [ s.id, s ] ) );

export function resolveTower( id ) {

	return TOWER_ALIASES[ id ] || id;

}

export function skylineSpec( id ) {

	return BY_ID.get( resolveTower( id ) ) || null;

}

// ------------------------------------------------------------------ outlines (local, the walls' order)

export function rect( hx, hz, c = 0, ox = 0, oz = 0 ) {

	if ( c <= 0 ) return [ [ ox - hx, oz + hz ], [ ox + hx, oz + hz ], [ ox + hx, oz - hz ], [ ox - hx, oz - hz ] ];
	return [ [ ox - hx + c, oz + hz ], [ ox + hx - c, oz + hz ], [ ox + hx, oz + hz - c ], [ ox + hx, oz - hz + c ], [ ox + hx - c, oz - hz ], [ ox - hx + c, oz - hz ], [ ox - hx, oz - hz + c ], [ ox - hx, oz + hz - c ] ];

}

// a circle from the south point round by east (z = - r sin: the walls' order)
export function circle( r, n, ox = 0, oz = 0 ) {

	const out = [];
	for ( let k = 0; k < n; k ++ ) {

		const a = - Math.PI / 2 + k / n * TAU;
		out.push( [ ox + r * Math.cos( a ), oz - r * Math.sin( a ) ] );

	}

	return out;

}

// turned by a (the Colliders' rotY convention: a box with rotY = a has these axes)
export function rotate( pts, a ) {

	const c = Math.cos( a ), s = Math.sin( a );
	return pts.map( ( [ x, z ] ) => [ x * c + z * s, - x * s + z * c ] );

}

// a polygon with its corners cut back by c (each corner becomes two points)
function chamferPoly( pts, c ) {

	const out = [], n = pts.length;
	for ( let k = 0; k < n; k ++ ) {

		const p = pts[ k ], a = pts[ ( k + n - 1 ) % n ], b = pts[ ( k + 1 ) % n ];
		const la = Math.hypot( a[ 0 ] - p[ 0 ], a[ 1 ] - p[ 1 ] ), lb = Math.hypot( b[ 0 ] - p[ 0 ], b[ 1 ] - p[ 1 ] );
		out.push( [ p[ 0 ] + ( a[ 0 ] - p[ 0 ] ) * c / la, p[ 1 ] + ( a[ 1 ] - p[ 1 ] ) * c / la ], [ p[ 0 ] + ( b[ 0 ] - p[ 0 ] ) * c / lb, p[ 1 ] + ( b[ 1 ] - p[ 1 ] ) * c / lb ] );

	}

	return out;

}

export function insideConvex( pts, x, z ) {

	// the walls' order runs clockwise seen with x right and z down the page: inside is on the right of every edge
	const n = pts.length;
	let sign = 0;
	for ( let k = 0; k < n; k ++ ) {

		const [ ax, az ] = pts[ k ], [ bx, bz ] = pts[ ( k + 1 ) % n ];
		const c = ( bx - ax ) * ( z - az ) - ( bz - az ) * ( x - ax );
		if ( Math.abs( c ) < 1e-9 ) continue;
		const s = c > 0 ? 1 : - 1;
		if ( sign && s !== sign ) return false;
		sign = s;

	}

	return true;

}

export function insideAny( outlines, x, z ) {

	return outlines.some( ( o ) => insideConvex( o, x, z ) );

}

const bbox = ( pts ) => {

	let x0 = Infinity, x1 = - Infinity, z0 = Infinity, z1 = - Infinity;
	for ( const [ x, z ] of pts ) { x0 = Math.min( x0, x ); x1 = Math.max( x1, x ); z0 = Math.min( z0, z ); z1 = Math.max( z1, z ); }
	return { x0, x1, z0, z1 };

};

// ------------------------------------------------------------------ the shapes (local metres, y from the ground)

const loft = ( rings, style, o = {} ) => ( { kind: 'loft', rings, style, cap: o.cap ?? 'roof', bottom: !! o.bottom, smooth: !! o.smooth, lit: o.lit ?? 1 } );
const prismPart = ( pts, y0, y1, style, o ) => loft( [ { y: y0, pts }, { y: y1, pts } ], style, o );
const solidBox = ( x, z, hx, hz, y0, y1, yaw = 0 ) => ( { x, z, hx, hz, y0, y1, yaw } );

// LED colours (linear-ish 0..1; the material's 'led' code glows them at night)
export const LED = { gold: [ 1.0, 0.72, 0.32 ], cyan: [ 0.25, 0.85, 1.0 ], amber: [ 1.0, 0.55, 0.18 ], teal: [ 0.3, 1.0, 0.78 ], violet: [ 0.72, 0.6, 1.0 ], halo: [ 0.7, 0.92, 1.0 ], warm: [ 1.0, 0.8, 0.5 ] };

function deco( s, far ) {

	const h = s.h, parts = [], extras = [], solids = [], obstacles = [];
	const tiers = [ [ 0, 0.40, 25, 4.5 ], [ 0.40, 0.60, 21, 3.8 ], [ 0.60, 0.76, 17, 3.0 ], [ 0.76, 0.88, 13, 2.4 ], [ 0.88, 1.0, 9.5, 1.8 ] ];
	tiers.forEach( ( [ f0, f1, hw, c ], k ) => {

		const y0 = k ? f0 * h : - SINK, y1 = f1 * h;
		parts.push( prismPart( rect( hw, hw, c ), y0, y1, s.style ) );
		solids.push( solidBox( 0, 0, hw * 0.98, hw * 0.98, y0, y1 ) );
		// gold fins up the chamfered corners of the upper tiers, a gold band at each setback (the night outline)
		if ( k >= 2 ) for ( const [ sx, sz ] of [ [ 1, 1 ], [ 1, - 1 ], [ - 1, - 1 ], [ - 1, 1 ] ] ) {

			const m = hw - c / 2;
			extras.push( { type: 'strip', x: sx * m, z: sz * m, nx: sx * Math.SQRT1_2, nz: sz * Math.SQRT1_2, w: 0.9, y0: y0 + 1, y1: y1 - 0.5, col: LED.gold } );

		}

		if ( k >= 1 ) extras.push( { type: 'band', pts: rect( hw, hw, c ), y: y1 - 1.4, hgt: 0.7, col: LED.gold } );

	} );
	// the crown: three small stepped tiers, then the spire with its warning light
	const crown = [ [ 0, 5, 7, 1.4 ], [ 5, 9, 5, 1 ], [ 9, 12, 3.5, 0.7 ] ];
	for ( const [ a, b, hw, c ] of crown ) {

		parts.push( prismPart( rect( hw, hw, c ), h + a, h + b, s.style, { cap: 'metal', lit: 2 } ) );
		solids.push( solidBox( 0, 0, hw, hw, h + a, h + b ) );

	}

	const top = h + s.spire;
	extras.push( { type: 'cyl', x: 0, z: 0, r0: 2.4, r1: 0.22, y0: h + 12, y1: top, seg: far ? 6 : 10, col: [ 0.78, 0.66, 0.42 ], code: 'metal' } );
	for ( const y of [ h + 20, h + 30 ] ) extras.push( { type: 'cyl', x: 0, z: 0, r0: 2.0, r1: 2.0, y0: y, y1: y + 0.6, seg: 10, col: LED.gold, code: 'led', detail: true } );
	extras.push( { type: 'beacon', x: 0, z: 0, y: top } );
	obstacles.push( solidBox( 0, 0, 2.4, 2.4, h + 12, top ) );
	return { parts, extras, solids, obstacles, roofs: [], pads: [], top, w: 50, d: 50 };

}

function split( s ) {

	const h = s.h, ys = Math.round( h * 0.5 / s.fh ) * s.fh, yb = Math.round( h * 0.8 / s.fh ) * s.fh;
	const parts = [], extras = [], solids = [], obstacles = [], roofs = [], pads = [];
	parts.push( prismPart( rect( 28, 18, 3 ), - SINK, ys, s.style ) );
	solids.push( solidBox( 0, 0, 28, 18, - SINK, ys ) );
	const prongs = [ [ - 17, s.west ], [ 17, h ] ];
	for ( const [ ox, top ] of prongs ) {

		parts.push( prismPart( rect( 11, 16, 2, ox, 0 ), ys, top, s.style ) );
		solids.push( solidBox( ox, 0, 11, 16, ys, top ) );
		roofs.push( { x0: ox - 11, x1: ox + 11, z0: - 14, z1: 14, y: top, pad: ox > 0 } );
		roofs.push( { x0: ox - 9, x1: ox + 9, z0: - 16, z1: 16, y: top, pad: ox > 0 } );
		extras.push( { type: 'parapet', pts: rect( 11, 16, 2, ox, 0 ), y: top, hgt: 1.1 } );
		extras.push( { type: 'beacon', x: ox + ( ox > 0 ? 9 : - 9 ), z: - 14, y: top + 1.1 } );
		// the light slot: a violet strip up each inner face of the gap
		extras.push( { type: 'strip', x: ox > 0 ? 6 : - 6, z: 0, nx: ox > 0 ? - 1 : 1, nz: 0, w: 1.2, y0: ys + 1, y1: top - 1, col: LED.violet } );

	}

	// the sky bridge between the prongs (three floors, glazed underneath), its soffit seen from the street
	parts.push( prismPart( rect( 7.5, 7, 0 ), yb, yb + 12, s.style, { bottom: true, lit: 2 } ) );
	solids.push( solidBox( 0, 0, 7.5, 7, yb, yb + 12 ) );
	extras.push( { type: 'band', pts: rect( 7.5, 7, 0 ), y: yb - 0.2, hgt: 0.6, col: LED.violet } );
	// the gap's floor between the prongs, and a plant room on the west prong
	roofs.push( { x0: - 6, x1: 6, z0: - 16, z1: 16, y: ys, pad: false } );
	extras.push( { type: 'box', x0: - 22, x1: - 12, z0: - 4, z1: 4, y0: s.west, y1: s.west + 4, col: [ 0.6, 0.6, 0.6 ], code: 'plain' } );
	obstacles.push( solidBox( - 17, 0, 5, 4, s.west, s.west + 4 ) );
	pads.push( { x: 17, z: 0, y: h, r: 8 } );
	return { parts, extras, solids, obstacles, roofs, pads, top: h + 1.6, w: 56, d: 36 };

}

function ring( s, far ) {

	const n = far ? 12 : 32, h = s.h, [ d0, d1 ] = s.deck, r = 15, R = 25;
	const parts = [ loft( [ { y: - SINK, pts: circle( r, n ) }, { y: d0, pts: circle( r, n ) } ], s.style, { cap: null, smooth: true } ),
		loft( [ { y: d0, pts: circle( R, n ) }, { y: d1, pts: circle( R, n ) } ], s.style, { bottom: true, smooth: true, lit: 2 } ),
		loft( [ { y: d1, pts: circle( r, n ) }, { y: h, pts: circle( r, n ) } ], s.style, { cap: 'metal', smooth: true } ) ];
	const top = h + s.mast;
	const extras = [
		// the halo: two rings of light round the deck's rims
		{ type: 'band', pts: circle( R, n ), y: d0 + 0.2, hgt: 0.55, col: LED.halo },
		{ type: 'band', pts: circle( R, n ), y: d1 - 0.75, hgt: 0.55, col: LED.halo },
		{ type: 'band', pts: circle( r, n ), y: h - 2, hgt: 0.5, col: LED.halo },
		{ type: 'cyl', x: 0, z: 0, r0: 1.5, r1: 0.35, y0: h, y1: top, seg: 8, col: [ 0.85, 0.86, 0.88 ], code: 'metal' },
		{ type: 'beacon', x: 0, z: 0, y: top },
	];
	const solids = [ solidBox( 0, 0, r * 0.9, r * 0.9, - SINK, h ), solidBox( 0, 0, R * 0.86, R * 0.86, d0, d1 ) ];
	return { parts, extras, solids, obstacles: [ solidBox( 0, 0, 1.5, 1.5, h, top ) ], roofs: [], pads: [], top, w: 2 * R, d: 2 * R };

}

function tri( s ) {

	const h = s.side * Math.sqrt( 3 ) / 2; // (the plan's depth)
	const base = chamferPoly( [ [ - s.side / 2, h / 2 ], [ s.side / 2, h / 2 ], [ 0, - h / 2 ] ], 3 );
	const cz = h / 2 - h / 3; // the centroid (an inradius of side / 2 sqrt 3 round it)
	const parts = [ prismPart( base, - SINK, s.h, s.style ) ];
	const extras = [
		{ type: 'parapet', pts: base, y: s.h, hgt: 1.2 },
		{ type: 'band', pts: base, y: s.h - 1.6, hgt: 0.7, col: LED.cyan },
		{ type: 'beacon', x: 0, z: - h / 2 + 4, y: s.h + 1.2 },
	];
	// the lit edges: a cyan line up each of the three cut corners
	for ( let k = 0; k < 3; k ++ ) {

		const a = base[ k * 2 ], b = base[ k * 2 + 1 ];
		const mx = ( a[ 0 ] + b[ 0 ] ) / 2, mz = ( a[ 1 ] + b[ 1 ] ) / 2, L = Math.hypot( b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ] );
		extras.push( { type: 'strip', x: mx, z: mz, nx: - ( b[ 1 ] - a[ 1 ] ) / L, nz: ( b[ 0 ] - a[ 0 ] ) / L, w: 1.3, y0: 3, y1: s.h - 0.5, col: LED.cyan } );

	}

	// (three boxes inside the triangle: wide at the south face, narrow toward the north apex)
	const half = ( z ) => s.side / 2 * ( z + h / 2 ) / h;
	const solids = [ [ 14, h / 2 ], [ - 2, 14 ], [ - 18, - 2 ] ].map( ( [ z0, z1 ] ) => solidBox( 0, ( z0 + z1 ) / 2, half( z0 ) * 0.98, ( z1 - z0 ) / 2, - SINK, s.h ) );
	return { parts, extras, solids, obstacles: [], roofs: [ { x0: - 11, x1: 11, z0: cz - 11, z1: cz + 11, y: s.h, pad: true } ], pads: [ { x: 0, z: cz, y: s.h, r: 8 } ], top: s.h + 1.2, w: s.side, d: h };

}

function zigg( s ) {

	const steps = [ [ 36, 32, 44 ], [ 32, 28.5, 78 ], [ 28, 25, 106 ], [ 24, 21.5, 130 ], [ 20, 18, 150 ], [ 16, 14.5, 167 ], [ 12, 11, s.h ] ];
	const parts = [], extras = [], solids = [];
	let y0 = - SINK;
	for ( const [ hx, hz, y1 ] of steps ) {

		parts.push( prismPart( rect( hx, hz, 1.5 ), y0, y1, s.style ) );
		solids.push( solidBox( 0, 0, hx, hz, y0, y1 ) );
		// each step's edge lit amber at night: the stepped outline seen from home
		extras.push( { type: 'band', pts: rect( hx, hz, 1.5 ), y: y1 - 0.9, hgt: 0.6, col: LED.amber } );
		extras.push( { type: 'parapet', pts: rect( hx, hz, 1.5 ), y: y1, hgt: 0.9, detail: true } );
		y0 = y1;

	}

	// the crown: a lantern of glass, a gilded pyramid, the warning light
	const top = s.h + s.crown;
	parts.push( prismPart( rect( 7, 6, 1 ), s.h, s.h + 12, s.style, { cap: null, lit: 3 } ) );
	solids.push( solidBox( 0, 0, 7, 6, s.h, s.h + 12 ) );
	extras.push( { type: 'pyramid', x: 0, z: 0, hx: 7.6, hz: 6.6, y0: s.h + 12, y1: top, col: [ 0.82, 0.62, 0.3 ], code: 'metal' } );
	extras.push( { type: 'beacon', x: 0, z: 0, y: top } );
	return { parts, extras, solids, obstacles: [], roofs: [], pads: [], top, w: 72, d: 64 };

}

function twist( s, far ) {

	const n = far ? 12 : 48, base = rect( s.side / 2, s.side / 2, s.chamfer );
	const rings = [];
	for ( let i = 0; i <= n; i ++ ) {

		const y = i === 0 ? - SINK : s.h * i / n;
		rings.push( { y, pts: rotate( base, s.twist * Math.max( 0, y ) / s.h ) } );

	}

	const parts = [ loft( rings, s.style ) ];
	const extras = [ { type: 'parapet', pts: rotate( base, s.twist ), y: s.h, hgt: 1.2 }, { type: 'beacon', x: 0, z: 0, y: s.h + 1.2 } ];
	// two teal lines spiral up the cut corners (the twist read at night)
	for ( const k of [ 1, 5 ] ) extras.push( { type: 'spiral', rings, edge: k, w: 1.2, col: LED.teal } );
	const solids = [];
	for ( let i = 0; i < n; i += far ? 2 : 6 ) {

		const j = Math.min( n, i + ( far ? 2 : 6 ) ), y0 = rings[ i ].y, y1 = rings[ j ].y;
		solids.push( solidBox( 0, 0, s.side / 2 * 0.97, s.side / 2 * 0.97, y0, y1, s.twist * Math.max( 0, ( y0 + y1 ) / 2 ) / s.h ) );

	}

	// the extent over the whole twist (a quarter turn passes the diagonal)
	let e = 0;
	for ( let a = 0; a <= 1.0001; a += 1 / 64 ) for ( const [ x, z ] of rotate( base, s.twist * a ) ) e = Math.max( e, Math.abs( x ), Math.abs( z ) );
	const hr = s.side / 2, c = s.chamfer; // (the roof turned a quarter: square again; two crossing boxes clear of the cut corners)
	const roofs = [ { x0: - hr, x1: hr, z0: - hr + c, z1: hr - c, y: s.h, pad: true }, { x0: - hr + c, x1: hr - c, z0: - hr, z1: hr, y: s.h, pad: true } ];
	const w = Math.ceil( e * 2 * 10 ) / 10;
	return { parts, extras, solids, obstacles: [], roofs, pads: [ { x: 0, z: 0, y: s.h, r: 8 } ], top: s.h + 1.2, w, d: w };

}

// five stacked blocks, each pushed out past the one under it; the terraces planted, greenery hanging from their edges
const CANTILEVER = [ [ 0, 0 ], [ 7, - 5 ], [ - 6, 6 ], [ 7, 6 ], [ - 5, - 6 ] ];
function cantilever( s ) {

	const half = s.core / 2, hb = s.h / CANTILEVER.length;
	let x0 = Infinity, x1 = - Infinity, z0 = Infinity, z1 = - Infinity;
	for ( const [ ox, oz ] of CANTILEVER ) { x0 = Math.min( x0, ox - half ); x1 = Math.max( x1, ox + half ); z0 = Math.min( z0, oz - half ); z1 = Math.max( z1, oz + half ); }
	const cx = ( x0 + x1 ) / 2, cz = ( z0 + z1 ) / 2;
	const blocks = CANTILEVER.map( ( [ ox, oz ], k ) => ( { ox: ox - cx, oz: oz - cz, y0: k ? k * hb : - SINK, y1: ( k + 1 ) * hb } ) );
	const parts = [], extras = [], solids = [];
	blocks.forEach( ( B, k ) => {

		parts.push( prismPart( rect( half, half, 1, B.ox, B.oz ), B.y0, B.y1, s.style, { bottom: k > 0 } ) );
		solids.push( solidBox( B.ox, B.oz, half, half, B.y0, B.y1 ) );
		const next = blocks[ k + 1 ];
		// the terrace: planters and small trees on the roof the next block leaves open, vines down the edge below them
		if ( next ) {

			const open = ( x, z ) => Math.abs( x - next.ox ) > half + 0.5 || Math.abs( z - next.oz ) > half + 0.5;
			const edge = rect( half - 1.2, half - 1.2, 0, B.ox, B.oz );
			for ( let e = 0; e < 4; e ++ ) {

				const [ ax, az ] = edge[ e ], [ bx, bz ] = edge[ ( e + 1 ) % 4 ];
				const L = Math.hypot( bx - ax, bz - az ), nx = - ( bz - az ) / L, nz = ( bx - ax ) / L;
				for ( let t = 2; t < L - 2; t += 4 ) {

					const x = ax + ( bx - ax ) * t / L, z = az + ( bz - az ) * t / L;
					if ( ! open( x, z ) ) continue;
					extras.push( { type: 'box', x0: x - 1.6, x1: x + 1.6, z0: z - 1.6, z1: z + 1.6, y0: B.y1, y1: B.y1 + 1.1, col: [ 0.24, 0.42, 0.18 ], code: 'foliage', detail: true } );
					extras.push( { type: 'vine', x: x + nx * 1.2, z: z + nz * 1.2, nx, nz, w: 3.6, y0: B.y1 - 3 - ( ( t * 7 + k * 3 ) % 5 ), y1: B.y1, detail: true } );

				}

			}

			for ( const [ tx, tz ] of [ [ - 0.55, - 0.55 ], [ 0.55, 0.5 ], [ - 0.5, 0.55 ], [ 0.55, - 0.5 ] ] ) {

				const x = B.ox + tx * half, z = B.oz + tz * half;
				if ( open( x, z ) ) extras.push( { type: 'tree', x, z, y: B.y1, r: 2.2 + ( ( k + tx * 3 ) % 1 + 1 ) * 0.4 } );

			}

		}

	} );
	const T = blocks[ blocks.length - 1 ];
	extras.push( { type: 'parapet', pts: rect( half, half, 1, T.ox, T.oz ), y: s.h, hgt: 1.2 } );
	extras.push( { type: 'band', pts: rect( half, half, 1, T.ox, T.oz ), y: s.h - 1.4, hgt: 0.6, col: LED.warm } );
	extras.push( { type: 'beacon', x: T.ox + half - 2, z: T.oz - half + 2, y: s.h + 1.2 } );
	return {
		parts, extras, solids, obstacles: [],
		roofs: [ { x0: T.ox - half + 1, x1: T.ox + half - 1, z0: T.oz - half + 1, z1: T.oz + half - 1, y: s.h, pad: true } ],
		pads: [ { x: T.ox, z: T.oz, y: s.h, r: 7.5 } ], top: s.h + 1.2, w: x1 - x0, d: z1 - z0,
	};

}

function wedge( s ) {

	const hx = 23, hz = 15;
	const parts = [ { kind: 'wedge', hx, hz, y0: - SINK, high: s.h, low: s.low, style: s.style } ];
	const extras = [
		// the bronze blade above the high (west) edge, its warning light; amber lines down the sloping edges
		{ type: 'box', x0: - hx - 0.6, x1: - hx + 0.6, z0: - hz, z1: hz, y0: s.h - 1, y1: s.h + 10, col: [ 0.42, 0.3, 0.2 ], code: 'metal' },
		{ type: 'beacon', x: - hx, z: 0, y: s.h + 10 },
		{ type: 'slope', x0: - hx, x1: hx, z: hz, side: 1, y0: s.h, y1: s.low, col: LED.amber },
		{ type: 'slope', x0: - hx, x1: hx, z: - hz, side: - 1, y0: s.h, y1: s.low, col: LED.amber },
	];
	const solids = [ solidBox( - hx / 2, 0, hx / 2, hz, - SINK, ( s.h * 3 + s.low ) / 4 ), solidBox( hx / 2, 0, hx / 2, hz, - SINK, ( s.h + s.low * 3 ) / 4 ) ];
	return { parts, extras, solids, obstacles: [ solidBox( - hx, 0, 0.6, hz, s.h - 1, s.h + 10 ) ], roofs: [], pads: [], top: s.h + 10, w: hx * 2, d: hz * 2, cutMax: s.low - 2 };

}

const SHAPES = { deco, split, ring, tri, zigg, twist, cantilever, wedge };
const localCache = new Map();

export function localForm( spec, far = false ) {

	const key = spec.id + ( far ? ':far' : ':near' );
	if ( localCache.has( key ) ) return localCache.get( key );
	const f = SHAPES[ spec.shape ]( spec, far );
	f.fh = spec.fh;
	localCache.set( key, f );
	return f;

}

// the plan's numbers for a spec: the axis-aligned footprint (every part's bounds), the roof, the floors
export function towerExtent( spec ) {

	const f = localForm( spec );
	return { w: Math.ceil( f.w * 10 - 1e-6 ) / 10, d: Math.ceil( f.d * 10 - 1e-6 ) / 10, h: spec.h, top: Math.round( f.top * 10 ) / 10, floors: Math.round( spec.h / spec.fh ) };

}

// ------------------------------------------------------------------ in the world

const formCache = new WeakMap();

// a building that is no skyline spec (the stub city's towers): one box part
function boxForm( b ) {

	const hx = ( b.w || 10 ) / 2, hz = ( b.d || 10 ) / 2;
	return { parts: [ prismPart( rect( hx, hz, 0 ), - SINK, b.h || 10, b.style || 'concrete' ) ], extras: [], solids: [ solidBox( 0, 0, hx, hz, - SINK, b.h || 10 ) ], obstacles: [], roofs: [], pads: [], top: b.h || 10, w: hx * 2, d: hz * 2, fh: 3.8 };

}

function toWorld( f, b ) {

	const X = b.x, Z = b.z, Y = b.y || 0;
	const P = ( pts ) => pts.map( ( [ x, z ] ) => [ X + x, Z + z ] );
	const parts = f.parts.map( ( p ) => p.kind === 'wedge' ? { ...p, x: X, z: Z, base: Y, y0: Y + p.y0, high: Y + p.high, low: Y + p.low }
		: { ...p, rings: p.rings.map( ( r ) => ( { y: Y + r.y, pts: P( r.pts ) } ) ) } );
	const extras = f.extras.map( ( e ) => {

		const o = { ...e };
		for ( const k of [ 'x', 'x0', 'x1' ] ) if ( k in o ) o[ k ] += X;
		for ( const k of [ 'z', 'z0', 'z1' ] ) if ( k in o ) o[ k ] += Z;
		for ( const k of [ 'y', 'y0', 'y1' ] ) if ( k in o ) o[ k ] += Y;
		if ( o.pts ) o.pts = P( o.pts );
		if ( o.rings ) o.rings = o.rings.map( ( r ) => ( { y: Y + r.y, pts: P( r.pts ) } ) );
		return o;

	} );
	const box = ( s ) => ( { ...s, x: X + s.x, z: Z + s.z, y0: Y + s.y0, y1: Y + s.y1 } );
	return {
		parts, extras, solids: f.solids.map( box ), obstacles: f.obstacles.map( box ),
		roofs: f.roofs.map( ( r ) => ( { ...r, x0: X + r.x0, x1: X + r.x1, z0: Z + r.z0, z1: Z + r.z1, y: Y + r.y } ) ),
		pads: f.pads.map( ( p ) => ( { ...p, x: X + p.x, z: Z + p.z, y: Y + p.y } ) ),
		top: Y + f.top, fh: f.fh, cutMax: f.cutMax,
	};

}

export function towerForm( b, { far = false } = {} ) {

	let c = formCache.get( b );
	if ( ! c ) formCache.set( b, c = {} );
	const k = far ? 'far' : 'near';
	if ( ! c[ k ] ) {

		const spec = skylineSpec( b.id );
		c[ k ] = toWorld( spec ? localForm( spec, far ) : boxForm( b ), spec ? b : { ...b, y: b.y || 0 } );

	}

	return c[ k ];

}

export function floorHeight( b ) {

	const spec = skylineSpec( b.id );
	return spec ? spec.fh : 3.8;

}

// [ lo, hi ] metres above the ground where an upper section may break off (never through the crown or the wedge's slope)
export function cutRange( b ) {

	const f = towerForm( b ), h = b.h || 10;
	const hi = Math.min( h * 0.86, Number.isFinite( f.cutMax ) ? f.cutMax - ( b.y || 0 ) : Infinity );
	return [ h * 0.42, hi ];

}

// the ring of a loft part at height y (interpolated), or null outside it
function ringAt( p, y ) {

	const R = p.rings;
	if ( y < R[ 0 ].y || y > R[ R.length - 1 ].y ) return null;
	for ( let i = 1; i < R.length; i ++ ) {

		if ( y > R[ i ].y && i < R.length - 1 ) continue;
		const a = R[ i - 1 ], b = R[ i ], t = b.y > a.y ? Math.min( 1, Math.max( 0, ( y - a.y ) / ( b.y - a.y ) ) ) : 0;
		return a.pts.map( ( q, k ) => [ q[ 0 ] + ( b.pts[ k ][ 0 ] - q[ 0 ] ) * t, q[ 1 ] + ( b.pts[ k ][ 1 ] - q[ 1 ] ) * t ] );

	}

	return null;

}

// the wedge's section: the box, cut back from the east where the slope comes down below y
function wedgeAt( p, y ) {

	if ( y < p.y0 || y > p.high ) return null;
	let x1 = p.x + p.hx;
	if ( y > p.low ) x1 = p.x - p.hx + 2 * p.hx * ( p.high - y ) / ( p.high - p.low );
	return [ [ p.x - p.hx, p.z + p.hz ], [ x1, p.z + p.hz ], [ x1, p.z - p.hz ], [ p.x - p.hx, p.z - p.hz ] ];

}

export function sectionsAt( b, y ) {

	const f = towerForm( b );
	const out = [];
	for ( const p of f.parts ) {

		const o = p.kind === 'wedge' ? wedgeAt( p, y ) : ringAt( p, y );
		if ( o ) out.push( o );

	}

	return out;

}

export { bbox as outlineBounds };
