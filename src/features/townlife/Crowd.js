import { InstancedMesh, InstancedBufferAttribute, Matrix4, Quaternion, Vector3 } from '../../engine/index.js';
import { prepare, mergePrepared, box, cylinder, sphere, lathe, rod, mat4 } from '../../world/boat/GeoKit.js';
import { createPropMaterial, PAT } from '../../game/GameMaterials.js';

// Wave 24E: the far townsfolk as one instanced draw of animated figures (was a peg of four boxes). A roster-shaped body
// (the big head, the pale belly, the black tank top and shorts the roster wears, slim limbs, feet) skinned in the vertex
// shader: two-bone legs and arms swung by a walk / run cycle from a per-instance phase and stride, a seated pose, arms up
// (cheering, dancing, waving), arms forward round a crate, an umbrella held up in the rain. Each instance carries its
// character's skin and belly colours and its extras (ears, a beak, a cap, a quiff, the umbrella's canopy colour), so a
// figure 60 m off reads as the same Pepe or Doge it becomes when its avatar takes over.
//
//   const C = new CrowdBatch( scene, cap );
//   C.begin(); C.push( x, y, z, yaw, scale, look, { phase, stride, pose, flags, hat } ); C.end();
//   look = CROWD_LOOKS[ character ]; pose = POSE.*; flags = FLAG.* bits

export const POSE = { stand: 0, walk: 1, sit: 2, cheer: 3, wave: 4, dance: 5, talk: 6 };
export const FLAG = { umbrella: 1, ears: 2, beak: 4, cap: 8, quiff: 16, crate: 32, bucket: 64 };

// sRGB-ish character colours (linearised for the shader): skin, belly, the extras they wear; bottoms 0 black, 1 orange plaid
export const CROWD_LOOKS = {
	hyptile: { skin: [ 0.16, 0.36, 0.31 ], belly: [ 0.13, 0.3, 0.26 ], flags: 0, hat: [ 0.2, 0.2, 0.2 ], bottom: 0 },
	pepe: { skin: [ 0.27, 0.45, 0.22 ], belly: [ 0.52, 0.66, 0.36 ], flags: 0, hat: [ 0.2, 0.2, 0.2 ], bottom: 0 },
	doge: { skin: [ 0.62, 0.51, 0.2 ], belly: [ 0.86, 0.83, 0.72 ], flags: FLAG.ears, hat: [ 0.2, 0.2, 0.2 ], bottom: 0 },
	bonk: { skin: [ 0.74, 0.3, 0.1 ], belly: [ 0.9, 0.84, 0.74 ], flags: FLAG.ears, hat: [ 0.2, 0.2, 0.2 ], bottom: 0 },
	pengu: { skin: [ 0.07, 0.09, 0.14 ], belly: [ 0.92, 0.92, 0.9 ], flags: FLAG.beak, hat: [ 0.2, 0.2, 0.2 ], bottom: 0 },
	bravile: { skin: [ 0.17, 0.4, 0.33 ], belly: [ 0.14, 0.33, 0.28 ], flags: FLAG.quiff, hat: [ 0.78, 0.56, 0.22 ], bottom: 0 },
	heptyle: { skin: [ 0.2, 0.42, 0.35 ], belly: [ 0.17, 0.36, 0.3 ], flags: 0, hat: [ 0.2, 0.2, 0.2 ], bottom: 0 },
	clown: { skin: [ 0.92, 0.9, 0.88 ], belly: [ 0.05, 0.05, 0.06 ], flags: FLAG.cap, hat: [ 0.06, 0.06, 0.07 ], bottom: 1 },
};
const lin = ( c ) => c.map( ( v ) => Math.pow( v, 2.2 ) );
for ( const k in CROWD_LOOKS ) { const L = CROWD_LOOKS[ k ]; L.skinL = lin( L.skin ); L.bellyL = lin( L.belly ); L.hatL = lin( L.hat ); }

// slots (what colour a vertex takes) and bones; aux.w = bone + 10 * slot + 100 * flag (the flag's bit index + 1: shown only with it)
const SLOT = { skin: 0, belly: 1, top: 2, bottom: 3, eye: 4, pupil: 5, hat: 6, fixed: 7 };
const BONE = { root: 0, head: 1, thighL: 2, thighR: 3, shinL: 4, shinR: 5, armL: 6, armR: 7, umbrella: 8 };
const HIP = 0.78, KNEE = 0.42, SHOULDER = 1.17, SX = 0.2, HX = 0.09;
const bitOf = ( f ) => f ? Math.round( Math.log2( f ) ) + 1 : 0;

