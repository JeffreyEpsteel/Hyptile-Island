import { Mesh, Vector3, Color } from '../../../engine/index.js';
import { prepare, mergePrepared, box, cylinder, sphere, mat4 } from '../../boat/GeoKit.js';
import { PAT } from '../../../game/GameMaterials.js';
import { mulberry32 } from '../../../util/Noise.js';
import { Builder, Batch } from '../../village/GeoBuilder.js';
import { buildHouse } from '../../village/Buildings.js';
import { InstancedProps, Rand, lin } from '../../Props.js';
import { WOOD, WOODX, STONE, PAINT, frameAt, cottage } from '../IslandKit.js';
import { BUILDINGS, EXTRA } from './Layout.js';

// Tidemark's building shells: the fishermen's houses, the chandlery, the tavern and the harbourmaster's hut are the home
// village's own houses (village/Buildings.js buildHouse, its baked PBR materials) when the Village is passed in, plain
// GeoKit cottages otherwise; the warehouse, the chapel with its belfry, the boatyard shed, the airstrip's hangar and the
// hilltop lookout are GeoKit (one merged prop mesh). Shells take damage decals at most (Damage.js), never collapse.
//
//   const shells = buildShells( { terrain, colliders, village, propMaterial } )
//   shells.meshes (add to a group: village-material meshes + the GeoKit mesh), shells.far (the lookout: a landmark),
//   shells.list [ { id, kind, name, x, z, yaw, w, d, floorY, top } ], shells.lamp (the lookout's lamp position)

const PASTEL = [ lin( 0x7fc8c0 ), lin( 0xf0a890 ), lin( 0xf2e2b8 ), lin( 0x9cc8e4 ), lin( 0xf4d27a ), lin( 0xb8e0c4 ), lin( 0xe8c0d4 ) ];
const TRIM = { white: lin( 0xf2efe6 ), cream: lin( 0xe8dcc0 ), navy: lin( 0x2e4f73 ), teal: lin( 0x2d7f7a ), red: lin( 0xa8463a ), green: lin( 0x4c7d4c ) };
const ROOF = { red: lin( 0xa64a35 ), green: lin( 0x5f8a6a ), blue: lin( 0x4f7898 ), teal: lin( 0x3f8a86 ), rust: lin( 0x8a5a40 ), grey: lin( 0x8c9296 ) };

// the village house spec of a town building (village/Buildings.js buildHouse fields)
function houseSpec( b, rand ) {

	const base = { name: b.id, x: b.x, z: b.z, yaw: b.yaw, w: b.w, d: b.d, curtain: rand.pick( [ lin( 0xe8d6b0 ), lin( 0xd98c7a ), lin( 0x9cc0d8 ) ] ), foundation: 'stone', stoneStyle: 1 };
	switch ( b.id ) {

		case 'tavern': return { ...base, stories: 2, roof: 'gable', roofMat: 'metal', roofColor: ROOF.red, wall: lin( 0xd9b38c ), trim: TRIM.cream, accent: TRIM.green, siding: 2, porch: { depth: 2.4, rail: 'balusters' }, paint: 0.6, chimney: 1, doorGlass: true, antenna: false };
		case 'chandler': return { ...base, stories: 2, roof: 'gableFront', roofMat: 'metal', galv: true, rust: 0.4, wall: lin( 0x9fc1c9 ), trim: TRIM.white, accent: TRIM.navy, siding: 1, porch: { depth: 2.0, rail: 'x' }, paint: 0.7, doorGlass: true };
		case 'office': return { ...base, roof: 'hip', roofMat: 'metal', roofColor: ROOF.blue, wall: TRIM.white, trim: TRIM.navy, accent: TRIM.navy, siding: 1, paint: 0.75, fewWindows: true };
		default: {

			const k = b.id.charCodeAt( b.id.length - 1 ) % PASTEL.length;
			return { ...base, stories: b.stories, roof: rand.pick( [ 'gable', 'hip', 'gableFront' ] ), roofMat: rand.chance( 0.35 ) ? 'thatch' : 'metal', thatchAge: 0.4, roofColor: rand.pick( Object.values( ROOF ) ),
				wall: PASTEL[ k ], trim: TRIM.white, accent: rand.pick( [ TRIM.navy, TRIM.teal, TRIM.red, TRIM.green ] ), siding: 1 + ( k % 2 ), paint: 0.55 + rand.next() * 0.2,
				porch: rand.chance( 0.5 ) ? { depth: 1.8, rail: rand.pick( [ 'x', 'balusters' ] ) } : null, shutters: rand.pick( [ 'board', 'bahama', 'louver' ] ), buoys: rand.chance( 0.4 ) ? 1 : 0 };

		}

	}

}

