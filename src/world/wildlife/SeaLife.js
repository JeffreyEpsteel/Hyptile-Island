import { InstancedMesh, Matrix4, Quaternion, Vector3, Euler } from '../../engine/index.js';
import { prepare, mergePrepared, lathe, box, sphere, mat4 } from '../boat/GeoKit.js';
import { createPropMaterial, PAT } from '../../game/GameMaterials.js';
import { mulberry32 } from '../../util/Noise.js';

// Wave 24E: life in the water round the viewer. Fish jump now and then in the bays (a silver flash, an arc and a small
// splash), more round the skiffs at work; once in a while a pod of dolphins crosses, porpoising (each leap out and back
// in with a splash). Two instanced draws; the simulation runs only near the viewer and only over water deep enough
// (terrain below -1.5 m for the fish, -5 m for the dolphins), so it costs nothing inland.
//
//   const s = new SeaLife( { scene, terrain, rand, splash: ( x, y, z, strength ) => ... } );
//   s.update( dt, viewer { x, z } | null, { hour, extra: [ { x, z } ] (skiffs out fishing: fish jump round them) } )
//   s.fish / s.pods (plain state, the tests read it); s.spawnPod( x, z, heading ) (events, tests)

const SEA_FISH = - 1.5, SEA_POD = - 5;
const FISH_AIR = 0.55; // s in the air
const POD_LEAP = 0.9, POD_CYCLE = 3.4; // a dolphin's leap and the time between its leaps

function dolphinGeometry() {

	const P = [];
	const add = ( g, o ) => P.push( prepare( g, { rough: 0.35, ...o } ) );
	// the body along +z: a lathe turned on its side (the profile: tail stock to the beak)
	const body = lathe( [ [ 0.0, - 1.15 ], [ 0.08, - 1.05 ], [ 0.17, - 0.6 ], [ 0.26, - 0.05 ], [ 0.25, 0.35 ], [ 0.18, 0.7 ], [ 0.07, 0.92 ], [ 0.05, 1.08 ], [ 0.0, 1.12 ] ], 12 );
	add( body, { color: 0x6c7580, matrix: mat4( 0, 0, 0, Math.PI / 2, 0, 0 ) } );
	add( sphere( 0.2, 10, 6 ), { color: 0xc8ccd0, matrix: mat4( 0, - 0.08, 0.05, 0, 0, 0, 1.05, 0.7, 2.4 ) } ); // the pale belly
	add( box( 0.03, 0.32, 0.3 ), { color: 0x5c6570, matrix: mat4( 0, 0.3, - 0.1, - 0.5, 0, 0 ) } ); // the dorsal fin
	add( box( 0.62, 0.025, 0.2 ), { color: 0x5c6570, matrix: mat4( 0, 0, - 1.1 ) } ); // the flukes
	for ( const s of [ - 1, 1 ] ) add( box( 0.28, 0.02, 0.12 ), { color: 0x5c6570, matrix: mat4( s * 0.26, - 0.12, 0.35, 0, s * 0.5, s * 0.4 ) } );
	for ( const s of [ - 1, 1 ] ) add( sphere( 0.022, 5, 4 ), { color: 0x101010, matrix: mat4( s * 0.12, 0.04, 0.78 ) } );
	return mergePrepared( P );

}

function fishGeometry() {

	return mergePrepared( [
		prepare( lathe( [ [ 0.0, - 0.2 ], [ 0.045, - 0.1 ], [ 0.06, 0.02 ], [ 0.045, 0.14 ], [ 0.0, 0.2 ] ], 8 ), { color: 0xb8c4cc, rough: 0.2, metal: 0.5, matrix: mat4( 0, 0, 0, Math.PI / 2, 0, 0, 1, 1, 0.55 ) } ),
		prepare( box( 0.01, 0.12, 0.09 ), { color: 0x8a96a0, rough: 0.3, matrix: mat4( 0, 0, - 0.22 ) } ),
	] );

}

const _m = new Matrix4(), _q = new Quaternion(), _p = new Vector3(), _s = new Vector3(), _e = new Euler();

export class SeaLife {