function figureGeometry() {

	const P = [];
	// add( geometry, bone, slot, extra prepare options, the flag it needs, its placement )
	const add = ( g, bone, slot, o = {}, flag = 0, matrix = null ) => P.push( prepare( g, { rough: 0.8, color: 0xffffff, ...o, matrix, anim: bone + 10 * slot + 100 * bitOf( flag ) } ) );
	for ( const s of [ - 1, 1 ] ) {

		const L = s < 0;
		// legs: thigh (shorts over its top), shin, a flat broad foot
		add( cylinder( 0.058, 0.05, HIP - KNEE, 6 ), L ? BONE.thighL : BONE.thighR, SLOT.skin, {}, 0, mat4( s * HX, ( HIP + KNEE ) / 2, 0 ) );
		add( cylinder( 0.078, 0.07, 0.16, 6 ), L ? BONE.thighL : BONE.thighR, SLOT.bottom, { pattern: PAT.cloth }, 0, mat4( s * HX, HIP - 0.06, 0 ) );
		add( cylinder( 0.048, 0.04, KNEE - 0.06, 6 ), L ? BONE.shinL : BONE.shinR, SLOT.skin, {}, 0, mat4( s * HX, ( KNEE + 0.06 ) / 2, 0 ) );
		add( sphere( 0.07, 6, 4 ), L ? BONE.shinL : BONE.shinR, SLOT.skin, {}, 0, mat4( s * HX * 1.1, 0.04, 0.06, 0, 0, 0, 0.75, 0.42, 1.45 ) );
		// arms: one bone each (shoulder to the hand), a round hand
		add( cylinder( 0.042, 0.034, 0.4, 5 ), L ? BONE.armL : BONE.armR, SLOT.skin, {}, 0, mat4( s * SX, SHOULDER - 0.2, 0, 0, 0, s * 0.06 ) );
		add( sphere( 0.05, 5, 4 ), L ? BONE.armL : BONE.armR, SLOT.skin, {}, 0, mat4( s * ( SX + 0.025 ), SHOULDER - 0.43, 0.01 ) );
		// eyes: big, set wide on the front of the head
		add( sphere( 0.052, 7, 5 ), BONE.head, SLOT.eye, {}, 0, mat4( s * 0.085, 1.5, 0.12 ) );
		add( sphere( 0.024, 5, 3 ), BONE.head, SLOT.pupil, {}, 0, mat4( s * 0.088, 1.5, 0.165 ) );
		// ears (doge, bonk)
		add( cylinder( 0.0, 0.055, 0.12, 5 ), BONE.head, SLOT.skin, {}, FLAG.ears, mat4( s * 0.11, 1.64, - 0.01, 0, 0, - s * 0.35 ) );

	}

	// the torso: hips (shorts), the black tank top, the pale belly in front, the neck
	add( lathe( [ [ 0.0, 0.0 ], [ 0.15, 0.0 ], [ 0.16, 0.12 ], [ 0.15, 0.22 ] ], 8 ), BONE.root, SLOT.bottom, { pattern: PAT.cloth }, 0, mat4( 0, HIP - 0.08, 0, 0, 0, 0, 1, 1, 0.78 ) );
	add( lathe( [ [ 0.15, 0.0 ], [ 0.16, 0.1 ], [ 0.165, 0.26 ], [ 0.13, 0.38 ], [ 0.0, 0.42 ] ], 8 ), BONE.root, SLOT.top, { pattern: PAT.cloth }, 0, mat4( 0, HIP + 0.12, 0, 0, 0, 0, 1, 1, 0.78 ) );
	add( sphere( 0.12, 7, 5 ), BONE.root, SLOT.belly, {}, 0, mat4( 0, 1.0, 0.065, 0, 0, 0, 0.95, 1.35, 0.55 ) );
	add( cylinder( 0.055, 0.065, 0.14, 6 ), BONE.root, SLOT.skin, {}, 0, mat4( 0, 1.29, 0 ) );
	// the head: big and a little wide (the frogs' especially), a jaw line
	add( sphere( 0.175, 10, 7 ), BONE.head, SLOT.skin, {}, 0, mat4( 0, 1.45, 0.01, 0, 0, 0, 1.12, 0.92, 1.0 ) );
	add( sphere( 0.13, 8, 5 ), BONE.head, SLOT.skin, {}, 0, mat4( 0, 1.37, 0.06, 0, 0, 0, 1.15, 0.6, 1.0 ) );
	// a beak (pengu), a cap (the clown), a quiff (bravile)
	add( cylinder( 0.0, 0.05, 0.12, 6 ), BONE.head, SLOT.fixed, { color: 0xe08a20 }, FLAG.beak, mat4( 0, 1.4, 0.21, Math.PI / 2, 0, 0 ) );
	add( cylinder( 0.17, 0.18, 0.1, 8 ), BONE.head, SLOT.hat, {}, FLAG.cap, mat4( 0, 1.6, 0.0 ) );
	add( box( 0.3, 0.02, 0.16 ), BONE.head, SLOT.hat, {}, FLAG.cap, mat4( 0, 1.56, 0.17 ) );
	add( sphere( 0.13, 6, 4 ), BONE.head, SLOT.hat, {}, FLAG.quiff, mat4( 0, 1.62, 0.05, - 0.3, 0, 0, 1.1, 0.45, 1.3 ) );
	// a crate held in front (dockhands), a bucket (the bucket chain)
	add( box( 0.42, 0.3, 0.32 ), BONE.root, SLOT.fixed, { color: 0x8a6a46, pattern: PAT.woodX }, FLAG.crate, mat4( 0, 0.98, 0.36 ) );
	add( cylinder( 0.12, 0.1, 0.22, 7 ), BONE.armR, SLOT.fixed, { color: 0x6a5238, pattern: PAT.wood }, FLAG.bucket, mat4( SX + 0.03, SHOULDER - 0.55, 0.02 ) );
	// the umbrella: the shaft from the raised right hand to the canopy over the head, the canopy's ribs
	const hand = new Vector3( SX + 0.02, SHOULDER - 0.43 * Math.cos( 1.0 ), 0.43 * Math.sin( 1.0 ) );
	add( rod( hand.clone().add( new Vector3( 0, - 0.08, 0 ) ), new Vector3( 0.07, 2.12, 0.1 ), 0.012, 5 ), BONE.umbrella, SLOT.fixed, { color: 0x2a2420 }, FLAG.umbrella );
	add( lathe( [ [ 0.0, 0.26 ], [ 0.58, - 0.02 ], [ 0.6, 0.0 ], [ 0.42, 0.13 ], [ 0.18, 0.26 ], [ 0.0, 0.3 ] ], 10 ), BONE.umbrella, SLOT.hat, { pattern: PAT.cloth }, FLAG.umbrella, mat4( 0.07, 1.86, 0.1 ) );
	return mergePrepared( P );

}