const HOUSE_KINDS = new Set( [ 'house', 'tavern', 'chandler' ] );

export function buildShells( { terrain, colliders, village = null, propMaterial } ) {

	const P = [], F = [];
	const add = ( g, o ) => P.push( prepare( g, o ) );
	const addFar = ( g, o ) => F.push( prepare( g, o ) );
	const list = [];
	const meshes = [];
	const useVillage = !! ( village && village.materials && village.textures );
	const B = useVillage ? new Builder() : null;
	const rand = new Rand( mulberry32( 4242 ) );
	const ctx = useVillage ? { B, terrain, colliders, rand, lights: [], inst: new InstancedProps( B ), checks: [] } : null;
	const frame = ( b, y = null ) => frameAt( b.x, y ?? terrain.heightAt( b.x, b.z ), b.z, b.yaw );

	for ( const b of BUILDINGS ) {

		const g = terrain.heightAt( b.x, b.z );
		let top = g + b.stories * 2.8 + 2;
		if ( HOUSE_KINDS.has( b.kind ) ) {

			if ( useVillage ) {

				const res = buildHouse( ctx, houseSpec( b, rand ) );
				top = res.roofTop ?? top;

			} else {

				const sp = houseSpec( b, rand );
				const hex = ( c ) => new Color( c[ 0 ], c[ 1 ], c[ 2 ] ).getHex();
				const r = cottage( add, frame( b ), { w: b.w, d: b.d, storeys: b.stories, wall: hex( sp.wall ), roof: hex( sp.roofColor || ROOF.red ), trim: hex( sp.accent ), plank: sp.siding === 2, tin: sp.roofMat === 'metal' } );
				top = g + r.top;
				if ( colliders ) colliders.addBox( new Vector3( b.x, g + b.stories * 1.4, b.z ), new Vector3( b.w / 2 + 0.15, b.stories * 1.4, b.d / 2 + 0.15 ), b.yaw, { tag: 'tidemarkHouse' } );

			}

		} else if ( b.kind === 'warehouse' ) top = warehouse( add, frame( b ), b, colliders );
		else if ( b.kind === 'chapel' ) top = chapel( add, frame( b ), b, colliders );
		else if ( b.kind === 'boatyard' ) top = boatyard( add, frame( b ), b, colliders );
		list.push( { id: b.id, kind: b.kind, name: b.name, x: b.x, z: b.z, yaw: b.yaw, w: b.w, d: b.d, floorY: g, top } );

	}

	const hangarB = EXTRA.find( ( e ) => e.id === 'hangar' ), lookB = EXTRA.find( ( e ) => e.id === 'lookout' );
	const hTop = hangar( add, frame( hangarB ), hangarB, colliders );
	list.push( { id: 'hangar', kind: 'hangar', name: hangarB.name, x: hangarB.x, z: hangarB.z, yaw: hangarB.yaw, w: hangarB.w, d: hangarB.d, floorY: terrain.heightAt( hangarB.x, hangarB.z ), top: hTop } );
	const look = lookout( addFar, frame( lookB ), colliders );
	list.push( { id: 'lookout', kind: 'lookout', name: lookB.name, x: lookB.x, z: lookB.z, yaw: lookB.yaw, w: 5, d: 5, floorY: look.y, top: look.top } );

	if ( useVillage ) meshes.push( ...assemble( B, village ) );
	const near = new Mesh( mergePrepared( P ), propMaterial );
	near.name = 'TidemarkShells';
	near.castShadow = true;
	near.receiveShadow = true;
	meshes.push( near );
	const far = new Mesh( mergePrepared( F ), propMaterial );
	far.name = 'TidemarkLookout';
	far.castShadow = true;
	return { meshes, far, list, lamp: look.lamp, village: useVillage };

}

