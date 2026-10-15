// The ships' materials (wave 24C): what the sails, flags and hull of a ship GLB built by tools/ships/build_ships.py need on top
// of StaticGLB's lit PBR materials. Shared by naval's ModelSet (the AI ships, Models.js) and the player's ship
// (world/boat/ShipBoatModel.js). No imports: a world module can take it without the feature's.
//
//   shipMaterials( glb, { mirrored } ) -> number of materials changed (once per loaded template)
//     sails (…SailCanvas): the belly moves to the side the wind blows to (square sails filled from astern, aback from ahead;
//       fore-and-aft sails to leeward), breathes, and shivers along the leech when the sail cannot fill; double sided
//     flags (…FlagCanvas, …NavyBlueCanvas): a travelling wave from the hoist, faster in a fresh wind; double sided
//     canvas: glows warm when the sun is behind it (not shadowed: the backlight is the point)
//     hull paint (…HullPlank, SheerStripe, BlackPaint, NavyHullBlue / White, HullTar): darker and glossier at the waterline
//   mirrored: the GLB was mirrored across its centre plane (the player's brigantine): the static belly of the fore-and-aft
//   sails and the bracing of the square yards are on the other side.

const SAIL = /SailCanvas$/;
const FLAG = /(FlagCanvas|NavyBlueCanvas)$/;
const HULL = /(HullPlank|SheerStripe|BlackPaint|NavyHullBlue|NavyHullWhite|HullTar)$/;

// sails: u = s + 2 code, v (glTF) = ( 1 - t ) - 2 kind (kind 0 square: belly forward, the yards braced SAIL_BRACE about the
// mast (tools/ships/build_ships.py BRACE); 1 fore-and-aft: belly +Z, -Z mirrored); the static belly is code * 5 cm * W( s, t ).
// The wind in the model frame decides the side it fills to.
export const SAIL_BRACE = 0.42;
const SAIL_VERTEX = /* wgsl */`
	let sCode = floor( v.uv.x * 0.5 );
	let sDepth = sCode * 0.05;
	if ( sDepth > 0.0 ) {
		let su = v.uv.x - 2.0 * sCode;
		let sKind = floor( ( 1.0 - v.uv.y ) * 0.5 );
		let st = clamp( v.uv.y + 2.0 * sKind, 0.0, 1.0 );
		let m3 = mat3x3f( normalize( v.model[ 0 ].xyz ), normalize( v.model[ 1 ].xyz ), normalize( v.model[ 2 ].xyz ) );
		let wL = transpose( m3 ) * vec3f( frame.windDir.x, 0.0, frame.windDir.y );
		let ws = clamp( frame.windSpeed / 8.0, 0.15, 1.6 );
		let ph = frame.time * ( 1.1 + 0.3 * ws ) + v.model[ 3 ].x * 0.37 + v.model[ 3 ].z * 0.29;
		var W = 0.0;
		var axis = vec3f( 1.0, 0.0, 0.0 );
		var fill = 1.0;
		if ( sKind < 0.5 ) {
			W = sin( 3.14159265 * su ) * sin( 2.35619449 * st );
			axis = vec3f( SAIL_BRACE_COS, 0.0, - SAIL_SIDE * SAIL_BRACE_SIN );
			fill = smoothstep( - 0.8, 0.15, dot( wL, axis ) ) * 2.0 - 1.0;
		} else {
			W = sin( 3.14159265 * su ) * sin( 3.14159265 * st );
			axis = vec3f( 0.0, 0.0, SAIL_SIDE );
			fill = clamp( wL.z * SAIL_SIDE * 3.0, - 1.0, 1.0 );
			// (running before the wind the boom is out to one side: full, not shivering)
			fill = select( - 1.0, 1.0, fill >= 0.0 ) * max( abs( fill ), 0.85 * smoothstep( 0.3, 0.9, wL.x ) );
		}
		let luff = 1.0 - abs( fill );
		// a breathing belly; the canvas shivers along the leech and the foot when it cannot fill
		let k = fill * ( 0.9 + 0.1 * sin( ph * 0.7 ) );
		let shiver = sDepth * W * ( 0.05 + 0.4 * luff ) * ws * sin( ph * ( 4.0 + 5.0 * luff ) + ( su * 7.0 + st * 4.0 ) );
		v.position += axis * ( sDepth * W * ( k - 1.0 ) + shiver );
		let na = dot( v.normal, axis );
		v.normal = normalize( ( v.normal - axis * na ) * k + axis * na );
	}
`;

