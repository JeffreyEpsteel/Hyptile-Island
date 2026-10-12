// The other players' seaplanes (multiplayer). A flying / taxiing player's state carries
// `plane: { p: [ x, y, z ], q: [ x, y, z, w ], thr }` (Seaplane.decorateState); the server passes unknown state fields
// through. ingest( states ) buffers them per peer with the local receive time; update( dt ) draws each plane
// INTERP behind the newest sample (position lerp, quaternion slerp) and drops planes not heard of for a while.
//
//   const remote = new RemotePlanes( { models } );
//   remote.ingest( list );   // array of states ({ id, plane }), or a Map id -> { plane } / peer records
//   remote.update( dt );     remote.count;   remote.dispose()

import { Quaternion, Vector3 } from '../../engine/index.js';

export const INTERP = 150; // ms
const KEEP = 8;
const STALE = 3000; // ms without a sample: the plane is gone (landed and climbed out, or left)

const _p = new Vector3(), _q = new Quaternion(), _q2 = new Quaternion();
const finite = ( a, n ) => Array.isArray( a ) && a.length >= n && a.slice( 0, n ).every( Number.isFinite );
const now = () => ( typeof performance !== 'undefined' ? performance.now() : Date.now() );

export class RemotePlanes {

	constructor( { models = null, localId = null } = {} ) {

		this.models = models;
		this.localId = localId;
		this.peers = new Map(); // id -> { snaps, visual, last }

	}

	get count() {

		return this.peers.size;

	}

	ingest( states, t = now() ) {

		if ( ! states ) return;
		const items = states instanceof Map ? [ ...states ].map( ( [ id, s ] ) => ( { id, plane: s && ( s.plane || ( s.state && s.state.plane ) ) } ) ) : states;
		for ( const s of items ) {

			if ( ! s || typeof s.id !== 'string' || s.id === this.localId ) continue;
			const pl = s.plane;
			if ( ! pl || ! finite( pl.p, 3 ) || ! finite( pl.q, 4 ) ) continue;
			let r = this.peers.get( s.id );
			if ( ! r ) {

				r = { snaps: [], visual: this.models ? this.models.create() : null, last: t };
				this.peers.set( s.id, r );

			}

			r.last = t;
			r.snaps.push( { t, p: pl.p.slice( 0, 3 ), q: pl.q.slice( 0, 4 ), thr: Number.isFinite( pl.thr ) ? pl.thr : 0 } );
			if ( r.snaps.length > KEEP ) r.snaps.shift();

		}

	}

	// the pose of a peer's plane at time t (ms): { position, quaternion, thr } or null
	sample( id, t = now() ) {

		const r = this.peers.get( id );
		if ( ! r || ! r.snaps.length ) return null;
		const rt = t - INTERP, s = r.snaps;
		let a = s[ 0 ], b = s[ 0 ], k = 0;
		for ( let i = s.length - 1; i > 0; i -- ) {

			if ( s[ i - 1 ].t <= rt ) {

				a = s[ i - 1 ];
				b = s[ i ];
				k = b.t > a.t ? Math.min( 1, Math.max( 0, ( rt - a.t ) / ( b.t - a.t ) ) ) : 1;
				break;

			}

		}

		if ( rt >= s[ s.length - 1 ].t ) a = b = s[ s.length - 1 ];
		_p.set( a.p[ 0 ] + ( b.p[ 0 ] - a.p[ 0 ] ) * k, a.p[ 1 ] + ( b.p[ 1 ] - a.p[ 1 ] ) * k, a.p[ 2 ] + ( b.p[ 2 ] - a.p[ 2 ] ) * k );
		_q.set( a.q[ 0 ], a.q[ 1 ], a.q[ 2 ], a.q[ 3 ] ).normalize();
		if ( a !== b ) _q.slerp( _q2.set( b.q[ 0 ], b.q[ 1 ], b.q[ 2 ], b.q[ 3 ] ).normalize(), k );
		return { position: _p, quaternion: _q, thr: a.thr + ( b.thr - a.thr ) * k };

	}

	update( dt, t = now() ) {

		for ( const [ id, r ] of this.peers ) {

			if ( t - r.last > STALE ) {

				if ( r.visual ) r.visual.dispose();
				this.peers.delete( id );
				continue;

			}

			const s = this.sample( id, t );
			if ( s && r.visual ) {

				r.visual.setPose( s.position, s.quaternion );
				r.visual.spin( dt, Math.max( 0.08, s.thr ) );

			}

		}

	}

	dispose() {

		for ( const r of this.peers.values() ) if ( r.visual ) r.visual.dispose();
		this.peers.clear();

	}

}