// the village builder's batches as meshes with the village's materials (the folds of Village._assemble: glass into wood,
// rope into hard, cloth / flags into fabric); the texture bake is shared with the village (a no-op once baked)
function assemble( B, village ) {

	const mats = village.materials, out = [];
	const take = ( key ) => {

		const b = B.batches[ key ];
		delete B.batches[ key ];
		return b;

	};
	const wood = B.batch( 'wood' ), hard = B.batch( 'hard' ), fabric = B.batch( 'fabric' );
	const glass = take( 'glass' ), rope = take( 'rope' ), cloth = take( 'cloth' ), net = take( 'net' ), flag = take( 'flag' );
	if ( glass ) wood.append( glass, ( d ) => [ d[ 0 ], d[ 1 ], 9, d[ 2 ] ] );
	if ( rope ) hard.append( rope, ( d ) => [ d[ 0 ], 0, 0, 2 + d[ 1 ] ] );
	if ( cloth ) fabric.append( cloth, ( d ) => [ d[ 0 ], d[ 1 ], 0, 0 ] );
	if ( flag ) fabric.append( flag, ( d ) => [ d[ 0 ], d[ 1 ], d[ 2 ] + 10000, d[ 3 ] ] );
	const nets = new Batch();
	if ( net ) nets.append( net, ( d ) => [ d[ 0 ], d[ 1 ], Math.max( 0.02, d[ 2 ] ), 0 ] );
	const bake = () => village.textures.bake();
	for ( const key of [ 'wood', 'hard', 'roofMetal', 'thatch', 'stone', 'fabric' ] ) {

		const b = B.batches[ key ];
		if ( ! b || b.vcount === 0 || ! mats[ key ] ) continue;
		const mesh = new Mesh( b.build(), mats[ key ] );
		mesh.name = 'tidemark_' + key;
		mesh.receiveShadow = true;
		mesh.castShadow = key !== 'fabric';
		mesh.onBeforeRender = bake;
		out.push( mesh );

	}

	if ( nets.vcount > 0 && mats.net ) {

		const mesh = new Mesh( nets.build(), mats.net );
		mesh.name = 'tidemark_nets';
		mesh.onBeforeRender = bake;
		out.push( mesh );

	}

	return out;

}

// ---- GeoKit shells (frame: local +z is the front, toward the bay; F.m( lx, ly, lz, ... ) a matrix in it)

function walls( add, F, w, d, h, mat, { front = true, door = null } = {} ) {

	const t = 0.18;
	add( box( w, h, t ), { ...mat, matrix: F.m( 0, h / 2, - d / 2 ) } );
	for ( const s of [ - 1, 1 ] ) add( box( t, h, d ), { ...mat, matrix: F.m( s * w / 2, h / 2, 0 ) } );
	if ( ! front ) return;
	if ( ! door ) {

		add( box( w, h, t ), { ...mat, matrix: F.m( 0, h / 2, d / 2 ) } );
		return;

	}

	// a front wall round a doorway door = [ width, height ]
	const [ dw, dh ] = door, side = ( w - dw ) / 2;
	for ( const s of [ - 1, 1 ] ) add( box( side, h, t ), { ...mat, matrix: F.m( s * ( dw / 2 + side / 2 ), h / 2, d / 2 ) } );
	add( box( dw, h - dh, t ), { ...mat, matrix: F.m( 0, dh + ( h - dh ) / 2, d / 2 ) } );

}