// the skinning: every bone turns about its pivot round the body's x axis (forward swings: negative angles)
const VERTEX = /* wgsl */`
	let A = v.iA; let B = v.iB; let C = v.iC; let D = v.iD;
	let code = v.aux.w;
	let need = floor( code / 100.0 + 0.001 );
	let slot = floor( ( code - need * 100.0 ) / 10.0 + 0.001 );
	let bone = code - need * 100.0 - slot * 10.0;
	let flags = u32( B.w + 0.5 );
	let shown = need < 0.5 || ( ( flags >> u32( need - 1.0 ) ) & 1u ) == 1u;
	let pose = A.z; let ph = A.x; let st = A.y; let seed = A.w;
	let t = frame.time;
	var thL = 0.0; var thR = 0.0; var knL = 0.0; var knR = 0.0; var arL = 0.0; var arR = 0.0; var spL = 0.0; var spR = 0.0;
	var lift = 0.0;
	let breathe = sin( t * 1.4 + seed * 6.0 ) * 0.035;
	if ( pose > 0.5 && pose < 1.5 ) {
		// walk / run: legs and arms in opposition, the knee bends as the leg swings through, a bob on each step
		let sw = sin( ph ) * 0.55 * st;
		thL = sw; thR = - sw;
		knL = max( 0.0, - cos( ph ) ) * 0.9 * st; knR = max( 0.0, cos( ph ) ) * 0.9 * st;
		arL = - sw * 0.85; arR = sw * 0.85;
		lift = ( 1.0 - abs( cos( ph ) ) ) * 0.035 * st;
	} else if ( pose > 1.5 && pose < 2.5 ) {
		// seated: thighs out level, shins down, hands on the knees
		thL = -1.5; thR = -1.5; knL = 1.5; knR = 1.5; arL = -0.55; arR = -0.55;
		lift = -0.33;
	} else if ( pose > 2.5 && pose < 3.5 ) {
		// cheering: both arms up, clapping above the head
		let c = sin( t * 9.0 + seed * 5.0 );
		arL = -2.75 + c * 0.12; arR = -2.75 - c * 0.12; spL = 0.25 - c * 0.12; spR = 0.25 - c * 0.12;
		lift = max( 0.0, sin( t * 4.5 + seed ) ) * 0.04;
	} else if ( pose > 3.5 && pose < 4.5 ) {
		// a wave: the right arm up and swinging
		arR = -2.6; spR = 0.35 + sin( t * 7.0 + seed ) * 0.35; arL = breathe;
	} else if ( pose > 4.5 && pose < 5.5 ) {
		// dancing: a bounce, arms up in turn, a step from side to side
		let c = sin( t * 5.2 + seed * 3.0 );
		arL = -1.6 - c * 0.9; arR = -1.6 + c * 0.9; spL = 0.5; spR = 0.5;
		thL = max( 0.0, c ) * -0.6; thR = max( 0.0, - c ) * -0.6; knL = - thL * 1.4; knR = - thR * 1.4;
		lift = abs( c ) * 0.05;
	} else if ( pose > 5.5 && pose < 6.5 ) {
		// talking: one hand comes up now and then
		let g = smoothstep( 0.3, 0.9, sin( t * 0.9 + seed * 7.0 ) );
		arR = -0.9 * g + breathe; spR = 0.2 * g; arL = breathe;
	} else {
		arL = breathe; arR = - breathe;
	}
	// what the hands hold sets the arms: the umbrella up front (right), the crate in both
	if ( ( flags & 1u ) == 1u && pose < 2.5 ) { arR = -1.0; spR = 0.0; }
	if ( ( flags & 32u ) == 32u ) { arL = -1.15; arR = -1.15; spL = -0.12; spR = -0.12; }
	if ( ( flags & 64u ) == 64u && pose > 0.5 && pose < 1.5 ) { arR = arR * 0.3; }
	var p = v.position; var n = v.normal;
	let b = u32( bone + 0.5 );
	if ( b >= 2u && b <= 5u ) {
		let left = b == 2u || b == 4u;
		let hip = vec3f( select( ${ HX }, -${ HX }, left ), ${ HIP }, 0.0 );
		let knee = vec3f( hip.x, ${ KNEE }, 0.0 );
		let th = select( thR, thL, left ); let kn = select( knR, knL, left );
		if ( b >= 4u ) {
			let c = cos( kn ); let s = sin( kn ); let d = p - knee;
			p = knee + vec3f( d.x, d.y * c - d.z * s, d.y * s + d.z * c );
			n = vec3f( n.x, n.y * c - n.z * s, n.y * s + n.z * c );
		}
		let c = cos( th ); let s = sin( th ); let d = p - hip;
		p = hip + vec3f( d.x, d.y * c - d.z * s, d.y * s + d.z * c );
		n = vec3f( n.x, n.y * c - n.z * s, n.y * s + n.z * c );
	} else if ( b == 6u || b == 7u ) {
		let left = b == 6u;
		let sh = vec3f( select( ${ SX }, -${ SX }, left ), ${ SHOULDER }, 0.0 );
		let a = select( arR, arL, left ); let sp = select( spR, spL, left ) * select( 1.0, -1.0, left );
		var d = p - sh;
		// out to the side first (about z), then forward / up (about x)
		let cz = cos( sp ); let sz = sin( sp );
		d = vec3f( d.x * cz - d.y * sz, d.x * sz + d.y * cz, d.z );
		var m = vec3f( n.x * cz - n.y * sz, n.x * sz + n.y * cz, n.z );
		let c = cos( a ); let s = sin( a );
		p = sh + vec3f( d.x, d.y * c - d.z * s, d.y * s + d.z * c );
		n = vec3f( m.x, m.y * c - m.z * s, m.y * s + m.z * c );
	}
	p.y += lift;
	if ( ! shown ) { p = vec3f( 0.0, 1.0, 0.0 ); }
	v.position = p; v.normal = n;
	// the colours: the character's skin and belly, black top and shorts (the clown's orange plaid), white eyes, the extras' colour
	var col = v.color.rgb;
	let sl = u32( slot + 0.5 );
	if ( sl == 0u ) { col = B.rgb; }
	else if ( sl == 1u ) { col = C.rgb; }
	else if ( sl == 2u ) { col = vec3f( 0.012, 0.012, 0.014 ); }
	else if ( sl == 3u ) {
		let plaid = step( 0.5, fract( v.position.y * 9.0 ) ) * 0.35 + step( 0.5, fract( v.position.x * 9.0 + 0.25 ) ) * 0.35;
		col = select( vec3f( 0.014, 0.014, 0.016 ), vec3f( 0.62, 0.17, 0.02 ) * ( 0.7 + plaid ), C.w > 0.5 );
	}
	else if ( sl == 4u ) { col = vec3f( 0.82, 0.8, 0.74 ); }
	else if ( sl == 5u ) { col = vec3f( 0.01, 0.01, 0.01 ); }
	else if ( sl == 6u ) { col = D.rgb; }
	v.color = vec4f( col, 1.0 );
`;

