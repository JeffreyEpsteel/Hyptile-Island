// Real mirrors for the car you sit in (wave 25E). On desktop one low-resolution view of the scene behind the car (a wide
// camera at the roof's middle, looking back through the rear window) feeds every mirror of the cabin: each mirror
// glass shows that view on its own quad (MIRROR_SURFACE: left and right swapped, as a mirror does), so the rear-view mirror
// and both door mirrors show the road behind, each from its own angle. Rendered every other frame, opaque layer only,
// after the main scene (an App hook: cars.renderMirrors( meshRenderer, scene )). Phones keep the cube fake: the mirrors'
// metal reflects the sky's environment light (CarInterior's 'mirror' family), with no second view.
//
//   const m = new CarMirrors( { phone } )   m.texture (null on phones)   m.uniforms (shared by the mirror materials)
//   m.update( group, spec, active )   m.render( meshRenderer, scene )   m.dispose()
import { PerspectiveCamera, Matrix4, Vector3, Vector4 } from '../../engine/index.js';
import { RenderTarget } from '../../engine/gpu/Texture.js';
import { createViewUniforms, setFrameCamera, G } from '../../engine/render/Frame.js';
import { LAYERS, DEPTH_FORMAT } from '../../engine/render/SceneRenderer.js';

export const MIRROR_VIEW = Object.freeze( { w: 384, h: 160, fov: 58, near: 0.35, far: 900, every: 2 } );
// the mirror's face: each mirror is aimed as a driver aims it (its normal halves the angle between the eye and the rear
// view's direction, from the glass's centre), the eye's ray reflected in it and looked up in the rear view; beyond the
// view's edges (or before the first view) the metal's environment reflection stands in
export const MIRROR_SURFACE = /* wgsl */`
	{
		let side = select( 0.0, sign( in.vs.vMirror.x ), abs( in.vs.vMirror.x ) > 0.5 );
		let C = select( select( mat.mirrorC0.xyz, mat.mirrorC1.xyz, side > 0.5 ), mat.mirrorC2.xyz, side < - 0.5 );
		let Na = normalize( normalize( mat.mirrorEye.xyz - C ) + mat.mirrorBack.xyz );
		let I = - normalize( in.V );
		let Rm = reflect( I, Na );
		let clip = mat.mirrorVP * vec4f( in.P + Rm * 60.0, 1.0 );
		let uv = clip.xy / max( clip.w, 1e-4 ) * vec2f( 0.5, - 0.5 ) + 0.5;
		let inside = step( 0.0, clip.w ) * step( 0.0, uv.x ) * step( uv.x, 1.0 ) * step( 0.0, uv.y ) * step( uv.y, 1.0 ) * mat.mirrorLive;
		let seen = textureSampleLevel( mirrorTex, smpLinearClamp, clamp( uv, vec2f( 0.0 ), vec2f( 1.0 ) ), 0.0 ).rgb;
		s.metalness = mix( 1.0, 0.0, inside ); s.roughness = mix( 0.02, 1.0, inside );
		s.albedo = mix( vec3f( 0.86, 0.88, 0.9 ), vec3f( 0.0 ), inside );
		s.emissive += seen * 0.92 * inside;
	}
`;

const _p = new Vector3(), _t = new Vector3(), _vp = new Matrix4();
const MIRROR_FILTER = ( o ) => ! ( o.material && o.material.uniforms && o.material.uniforms.mirrorLive );

export class CarMirrors {

	constructor( { phone = !! globalThis.__phoneBudget } = {} ) {

		this.phone = phone;
		this.active = false;
		this.frame = 0;
		this.renders = 0;
		this.uniforms = { mirrorVP: { value: new Matrix4() }, mirrorLive: { value: 0 }, mirrorEye: { value: new Vector4() }, mirrorBack: { value: new Vector4() } };
		this.centers = [ new Vector3(), new Vector3(), new Vector3() ]; // group-local: the rear-view mirror, the left, the right
		this.centersW = [ new Vector4(), new Vector4(), new Vector4() ];
		if ( phone ) { this.texture = null; return; }
		this.target = new RenderTarget( MIRROR_VIEW.w, MIRROR_VIEW.h, { colors: [ 'rgba16float' ], depth: DEPTH_FORMAT, label: 'car-mirror' } );
		this.texture = this.target.texture;
		this.camera = new PerspectiveCamera( MIRROR_VIEW.fov, MIRROR_VIEW.w / MIRROR_VIEW.h, MIRROR_VIEW.near, MIRROR_VIEW.far );
		this.block = createViewUniforms( 'car-mirror' );
		this._clear = [ [ 0.5, 0.6, 0.7, 1 ] ];

	}