function gableRoof( add, F, w, d, y, rise, opts ) {

	const half = d / 2 + 0.4, slope = Math.atan2( rise, half ), rl = Math.hypot( half, rise );
	for ( const s of [ - 1, 1 ] ) add( box( w + 0.5, 0.12, rl ), { ...opts, matrix: F.m( 0, y + rise / 2, s * half / 2, s * slope, 0, 0 ) } );
	add( box( w + 0.52, 0.14, 0.16 ), { ...opts, matrix: F.m( 0, y + rise + 0.05, 0 ) } );
	// stepped gable infill
	for ( const s of [ - 1, 1 ] ) for ( let k = 0; k < 3; k ++ ) {

		const f = 1 - ( k + 0.5 ) / 3;
		add( box( 0.1, rise / 3, d * f ), { ...WOODX( 0x7a6e5a ), matrix: F.m( s * w / 2, y + rise * ( k + 0.5 ) / 3, 0 ) } );

	}

}

function warehouse( add, F, b, colliders ) {

	const { w, d } = b, h = 5.4;
	add( box( w + 0.4, 0.5, d + 0.4 ), { ...STONE( 0x6f6a61 ), matrix: F.m( 0, 0.05, 0 ) } );
	walls( add, F, w, d, h, WOODX( 0x8c6d4f ), { door: [ 4.2, 3.8 ] } );
	add( box( 4.0, 3.6, 0.08 ), { ...WOOD( 0x4a5a50 ), matrix: F.m( 0, 1.8, d / 2 - 0.2 ) } );
	gableRoof( add, F, w, d, h, 2.6, { color: 0x5a5f63, rough: 0.6, metal: 0.5, pattern: PAT.rusty } );
	// the hoist beam over the loft door and its block
	add( box( 1.1, 1.3, 0.1 ), { ...WOOD( 0x3d4b55 ), matrix: F.m( 0, 4.6, d / 2 + 0.05 ) } );
	add( box( 0.2, 0.2, 1.8 ), { ...WOOD( 0x4a3c30 ), matrix: F.m( 0, 5.9, d / 2 + 0.8 ) } );
	add( cylinder( 0.012, 0.012, 2.4, 4 ), { color: 0xc9b48a, rough: 0.9, matrix: F.m( 0, 4.7, d / 2 + 1.5 ) } );
	// painted name board
	add( box( 5.2, 0.6, 0.05 ), { ...PAINT( 0xe9e6dd ), matrix: F.m( 0, 4.15 + 0.05, d / 2 + 0.1 ) } );
	add( box( 4.6, 0.18, 0.02 ), { ...PAINT( 0x2b3a44 ), matrix: F.m( 0, 4.2, d / 2 + 0.13 ) } );
	if ( colliders ) colliders.addBox( new Vector3( F.x, F.y + h / 2, F.z ), new Vector3( w / 2 + 0.1, h / 2, d / 2 + 0.1 ), F.yaw, { tag: 'tidemarkWarehouse' } );
	return F.y + h + 2.6;

}