const _m = new Matrix4(), _q = new Quaternion(), _p = new Vector3(), _s = new Vector3(), _y = new Vector3( 0, 1, 0 );

export class CrowdBatch {

	constructor( scene, cap = 80, { name = 'townlife-crowd', shadow = true } = {} ) {

		this.scene = scene;
		this.cap = cap;
		const geo = figureGeometry();
		this.triangles = geo.index ? geo.index.count / 3 : 0;
		this.attrs = {};
		for ( const k of [ 'iA', 'iB', 'iC', 'iD' ] ) {

			const a = new InstancedBufferAttribute( new Float32Array( cap * 4 ), 4 );
			if ( a.setUsage ) a.setUsage( 35048 ); // (DynamicDrawUsage)
			geo.setAttribute( k, a );
			this.attrs[ k ] = a;

		}

		this.material = createPropMaterial( 'townlifeCrowd', { vertex: VERTEX } );
		this.material.attributes = { ...this.material.attributes, iA: 'vec4f', iB: 'vec4f', iC: 'vec4f', iD: 'vec4f' };
		this.mesh = new InstancedMesh( geo, this.material, cap );
		this.mesh.name = name;
		this.mesh.frustumCulled = false;
		this.mesh.castShadow = shadow;
		this.mesh.count = 0;
		this.n = 0;
		if ( scene ) scene.add( this.mesh );

	}