// flags: u = cell + 0.48 s + 2 code (code: the flag's length in 10 cm), flat in the model's X-Y plane flying aft (-X)
const FLAG_VERTEX = /* wgsl */`
	let fCode = floor( v.uv.x * 0.5 );
	let fLen = fCode * 0.1;
	if ( fLen > 0.0 ) {
		let fu = v.uv.x - 2.0 * fCode;
		let fs = clamp( select( fu - 0.01, fu - 0.51, fu >= 0.5 ) / 0.48, 0.0, 1.0 );
		let ws = clamp( frame.windSpeed / 7.0, 0.25, 1.8 );
		let amp = fLen * ( 0.045 + 0.035 * ws );
		let kk = 6.2831853 / ( fLen * 0.9 );
		let ph = frame.time * ( 3.5 + 2.5 * ws ) + v.model[ 3 ].x * 0.7 + v.model[ 3 ].z * 0.5;
		let arg = kk * fs * fLen - ph;
		v.position.z += amp * fs * sin( arg );
		let dzds = amp * ( sin( arg ) + fs * kk * fLen * cos( arg ) );
		let n = normalize( vec3f( dzds / fLen, 0.0, 1.0 ) );
		v.normal = select( - n, n, v.normal.z >= 0.0 );
	}
`;

// canvas lit from behind glows through (not shadowed: the sun behind a sail is what makes it glow)
const CANVAS_SURFACE = /* wgsl */`
	let back = clamp( - dot( s.normal, frame.sunDir ), 0.0, 1.0 );
	s.emissive += s.albedo * frame.sunColor * ( 0.32 * back * ( 1.0 - frame.night ) * 0.3183 );
	s.roughness = max( s.roughness, 0.85 );
`;

// the wet band at the waterline: darker and glossier just above the sea (world height), the bottom glossier still
const HULL_SURFACE = /* wgsl */`
	let wet = 1.0 - smoothstep( 0.0, 0.7, in.P.y - frame.seaLevel );
	s.albedo *= 1.0 - 0.32 * wet;
	s.roughness = mix( s.roughness, 0.28, wet );
`;

// Teach a loaded ship GLB's materials the sail / flag / hull shading (once per template). mirrored: the GLB was mirrored
// across its centre plane (the player's brigantine), which puts the fore-and-aft sails' static belly on the other side.
export function shipMaterials( glb, { mirrored = false } = {} ) {

	if ( ! glb || ! glb.materials || glb.__shipMaterials ) return 0;
	glb.__shipMaterials = true;
	let n = 0;
	for ( const m of glb.materials ) {

		const name = m.name || '';
		if ( SAIL.test( name ) ) {

			m.side = 'double';
			m.vertex = ( m.vertex || '' ) + SAIL_VERTEX.replace( /SAIL_SIDE/g, mirrored ? '( - 1.0 )' : '1.0' )
				.replace( /SAIL_BRACE_COS/g, Math.cos( SAIL_BRACE ).toFixed( 6 ) ).replace( /SAIL_BRACE_SIN/g, Math.sin( SAIL_BRACE ).toFixed( 6 ) );
			m.surface = ( m.surface || '' ) + CANVAS_SURFACE;

		} else if ( FLAG.test( name ) ) {

			m.side = 'double';
			m.vertex = ( m.vertex || '' ) + FLAG_VERTEX;
			m.surface = ( m.surface || '' ) + CANVAS_SURFACE;

		} else if ( HULL.test( name ) ) {

			m.surface = ( m.surface || '' ) + HULL_SURFACE;

		} else continue;

		m.needsUpdate = true;
		n ++;

	}

	return n;

}