	// the rear camera rides the car (its roof's middle, the eye's height, looking back); active: a cabin with mirrors in view
	update( group, spec, active ) {

		this.active = !! ( active && group && spec && this.camera );
		this.uniforms.mirrorLive.value = this.active && this.renders > 0 ? 1 : 0;
		if ( ! this.active ) return;
		group.updateMatrixWorld( true );
		const e = spec.eye;
		group.localToWorld( _p.set( 0, e[ 1 ] + 0.06, e[ 2 ] ) );
		group.localToWorld( _t.set( 0, e[ 1 ] - 0.35, e[ 2 ] - 20 ) );
		this.camera.position.copy( _p );
		this.camera.up.set( 0, 1, 0 ).applyQuaternion( group.quaternion );
		this.camera.lookAt( _t );
		this.camera.updateMatrixWorld();
		this.camera.matrixWorldInverse.copy( this.camera.matrixWorld ).invert();
		_vp.multiplyMatrices( this.camera.projectionMatrix, this.camera.matrixWorldInverse );
		this.uniforms.mirrorVP.value.copy( _vp );
		group.localToWorld( _p.set( e[ 0 ], e[ 1 ], e[ 2 ] ) );
		this.uniforms.mirrorEye.value.set( _p.x, _p.y, _p.z, 1 );
		_t.set( 0, - 0.05, - 1 ).applyQuaternion( group.quaternion ).normalize();
		this.uniforms.mirrorBack.value.set( _t.x, _t.y, _t.z, 0 );
		this.centers.forEach( ( c, i ) => { group.localToWorld( _p.copy( c ) ); this.centersW[ i ].set( _p.x, _p.y, _p.z, 1 ); } );

	}

	// the mirrors' centres from the cabin's mirror geometry (group-local positions): the middle one, then by side
	setCenters( geometry ) {

		const p = geometry && geometry.attributes.position;
		if ( ! p ) return;
		const sum = [ [ 0, 0, 0, 0 ], [ 0, 0, 0, 0 ], [ 0, 0, 0, 0 ] ];
		for ( let i = 0; i < p.count; i ++ ) {

			const x = p.getX( i ), k = Math.abs( x ) <= 0.5 ? 0 : x > 0 ? 1 : 2;
			sum[ k ][ 0 ] += x; sum[ k ][ 1 ] += p.getY( i ); sum[ k ][ 2 ] += p.getZ( i ); sum[ k ][ 3 ] ++;

		}
		sum.forEach( ( s, k ) => { if ( s[ 3 ] ) this.centers[ k ].set( s[ 0 ] / s[ 3 ], s[ 1 ] / s[ 3 ], s[ 2 ] / s[ 3 ] ); } );

	}

	// copy the shared state into a mirror material's uniforms
	apply( mat ) {

		const u = mat && mat.uniforms;
		if ( ! u || ! u.mirrorVP ) return;
		u.mirrorVP.value.copy( this.uniforms.mirrorVP.value );
		u.mirrorLive.value = this.uniforms.mirrorLive.value;
		u.mirrorEye.value.copy( this.uniforms.mirrorEye.value );
		u.mirrorBack.value.copy( this.uniforms.mirrorBack.value );
		u.mirrorC0.value.copy( this.centersW[ 0 ] ); u.mirrorC1.value.copy( this.centersW[ 1 ] ); u.mirrorC2.value.copy( this.centersW[ 2 ] );

	}

	render( meshRenderer, scene ) {

		if ( ! this.active || ! meshRenderer || ! scene || ! this.target ) return false;
		if ( ( this.frame ++ ) % MIRROR_VIEW.every && this.renders > 0 ) return false;
		const h = G.horizonColor && G.horizonColor.value;
		if ( h ) this._clear[ 0 ] = [ h.r ?? h.x ?? 0.5, h.g ?? h.y ?? 0.6, h.b ?? h.z ?? 0.7, 1 ];
		setFrameCamera( this.camera, MIRROR_VIEW.w, MIRROR_VIEW.h, { block: this.block } );
		meshRenderer.render( scene, {
			label: 'car mirror', kind: 'color', camera: this.camera, frameBlock: this.block,
			colorViews: [ this.target.texture.view() ], colorFormats: this.target.formats,
			depthView: this.target.depthTexture.view(), depthFormat: DEPTH_FORMAT,
			clearColors: this._clear, clearDepth: 0, layerMask: 1 << LAYERS.OPAQUE,
			// (never the mirrors themselves: they sample this very target)
			filter: MIRROR_FILTER,
		} );
		this.renders ++;
		this.uniforms.mirrorLive.value = 1;
		return true;

	}

	dispose() {

		this.target?.textures?.forEach?.( ( t ) => t.destroy?.() );
		this.target?.depthTexture?.destroy?.();
		this.target = null; this.texture = null;

	}

}