	constructor( { scene = null, terrain = null, rand = null, splash = null, render = true } = {} ) {

		this.scene = scene;
		this.terrain = terrain;
		this.rand = rand || mulberry32( 2424 );
		this.splash = splash;
		this.fish = []; // { x, z, heading, t, h, len }
		this.pods = []; // { x, z, heading, speed, t, life, members: [ { ox, oz, ph, splashed } ] }
		this.fishT = 2;
		this.podT = 40;
		this.time = 0;
		this.render = render && !! scene;
		if ( this.render ) {

			const mat = this.material = createPropMaterial( 'seaLife' );
			this.dolphins = new InstancedMesh( dolphinGeometry(), mat, 10 );
			this.jumpers = new InstancedMesh( fishGeometry(), mat, 8 );
			for ( const m of [ this.dolphins, this.jumpers ] ) { m.frustumCulled = false; m.castShadow = false; m.count = 0; m.visible = false; scene.add( m ); }
			this.dolphins.name = 'seaLife-dolphins';
			this.jumpers.name = 'seaLife-fish';

		}

	}

	_depth( x, z ) {

		const T = this.terrain;
		return T && T.heightAt ? T.heightAt( x, z ) : - 20;

	}

	// a pod of three to five crossing past (x, z) on a heading
	spawnPod( x, z, heading, n = 0 ) {

		const R = this.rand;
		n = n || 3 + Math.floor( R() * 3 );
		const members = [];
		for ( let i = 0; i < n; i ++ ) members.push( { ox: ( R() - 0.5 ) * 6, oz: - i * 2.2 + ( R() - 0.5 ) * 2, ph: R() * POD_CYCLE, splashed: 0 } );
		const pod = { x, z, heading, speed: 4.5 + R() * 2, t: 0, life: 45 + R() * 25, members };
		this.pods.push( pod );
		return pod;

	}

	update( dt, viewer = null, { hour = 12, extra = null } = {} ) {

		dt = Math.min( Math.max( dt || 0, 0 ), 0.1 );
		this.time += dt;
		const R = this.rand;
		if ( viewer ) {

			// a fish jumps somewhere round the viewer (more by day, round the skiffs at work too)
			this.fishT -= dt;
			const day = hour > 5.5 && hour < 20;
			if ( this.fishT <= 0 && this.fish.length < 6 ) {

				this.fishT = ( day ? 1.6 : 5 ) + R() * ( day ? 4 : 9 );
				const at = extra && extra.length && R() < 0.5 ? extra[ Math.floor( R() * extra.length ) ] : viewer;
				const a = R() * Math.PI * 2, r = at === viewer ? 14 + R() * 60 : 2 + R() * 10;
				const x = at.x + Math.cos( a ) * r, z = at.z + Math.sin( a ) * r;
				if ( this._depth( x, z ) < SEA_FISH ) this.fish.push( { x, z, heading: R() * Math.PI * 2, t: 0, h: 0.35 + R() * 0.55, len: 0.8 + R() * 0.5, out: false } );

			}

			// now and then a pod crosses in deep water within sight
			this.podT -= dt;
			if ( this.podT <= 0 ) {

				this.podT = 70 + R() * 150;
				if ( ! this.pods.length && R() < 0.65 ) {

					const a = R() * Math.PI * 2, r = 70 + R() * 90;
					const x = viewer.x + Math.cos( a ) * r, z = viewer.z + Math.sin( a ) * r;
					// across the view: a heading at right angles to the line from the viewer (one way or the other)
					const heading = Math.atan2( Math.cos( a ), - Math.sin( a ) ) + ( R() < 0.5 ? 0 : Math.PI );
					const sx = x - Math.sin( heading ) * 60, sz = z - Math.cos( heading ) * 60;
					if ( this._depth( x, z ) < SEA_POD && this._depth( sx, sz ) < SEA_POD ) this.spawnPod( sx, sz, heading );

				}

			}

		}

		// fish: an arc out and back in, a splash at each end
		for ( let i = this.fish.length - 1; i >= 0; i -- ) {

			const f = this.fish[ i ];
			f.t += dt;
			if ( ! f.out ) { f.out = true; if ( this.splash ) this.splash( f.x, 0, f.z, 0.12 ); }
			if ( f.t >= FISH_AIR ) { if ( this.splash ) this.splash( f.x + Math.sin( f.heading ) * f.len, 0, f.z + Math.cos( f.heading ) * f.len, 0.1 ); this.fish.splice( i, 1 ); }

		}

		// pods: on along their heading, each dolphin leaping in its own rhythm; gone once their time is up or the water shoals
		for ( let i = this.pods.length - 1; i >= 0; i -- ) {

			const p = this.pods[ i ];
			p.t += dt;
			p.x += Math.sin( p.heading ) * p.speed * dt;
			p.z += Math.cos( p.heading ) * p.speed * dt;
			const shoal = this._depth( p.x + Math.sin( p.heading ) * 20, p.z + Math.cos( p.heading ) * 20 ) > SEA_POD + 1.5;
			if ( shoal ) p.heading += dt * 0.6; // round away from the shallows
			for ( const m of p.members ) {

				const c = ( p.t + m.ph ) % POD_CYCLE;
				const up = c < POD_LEAP;
				if ( up && m.splashed !== 1 ) { m.splashed = 1; if ( this.splash && p.t < p.life ) this.splash( ...this._memberXZ( p, m, 0 ), 0.3 ); }
				if ( ! up && m.splashed === 1 ) { m.splashed = 2; if ( this.splash && p.t < p.life ) this.splash( ...this._memberXZ( p, m, 0 ), 0.38 ); }

			}

			if ( p.t > p.life + POD_CYCLE ) this.pods.splice( i, 1 );

		}

		if ( this.render ) this._draw();

	}

