import { Material } from '../../engine/render/Material.js';
import { Mesh } from '../../engine/scene/Mesh.js';
import { PlaneGeometry, InstancedBufferAttribute } from '../../engine/geometry/index.js';
import { LAYERS } from '../../engine/render/SceneRenderer.js';

// Car lamps on the road (wave 27C). The lamps of a lit car were glowing cells on its body and, for the car you drive, two real
// spot lights; traffic and parked cars threw nothing, so at night the road ahead of a car stayed black. One instanced draw
// of flat additive quads lays a cone of light on the road ahead of every lit car (headlights) and a small red wash behind it
// (tail lights), unlit, depth tested, no depth write, premultiplied with alpha 0 (pure addition, like the night's glows).
// It costs no local-light slot. Off by day (frame.night).
//
//   const b = new CarBeams( scene, { count: 96 } );
//   b.begin(); b.push( x, y, z, fx, fz, len, wid, kind ); b.end();      kind 0 = headlight cone, 1 = tail light wash
//   b.draw( list, { night, view } )   from CarRender.draw: every lit record ( x, y, z, quat, lights, kind, stage, hidden ) near the view
//   b.hide(), b.dispose()
export const HEAD = 0, TAIL = 1;
const FRONT = { sedan: 2.4, taxi: 2.4, police: 2.45, pickup: 2.7, van: 2.55, sports: 2.2, bus: 5.5 }, REAR = { sedan: 2.3, taxi: 2.3, police: 2.4, pickup: 2.65, van: 2.55, sports: 2.15, bus: 5.5 };
const WID = { sedan: 1.8, taxi: 1.8, police: 1.84, pickup: 1.95, van: 1.98, sports: 1.92, bus: 2.5 };
const RANGE = 150; // m from the view: beyond it a pool is under a pixel

export class CarBeams {

	constructor( scene, { count = 96 } = {} ) {

		this.max = count;
		this.n = 0;
		this.scene = scene;
		const mat = new Material( {
			name: 'CarBeams',
			lit: false,
			transparent: true,
			depthWrite: false,
			depthTest: true,
			side: 'double',
			blending: 'premultiplied',
			velocityWeight: 0,
			underwaterLighting: 'none',
			receiveShadows: false,
			attributes: { gPos: 'vec4f', gDir: 'vec4f' },
			varyings: { vBeamUV: 'vec2f', vBeamKind: 'f32' },
			vertex: /* wgsl */`
	let c = v.gPos.xyz;
	let kind = v.gPos.w;
	let f = normalize( v.gDir.xy + vec2f( 1e-5, 0.0 ) );
	let s = vec2f( - f.y, f.x );
	let corner = v.position.xy; // the plane is 2 x 2
	let u = corner.y * 0.5 + 0.5;
	let len = v.gDir.z;
	let wid = v.gDir.w;
	var xz = c.xz;
	if ( kind < 0.5 ) {
		// a cone from the bumper out over the road: 1.6 m wide at the lamps, three times the car's width at the far end
		xz = c.xz + f * ( u * len ) + s * ( corner.x * mix( wid * 0.5, wid * 1.9, u ) );
	} else {
		// a short wash behind the car
		xz = c.xz - f * ( u * len ) + s * ( corner.x * mix( wid * 0.5, wid * 0.9, u ) );
	}
	o.vBeamUV = vec2f( corner.x, u );
	o.vBeamKind = kind;
	v.useWorld = true;
	v.worldPos = vec3f( xz.x, c.y, xz.y );
	v.worldNormal = vec3f( 0.0, 1.0, 0.0 );
	v.prevWorldPos = v.worldPos;
`,
			surface: /* wgsl */`
	let uv = in.vs.vBeamUV;
	let night = smoothstep( 0.05, 0.45, frame.night );
	var k = 0.0;
	var col = vec3f( 1.0, 0.9, 0.72 );
	if ( in.vs.vBeamKind < 0.5 ) {
		// two lobes (the lamps are 1.4 m apart) merging a few metres out, brightest at ~6 m, fading to nothing at the end
		let along = smoothstep( 0.0, 0.22, uv.y ) * pow( max( 1.0 - uv.y, 0.0 ), 1.7 );
		let across = pow( max( 1.0 - uv.x * uv.x, 0.0 ), 1.05 );
		let lobes = mix( 0.62 + 0.38 * cos( uv.x * 5.2 ), 1.0, smoothstep( 0.0, 0.35, uv.y ) );
		k = along * across * lobes * 0.2;
	} else {
		col = vec3f( 1.0, 0.1, 0.05 );
		let r = dot( vec2f( uv.x, uv.y * 1.2 ), vec2f( uv.x, uv.y * 1.2 ) );
		k = max( 1.0 - r, 0.0 ) * max( 1.0 - r, 0.0 ) * 0.11;
	}
	s.albedo = col * ( k * night );
	s.emissive = vec3f( 0.0 );
	s.alpha = 0.0;
`,
			output: 'r.color = vec4f( s.albedo, 0.0 );',
		} );
		mat.lightingHooks = false;
		const geo = new PlaneGeometry( 2, 2 );
		this.pos = new InstancedBufferAttribute( new Float32Array( count * 4 ), 4 );
		this.dir = new InstancedBufferAttribute( new Float32Array( count * 4 ), 4 );
		geo.setAttribute( 'gPos', this.pos );
		geo.setAttribute( 'gDir', this.dir );
		geo.instanceCount = 0;
		this.geometry = geo;
		this.material = mat;
		this.mesh = new Mesh( geo, mat );
		this.mesh.name = 'CarBeams';
		this.mesh.frustumCulled = false;
		this.mesh.castShadow = false;
		this.mesh.receiveShadow = false;
		this.mesh.renderOrder = 22;
		this.mesh.layers.set( LAYERS.TRANSPARENT );
		this.mesh.visible = false;
		if ( scene && scene.add ) scene.add( this.mesh );

	}