function chapel( add, F, b, colliders ) {

	const { w, d } = b, h = 4.6;
	add( box( w + 0.4, 0.5, d + 0.4 ), { ...STONE( 0x8a8378 ), matrix: F.m( 0, 0.05, 0 ) } );
	walls( add, F, w, d, h, PAINT( 0xf0ece0, { rough: 0.85 } ), { door: [ 1.6, 2.6 ] } );
	add( box( 1.5, 2.5, 0.08 ), { ...WOOD( 0x5a3a2a ), matrix: F.m( 0, 1.3, d / 2 + 0.02 ) } );
	// tall windows down the sides
	for ( const s of [ - 1, 1 ] ) for ( let k = 0; k < 3; k ++ ) add( box( 0.06, 1.8, 0.7 ), { color: 0x24343a, rough: 0.15, matrix: F.m( s * ( w / 2 + 0.06 ), 2.4, - d / 2 + 2.5 + k * 3.5 ) } );
	gableRoof( add, F, w, d, h, 3.0, { color: 0x7d2f25, rough: 0.8 } );
	// the belfry over the door: a square tower, open arches, a pyramid cap, the bell
	const tz = d / 2 - 1.3, th = 9.5;
	add( box( 2.6, th, 2.6 ), { ...PAINT( 0xf0ece0, { rough: 0.85 } ), matrix: F.m( 0, th / 2, tz ) } );
	for ( const [ sx, sz ] of [ [ - 1, - 1 ], [ 1, - 1 ], [ - 1, 1 ], [ 1, 1 ] ] ) add( box( 0.45, 2.2, 0.45 ), { ...PAINT( 0xe6e1d4 ), matrix: F.m( sx * 1.1, th + 1.1, tz + sz * 1.1 ) } );
	add( box( 2.9, 0.25, 2.9 ), { ...STONE( 0x8a8378 ), matrix: F.m( 0, th + 2.3, tz ) } );
	add( cylinder( 0.05, 2.1, 2.6, 4 ), { color: 0x7d2f25, rough: 0.8, matrix: F.m( 0, th + 3.7, tz, 0, Math.PI / 4, 0 ) } );
	add( cylinder( 0.25, 0.45, 0.6, 12 ), { color: 0xb08a3a, rough: 0.35, metal: 1, matrix: F.m( 0, th + 1.2, tz ) } );
	add( box( 0.08, 1.0, 0.08 ), { color: 0x2b2e31, rough: 0.5, metal: 0.7, matrix: F.m( 0, th + 5.4, tz ) } );
	add( box( 0.6, 0.08, 0.08 ), { color: 0x2b2e31, rough: 0.5, metal: 0.7, matrix: F.m( 0, th + 5.6, tz ) } );
	if ( colliders ) {

		colliders.addBox( new Vector3( F.x, F.y + h / 2, F.z ), new Vector3( w / 2 + 0.1, h / 2, d / 2 + 0.1 ), F.yaw, { tag: 'tidemarkChapel' } );
		const [ bx, bz ] = F.world( 0, tz );
		colliders.addBox( new Vector3( bx, F.y + th / 2, bz ), new Vector3( 1.3, th / 2, 1.3 ), F.yaw, { tag: 'tidemarkBelfry' } );

	}

	return F.y + th + 5.9;

}