	// [ x, y (the sea), z ] of a pod's member
	_memberXZ( p, m, y ) {

		const c = Math.cos( p.heading ), s = Math.sin( p.heading );
		return [ p.x + m.ox * c + m.oz * s, y, p.z - m.ox * s + m.oz * c ];

	}

	_draw() {

		let n = 0;
		for ( const p of this.pods ) for ( const m of p.members ) {

			if ( n >= 10 ) break;
			const c = ( p.t + m.ph ) % POD_CYCLE;
			// out of the water only in the leap (an arc, nose up then down); just under the surface between leaps
			if ( c >= POD_LEAP || p.t > p.life ) continue;
			const k = c / POD_LEAP;
			const y = Math.sin( k * Math.PI ) * 1.3 - 0.25;
			const pitch = Math.cos( k * Math.PI ) * 0.75;
			const [ x, , z ] = this._memberXZ( p, m, 0 );
			const ahead = ( k - 0.5 ) * p.speed * POD_LEAP;
			_e.set( - pitch, p.heading, 0, 'YXZ' );
			_q.setFromEuler( _e );
			_m.compose( _p.set( x + Math.sin( p.heading ) * ahead, y, z + Math.cos( p.heading ) * ahead ), _q, _s.set( 1, 1, 1 ) );
			this.dolphins.setMatrixAt( n ++, _m );

		}

		this.dolphins.count = n;
		this.dolphins.visible = n > 0;
		this.dolphins.instanceMatrix.needsUpdate = true;
		let f = 0;
		for ( const q of this.fish ) {

			if ( f >= 8 ) break;
			const k = q.t / FISH_AIR;
			const y = Math.sin( k * Math.PI ) * q.h;
			const pitch = Math.cos( k * Math.PI ) * 0.9;
			_e.set( - pitch, q.heading, Math.sin( this.time * 30 + q.x ) * 0.3, 'YXZ' );
			_q.setFromEuler( _e );
			_m.compose( _p.set( q.x + Math.sin( q.heading ) * q.len * k, y, q.z + Math.cos( q.heading ) * q.len * k ), _q, _s.set( 1, 1, 1 ) );
			this.jumpers.setMatrixAt( f ++, _m );

		}

		this.jumpers.count = f;
		this.jumpers.visible = f > 0;
		this.jumpers.instanceMatrix.needsUpdate = true;

	}

	dispose() {

		if ( ! this.render ) return;
		for ( const m of [ this.dolphins, this.jumpers ] ) { this.scene.remove( m ); m.dispose(); }

	}

}
