import { cylinder, sphere, mat4 } from '../../boat/GeoKit.js';
import { WOOD, palm, rng } from '../IslandKit.js';
import { TIDEMARK as I } from '../../terrain/IslandShape.js';
import { airstripRects, rectOut } from './TidemarkTerrain.js';

// Tidemark's trees: coconut palms along the bay beach and the back of the dunes, broadleaf trees on the hill flanks where
// the tile's woodland mask is (the home island's instanced vegetation system covers the 2048 m heightmap only, so the
// tile island gets the IslandKit low-poly plants the other islands use, merged into the island's prop meshes). Clear of
// the roads, the river, the town terrace, the graded airstrip (and its approach) and every collider.
//
//   const veg = scatterTrees( { tile, colliders, add, addFar, budget } )   veg.palms, veg.trees (counts)

const TOWN = I.pads[ 0 ];

export function scatterTrees( { tile, colliders = null, add, addFar = null, budget = 1 } ) {

	const rnd = rng( 8812 );
	const strip = airstripRects();
	const placed = [];
	const free = ( x, z, r ) => {

		const [ u, v ] = tile.local( x, z );
		if ( rectOut( u, v, TOWN[ 0 ], TOWN[ 1 ], TOWN[ 2 ], TOWN[ 3 ] ) < 6 ) return false;
		if ( rectOut( u, v, - 154, - 124, - 120, - 84 ) < 4 ) return false; // the boatyard slip
		for ( const R of strip ) if ( rectOut( u, v, R[ 0 ], R[ 1 ], R[ 2 ], R[ 3 ] ) < 10 ) return false;
		// the take-off and landing approaches stay clear of trees for 120 m past each end
		if ( Math.abs( v - I.airstrip.v ) < I.airstrip.width && Math.abs( u - I.airstrip.u ) < I.airstrip.length / 2 + 120 ) return false;
		if ( tile.pathDistance( x, z ) < 2.5 + r ) return false;
		const m = tile.maskAt( x, z );
		if ( m.river > 0.05 || m.rock > 0.5 ) return false;
		for ( const p of placed ) if ( ( p[ 0 ] - x ) ** 2 + ( p[ 1 ] - z ) ** 2 < ( r + p[ 2 ] ) ** 2 ) return false;
		if ( colliders ) {

			for ( const b of colliders.boxes ) {

				if ( Math.abs( x - b.center.x ) > b.radius + r + 1 || Math.abs( z - b.center.z ) > b.radius + r + 1 ) continue;
				return false;

			}

		}

		return true;

	};

	// palms: the beach (sand, 0.9 - 4 m up)
	let palms = 0;
	const wantPalms = Math.round( 50 * budget );
	for ( let k = 0; k < 6000 && palms < wantPalms; k ++ ) {

		const x = tile.x0 + rnd() * ( tile.x1 - tile.x0 ), z = tile.z0 + rnd() * ( tile.z1 - tile.z0 );
		const h = tile.heightAt( x, z );
		if ( h < 0.9 || h > 4.5 ) continue;
		if ( tile.maskAt( x, z ).sand < 0.3 && h > 2.2 ) continue;
		if ( ! free( x, z, 1.6 ) ) continue;
		palm( add, x, h - 0.1, z, 6 + rnd() * 4.5, rnd, 0.2 + rnd() * 0.35 );
		placed.push( [ x, z, 1.6 ] );
		if ( colliders ) colliders.addCylinder( x, z, 0.25, h - 0.5, h + 3, { tag: 'tidemarkPalm' } );
		palms ++;

	}

	// broadleaf trees: the woodland on the hill flanks (a far-LOD crown for the landmark hills too)
	let trees = 0;
	const wantTrees = Math.round( 120 * budget );
	for ( let k = 0; k < 12000 && trees < wantTrees; k ++ ) {

		const x = tile.x0 + rnd() * ( tile.x1 - tile.x0 ), z = tile.z0 + rnd() * ( tile.z1 - tile.z0 );
		const h = tile.heightAt( x, z );
		if ( h < 4 ) continue;
		const m = tile.maskAt( x, z );
		if ( m.forest < 0.35 + rnd() * 0.4 ) continue;
		const n = tile.normalAt( x, z );
		if ( n.y < 0.8 ) continue;
		if ( ! free( x, z, 2.4 ) ) continue;
		const s = 0.8 + rnd() * 0.6;
		tree( add, x, h, z, s, rnd );
		if ( addFar ) addFar( sphere( 3.2 * s, 6, 4 ), { color: 0x3e5a2c, rough: 0.9, matrix: mat4( x, h + 6.2 * s, z, 0, 0, 0, 1, 0.8, 1 ) } );
		placed.push( [ x, z, 2.4 * s ] );
		if ( colliders ) colliders.addCylinder( x, z, 0.35 * s, h - 0.5, h + 4 * s, { tag: 'tidemarkTree' } );
		trees ++;

	}

	return { palms, trees };

}

// a broadleaf tree: a leaning trunk and three overlapping crown lobes
function tree( add, x, y, z, s, rnd ) {

	const lean = ( rnd() - 0.5 ) * 0.15, yaw = rnd() * Math.PI * 2;
	add( cylinder( 0.22 * s, 0.34 * s, 5 * s, 5 ), { ...WOOD( 0x5a4a3a, { rough: 0.95 } ), matrix: mat4( x, y + 2.4 * s, z, lean, yaw, 0 ) } );
	const greens = [ 0x3f6b2a, 0x4b7a31, 0x36602a, 0x557f38 ];
	for ( let k = 0; k < 3; k ++ ) {

		const a = yaw + k * 2.1, r = 1.3 * s;
		add( sphere( ( 2.3 + rnd() * 0.8 ) * s, 7, 5 ), { color: greens[ Math.floor( rnd() * 4 ) ], rough: 0.85, matrix: mat4( x + Math.cos( a ) * r, y + ( 5.6 + rnd() * 1.4 ) * s, z + Math.sin( a ) * r, 0, rnd() * 3, 0, 1, 0.78, 1 ) } );

	}

}