	begin() {

		this.n = 0;

	}

	// look: CROWD_LOOKS[ character ]; o: { phase, stride, pose, flags, hat: [ r, g, b ] (linear; the umbrella's canopy) }
	push( x, y, z, yaw, scale, look, o ) {

		if ( this.n >= this.cap ) return false;
		const i = this.n ++;
		_q.setFromAxisAngle( _y, yaw );
		_m.compose( _p.set( x, y, z ), _q, _s.set( scale, scale, scale ) );
		this.mesh.setMatrixAt( i, _m );
		const L = look || CROWD_LOOKS.hyptile;
		const A = this.attrs.iA.array, B = this.attrs.iB.array, C = this.attrs.iC.array, D = this.attrs.iD.array, k = i * 4;
		A[ k ] = o.phase || 0; A[ k + 1 ] = o.stride || 0; A[ k + 2 ] = o.pose || 0; A[ k + 3 ] = o.seed || 0;
		B[ k ] = L.skinL[ 0 ]; B[ k + 1 ] = L.skinL[ 1 ]; B[ k + 2 ] = L.skinL[ 2 ]; B[ k + 3 ] = ( L.flags | ( o.flags || 0 ) );
		C[ k ] = L.bellyL[ 0 ]; C[ k + 1 ] = L.bellyL[ 1 ]; C[ k + 2 ] = L.bellyL[ 2 ]; C[ k + 3 ] = L.bottom;
		const h = ( o.flags & FLAG.umbrella ) && o.hat ? o.hat : L.hatL;
		D[ k ] = h[ 0 ]; D[ k + 1 ] = h[ 1 ]; D[ k + 2 ] = h[ 2 ]; D[ k + 3 ] = 0;
		return true;

	}

	end() {

		const m = this.mesh;
		m.count = this.n;
		m.visible = this.n > 0;
		m.instanceMatrix.needsUpdate = true;
		for ( const k in this.attrs ) this.attrs[ k ].needsUpdate = true;

	}

	dispose() {

		if ( this.scene ) this.scene.remove( this.mesh );
		this.mesh.dispose();

	}

}

export { figureGeometry };
