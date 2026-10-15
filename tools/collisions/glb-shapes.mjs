// Node helper for the collision audit and tests (wave 24B): a ship GLB as the game hangs it (StaticGLB's baked node
// transforms, centreOnHull's shift, the pivot turned by MODEL_YAW) without a GPU, so HullShape.shapeFromObject reads the
// same vertices it reads in the game.
//   const g = glbGroup( 'public/models/ships/sloop_v2.glb', { scale } )  -> { group, pivot }
import { readFileSync } from 'node:fs';
import { parseGLB } from '../../src/engine/loaders/GLTF.js';
import { Group, Mesh, BufferGeometry, BufferAttribute, Matrix4, Vector3, Quaternion } from '../../src/engine/index.js';
import { MODEL_YAW } from '../../src/world/boat/ShipFrame.js';

export function glbGroup( file, { scale = 1 } = {} ) {

	const buf = readFileSync( file );
	const g = parseGLB( buf.buffer.slice( buf.byteOffset, buf.byteOffset + buf.byteLength ) );
	const meshes = [];
	const walk = ( i, parent ) => {

		const n = g.nodes[ i ];
		const m = new Matrix4().compose( new Vector3( ...n.t ), new Quaternion( ...n.r ), new Vector3( ...n.s ) );
		const w = parent ? parent.clone().multiply( m ) : m;
		if ( n.mesh !== undefined ) for ( const p of g.meshes[ n.mesh ] ) {

			const P = p.attributes.POSITION.array, out = new Float32Array( P.length ), v = new Vector3();
			for ( let k = 0; k < P.length; k += 3 ) { v.set( P[ k ], P[ k + 1 ], P[ k + 2 ] ).applyMatrix4( w ); out[ k ] = v.x; out[ k + 1 ] = v.y; out[ k + 2 ] = v.z; }
			const geo = new BufferGeometry();
			geo.setAttribute( 'position', new BufferAttribute( out, 3 ) );
			meshes.push( geo );

		}

		for ( const c of n.children ) walk( c, w );

	};

	for ( const r of g.roots ) walk( r, null );
	// centreOnHull: the middle of the X extent to the origin
	let lo = Infinity, hi = - Infinity;
	for ( const geo of meshes ) { const a = geo.attributes.position.array; for ( let k = 0; k < a.length; k += 3 ) { lo = Math.min( lo, a[ k ] ); hi = Math.max( hi, a[ k ] ); } }
	const mid = ( lo + hi ) / 2;
	const group = new Group(), pivot = new Group();
	pivot.rotation.y = MODEL_YAW;
	group.add( pivot );
	group.scale.set( scale, scale, scale );
	for ( const geo of meshes ) {

		const a = geo.attributes.position.array;
		if ( Math.abs( mid ) >= 0.25 ) for ( let k = 0; k < a.length; k += 3 ) a[ k ] -= mid;
		pivot.add( new Mesh( geo, null ) );

	}

	return { group, pivot };

}