	begin() {

		this.n = 0;

	}

	push( x, y, z, fx, fz, len, wid, kind = HEAD ) {

		if ( this.n >= this.max ) return false;
		const o = this.n * 4;
		const p = this.pos.array, d = this.dir.array;
		p[ o ] = x; p[ o + 1 ] = y; p[ o + 2 ] = z; p[ o + 3 ] = kind;
		d[ o ] = fx; d[ o + 1 ] = fz; d[ o + 2 ] = len; d[ o + 3 ] = wid;
		this.n ++;
		return true;

	}

	end() {

		const n = this.n;
		this.geometry.instanceCount = n;
		this.mesh.visible = n > 0;
		if ( n > 0 ) for ( const a of [ this.pos, this.dir ] ) {

			if ( a.clearUpdateRanges ) a.clearUpdateRanges();
			if ( a.addUpdateRange ) a.addUpdateRange( 0, n * 4 );
			a.needsUpdate = true;

		}

	}

	hide() {

		this.n = 0;
		this.geometry.instanceCount = 0;
		this.mesh.visible = false;

	}

	// CarRender.draw's list: a cone ahead and a wash behind every lit car near the view (nearest first when over the cap)
	draw( list, { night = false, view = null } = {} ) {

		if ( ! night ) { if ( this.mesh.visible ) this.hide(); return; }
		this.begin();
		const R2 = RANGE * RANGE;
		for ( const r of list ) {

			if ( ! r.lights || r.hidden || ( r.stage || 0 ) >= 4 || ! r.quat ) continue;
			if ( view && ( r.x - view.x ) ** 2 + ( r.z - view.z ) ** 2 > R2 ) continue;
			const q = r.quat;
			// the car's forward (+z local) on the ground
			const fx = 2 * ( q.x * q.z + q.w * q.y ), fz = 1 - 2 * ( q.x * q.x + q.y * q.y );
			const l = Math.hypot( fx, fz ) || 1, dx = fx / l, dz = fz / l;
			const wid = WID[ r.kind ] || 1.85, y = r.y + 0.07;
			if ( ! this.push( r.x + dx * ( FRONT[ r.kind ] || 2.4 ), y, r.z + dz * ( FRONT[ r.kind ] || 2.4 ), dx, dz, r.kind === 'bus' ? 20 : 17, wid, HEAD ) ) break;
			if ( ! this.push( r.x - dx * ( REAR[ r.kind ] || 2.3 ), y, r.z - dz * ( REAR[ r.kind ] || 2.3 ), dx, dz, 2.6, wid, TAIL ) ) break;

		}

		this.end();

	}

	dispose() {

		try {

			if ( this.mesh.parent ) this.mesh.parent.remove( this.mesh );
			if ( this.geometry.dispose ) this.geometry.dispose();
			if ( this.material.dispose ) this.material.dispose();

		} catch ( e ) { /* already gone */ }

		this.mesh.visible = false;

	}

}