// the boatyard: an open-fronted shed (its doors are breakable props) over a cradle with a half-built hull, rails down the slip
function boatyard( add, F, b, colliders ) {

	const { w, d } = b, h = 4.8;
	walls( add, F, w, d, h, WOODX( 0x6e6455 ), { front: false } );
	add( box( w, 1.2, 0.18 ), { ...WOODX( 0x6e6455 ), matrix: F.m( 0, h - 0.6, d / 2 ) } ); // the lintel over the doorway
	gableRoof( add, F, w, d, h, 2.4, { color: 0x6b6f72, rough: 0.6, metal: 0.4, pattern: PAT.rusty } );
	// the cradle, the hull in frame (ribs over a keel), planks and sawhorses
	add( box( 0.3, 0.5, 9 ), { ...WOOD( 0x4a3c30 ), matrix: F.m( 0, 0.25, 0 ) } );
	add( box( 0.22, 0.3, 9.4 ), { ...WOOD( 0x6a523a ), matrix: F.m( 0, 0.7, 0 ) } );
	for ( let k = 0; k < 9; k ++ ) {

		const z = - 4 + k, r = 1.25 * Math.sin( Math.PI * ( k + 0.5 ) / 9 ) + 0.25;
		for ( const s of [ - 1, 1 ] ) add( box( 0.1, 1.5, 0.12 ), { ...WOOD( 0x7a5e40 ), matrix: F.m( s * r * 0.75, 1.45, z, 0, 0, s * 0.45 ) } );

	}

	for ( let k = 0; k < 3; k ++ ) add( box( 0.06, 0.25, 6 ), { ...WOOD( 0x8a6a46 ), matrix: F.m( - 1.05 + 0.02 * k, 1.0 + k * 0.26, 0.3, 0, 0, - 0.5 ) } );
	for ( const z of [ - 2.5, 2.5 ] ) add( box( 1.2, 0.08, 0.2 ), { ...WOOD( 0x7a6b58 ), matrix: F.m( 3.6, 0.8, z ) } );
	// the slipway rails from the doorway down into the bay
	for ( const s of [ - 1, 1 ] ) add( box( 0.2, 0.18, 16 ), { ...WOOD( 0x3f372e ), matrix: F.m( s * 1.1, - 0.55, d / 2 + 7.2, 0.085, 0, 0 ) } );
	if ( colliders ) {

		const t = 0.25;
		const back = F.world( 0, - d / 2 );
		colliders.addBox( new Vector3( back[ 0 ], F.y + h / 2, back[ 1 ] ), new Vector3( w / 2, h / 2, t ), F.yaw, { tag: 'tidemarkBoatyard' } );
		for ( const s of [ - 1, 1 ] ) {

			const p = F.world( s * w / 2, 0 );
			colliders.addBox( new Vector3( p[ 0 ], F.y + h / 2, p[ 1 ] ), new Vector3( t, h / 2, d / 2 ), F.yaw, { tag: 'tidemarkBoatyard' } );

		}

	}

	return F.y + h + 2.4;

}

// the hangar on the airstrip's apron: corrugated walls on three sides, a vaulted roof, the doorway (15 x 5.5 m) facing the
// runway; colliders on its walls only (a plane rolls in through the front)
function hangar( add, F, b, colliders ) {

	const { w, d } = b, h = 6;
	const tin = { color: 0x8a9096, rough: 0.55, metal: 0.6, pattern: PAT.rusty };
	add( box( w, 0.12, d ), { ...STONE( 0x777168 ), matrix: F.m( 0, 0.03, 0 ) } );
	walls( add, F, w, d, h, tin, { door: [ 15, 5.5 ] } );
	// a vault of seven panels from wall to wall
	const n = 7;
	for ( let k = 0; k < n; k ++ ) {

		const a0 = Math.PI * k / n, a1 = Math.PI * ( k + 1 ) / n, am = ( a0 + a1 ) / 2;
		const R = w / 2, rise = 2.8;
		const x = - Math.cos( am ) * R, y = h + Math.sin( am ) * rise;
		const len = Math.hypot( R * ( Math.cos( a0 ) - Math.cos( a1 ) ), rise * ( Math.sin( a1 ) - Math.sin( a0 ) ) ) + 0.06;
		const tilt = Math.atan2( rise * ( Math.sin( a1 ) - Math.sin( a0 ) ), R * ( Math.cos( a0 ) - Math.cos( a1 ) ) );
		add( box( len, 0.1, d + 0.4 ), { ...tin, matrix: F.m( x, y, 0, 0, 0, tilt ) } );

	}

	for ( const s of [ - 1, 1 ] ) for ( let k = 0; k < 3; k ++ ) add( box( w * ( 0.75 - k * 0.25 ), 0.9, 0.12 ), { ...tin, matrix: F.m( 0, h + 0.45 + k * 0.9, s * d / 2 ) } );
	// the name board over the doors, a workbench and a fuel pump inside
	add( box( 7.5, 0.9, 0.06 ), { ...PAINT( 0xe9e6dd ), matrix: F.m( 0, 6.6, d / 2 + 0.12 ) } );
	add( box( 6.6, 0.34, 0.03 ), { ...PAINT( 0x2f5f8a ), matrix: F.m( 0, 6.6, d / 2 + 0.16 ) } );
	add( box( 3.2, 0.9, 0.8 ), { ...WOOD( 0x6e5e47 ), matrix: F.m( - w / 2 + 2.2, 0.45, - d / 2 + 0.7 ) } );
	add( box( 0.6, 1.5, 0.5 ), { ...PAINT( 0xb23a2e ), matrix: F.m( w / 2 - 1.2, 0.75, - d / 2 + 0.6 ) } );
	if ( colliders ) {

		const t = 0.2;
		const back = F.world( 0, - d / 2 );
		colliders.addBox( new Vector3( back[ 0 ], F.y + h / 2, back[ 1 ] ), new Vector3( w / 2, h / 2, t ), F.yaw, { tag: 'tidemarkHangar' } );
		for ( const s of [ - 1, 1 ] ) {

			const p = F.world( s * w / 2, 0 );
			colliders.addBox( new Vector3( p[ 0 ], F.y + h / 2, p[ 1 ] ), new Vector3( t, h / 2, d / 2 ), F.yaw, { tag: 'tidemarkHangar' } );
			const q = F.world( s * ( 7.5 + 0.75 ), d / 2 );
			colliders.addBox( new Vector3( q[ 0 ], F.y + h / 2, q[ 1 ] ), new Vector3( 0.75, h / 2, t ), F.yaw, { tag: 'tidemarkHangar' } );

		}

	}

	return F.y + h + 2.8;

}

