// the --eval body of tools/life/capture.mjs: for each roster character, where the head is (its joint, the top of the vertices
// skinned to it, their widest radius), printed as JSON. Used to size the hats and the veil.
const ids = [ 'hyptile', 'pepe', 'doge', 'bonk', 'pengu', 'clown', 'bravile', 'heptyle' ];
const out = {};
let left = ids.length;
for ( const id of ids ) {

	const av = tl.factory( { scene: app.scene, character: id, lite: true } );
	av.ready.then( ( m ) => {

		const H = m.nodeWorld( 'head', { x: 0, y: 0, z: 0, set( x, y, z ) { this.x = x; this.y = y; this.z = z; return this; } } );
		const j = m.skin.joints.findIndex( ( n ) => m.gltf.nodes[ n ].name === 'head' );
		let top = - 9, bot = 9, r = 0, cz = 0, n = 0, zmin = 9, zmax = - 9;
		const info = { meshes: m.meshes.length, attrs: m.meshes.map( ( q ) => Object.keys( q.geometry.attributes ).join( ',' ) ) };
		for ( const mesh of m.meshes ) {

			const g = mesh.geometry, P = g.attributes.position, J = g.attributes.skinIndex || g.attributes.joints || g.attributes.JOINTS_0, W = g.attributes.skinWeight || g.attributes.weights || g.attributes.WEIGHTS_0;
			if ( ! P || ! J || ! W ) continue;
			for ( let i = 0; i < P.count; i ++ ) {

				let w = 0;
				for ( let k = 0; k < 4; k ++ ) if ( J.getComponent( i, k ) === j ) w += W.getComponent( i, k );
				if ( w < 0.5 ) continue;
				const y = P.getY( i ), x = P.getX( i ), z = P.getZ( i );
				top = Math.max( top, y ); bot = Math.min( bot, y ); r = Math.max( r, Math.hypot( x - H.x, z - H.z ) ); zmin = Math.min( zmin, z ); zmax = Math.max( zmax, z ); n ++;

			}

		}

		out[ id ] = { head: [ H.x, H.y, H.z ].map( ( v ) => Math.round( v * 1000 ) / 1000 ), top: Math.round( top * 1000 ) / 1000, bot: Math.round( bot * 1000 ) / 1000, r: Math.round( r * 1000 ) / 1000, z: [ Math.round( zmin * 1000 ) / 1000, Math.round( zmax * 1000 ) / 1000 ], n, info: id === 'hyptile' ? info : undefined };
		if ( -- left === 0 ) console.log( 'HEADSCAN ' + JSON.stringify( out ) );

	} );

}