// the lookout on the hilltop: a tapering stone tower, a lantern room on top (a landmark from the sea)
function lookout( add, F, colliders ) {

	const H = 12;
	add( box( 5.2, 1.0, 5.2 ), { ...STONE( 0x6f6a61 ), matrix: F.m( 0, 0.2, 0 ) } );
	for ( let k = 0; k < 4; k ++ ) {

		const w = 4.4 - k * 0.35, h = H / 4;
		add( box( w, h + 0.02, w ), { ...STONE( [ 0xb3aa98, 0xa69d8b, 0xb8af9c, 0xaaa190 ][ k ] ), matrix: F.m( 0, 0.7 + h * ( k + 0.5 ), 0 ) } );

	}

	const top = 0.7 + H;
	add( box( 4.2, 0.3, 4.2 ), { ...STONE( 0x7b746a ), matrix: F.m( 0, top + 0.15, 0 ) } );
	for ( const [ sx, sz ] of [ [ - 1, - 1 ], [ 1, - 1 ], [ - 1, 1 ], [ 1, 1 ] ] ) add( box( 0.4, 1.8, 0.4 ), { ...STONE( 0x8a8378 ), matrix: F.m( sx * 1.7, top + 1.2, sz * 1.7 ) } );
	add( box( 3.8, 0.3, 3.8 ), { ...STONE( 0x7b746a ), matrix: F.m( 0, top + 2.25, 0 ) } );
	add( cylinder( 0.1, 2.6, 1.6, 4 ), { color: 0x2f5f8a, rough: 0.7, matrix: F.m( 0, top + 3.2, 0, 0, Math.PI / 4, 0 ) } );
	add( box( 1.0, 2.0, 0.1 ), { ...WOOD( 0x3d4b55 ), matrix: F.m( 0, 1.7, 2.25 ) } );
	if ( colliders ) colliders.addBox( new Vector3( F.x, F.y + top / 2, F.z ), new Vector3( 2.6, top / 2, 2.6 ), F.yaw, { tag: 'tidemarkLookout' } );
	return { y: F.y, top: F.y + top + 4, lamp: new Vector3( F.x, F.y + top + 1.2, F.z ) };

}

// the lookout's lantern glass (an emissive mesh of its own: its glow follows the night)
export function lookoutGlass( add, x, y, z ) {

	add( box( 2.2, 1.4, 2.2 ), { color: 0xffe6b0, rough: 0.3, matrix: mat4( x, y, z ) } );
	add( sphere( 0.5, 8, 6 ), { color: 0xfff2d0, rough: 0.2, matrix: mat4( x, y, z ) } );

}
