// Gulls that notice the fishing (docs/UNREAL_PARITY.md F8): a small flock of its own near the player (the bay's
// soaring gulls in src/world/Gulls.js are animated wholly on the GPU and cannot react, so they are left alone) that
//   cast     a few birds come over and circle low above the bobber, hoping for bait
//   strike   the hook-set splash scatters the birds near the bobber, wings beating, then they drift back
//   miss     the fish took the bait and ran: the followers give up and climb back to their thermal
//   catch    one bird swoops past the landed fish for scraps, the rest follow a while
//   stow     the line comes in: everyone back to soaring
// The cues come from the game's own state (rod state, Game.fight, Game.bite edges, as features/sfx does) and the
// events 'strikeMissed' and 'fishCaught'. They roost at night (hidden) and only fly near the player.
//
//   const flock = new GullFlock( { count, rng } );  flock.anchor( x, z );  flock.cue( kind, { x, y, z } );  flock.step( dt )
//   const cues = new GullCues( app, features );  cues.update( dt )  cues.flock  cues.mesh  cues.dispose()
//
// Drawing: one instanced draw; per bird two vec4s (position + yaw, pitch / bank / flap gate / seed): the wings beat in
// the vertex shader, everything else is steered on the CPU (8 birds: nothing to speak of).

import { Mesh } from '../../engine/scene/Mesh.js';
import { BufferGeometry, Float32BufferAttribute, InstancedBufferAttribute } from '../../engine/geometry/index.js';
import { Material } from '../../engine/render/Material.js';

const clamp = ( v, a, b ) => ( v < a ? a : v > b ? b : v );
const TAU = Math.PI * 2;

export const STATES = [ 'idle', 'follow', 'scatter', 'swoop', 'leave' ];

export class GullFlock {

	constructor( { count = 8, rng = Math.random } = {} ) {

		this.rng = rng;
		this.cx = 0; this.cz = 0; // the thermal over the player
		this.focus = null; // { x, y, z } the bobber or the catch
		this.birds = [];
		for ( let i = 0; i < count; i ++ ) {

			const r = 18 + rng() * 18, th = rng() * TAU, h = 18 + rng() * 14;
			this.birds.push( {
				x: Math.cos( th ) * r, y: h, z: Math.sin( th ) * r, vx: 0, vy: 0, vz: 0,
				state: 'idle', t: 0, th, r, h, dir: rng() < 0.5 ? - 1 : 1, speed: 9 + rng() * 3,
				ox: ( rng() - 0.5 ) * 40, oz: ( rng() - 0.5 ) * 40, flap: 0, bank: 0, seed: rng(), away: null,
			} );

		}

		this.cues = { cast: 0, strike: 0, miss: 0, catch: 0, stow: 0 };

	}

	anchor( x, z ) {

		this.cx = x; this.cz = z;
		// a bird left far behind (the player sailed off) rejoins out of sight, high over the new spot
		for ( const b of this.birds ) {

			if ( Math.hypot( b.x - x, b.z - z ) < 320 ) continue;
			b.x = x + ( this.rng() - 0.5 ) * 160; b.z = z + ( this.rng() - 0.5 ) * 160; b.y = 40 + this.rng() * 15;
			b.vx = b.vy = b.vz = 0;
			b.state = 'idle';

		}

	}

	_set( b, state, t = 0 ) {

		b.state = state;
		b.t = t;

	}

	nearest( p, n ) {

		return [ ...this.birds ].sort( ( a, c ) => Math.hypot( a.x - p.x, a.z - p.z ) - Math.hypot( c.x - p.x, c.z - p.z ) ).slice( 0, n );

	}

	// kind: 'cast' | 'strike' | 'miss' | 'catch' | 'stow'; at: where it happened
	cue( kind, at = null ) {

		if ( ! ( kind in this.cues ) ) return;
		this.cues[ kind ] ++;
		const R = this.rng;
		if ( kind === 'cast' && at ) {

			this.focus = { x: at.x, y: at.y || 0, z: at.z };
			const want = 2 + Math.floor( R() * 2 );
			let n = this.birds.filter( ( b ) => b.state === 'follow' ).length;
			for ( const b of this.nearest( at, this.birds.length ) ) {

				if ( n >= want ) break;
				if ( b.state === 'follow' ) continue;
				this._set( b, 'follow', 0 );
				b.r = 5 + R() * 4; b.h = 6 + R() * 4;
				n ++;

			}

		} else if ( kind === 'strike' && at ) {

			// the splash: every bird within 35 m bursts away from it
			for ( const b of this.birds ) {

				const d = Math.hypot( b.x - at.x, b.z - at.z );
				if ( d > 35 && b.state !== 'follow' ) continue;
				const ax = ( b.x - at.x ) / ( d || 1 ), az = ( b.z - at.z ) / ( d || 1 );
				b.away = { x: at.x + ( d ? ax : Math.cos( b.th ) ) * 45, y: ( at.y || 0 ) + 22 + R() * 10, z: at.z + ( d ? az : Math.sin( b.th ) ) * 45 };
				this._set( b, 'scatter', 3.5 + R() * 2 );

			}

		} else if ( kind === 'miss' ) {

			for ( const b of this.birds ) if ( b.state === 'follow' || b.state === 'swoop' ) this._set( b, 'leave', 2 + R() );
			this.focus = null;

		} else if ( kind === 'catch' && at ) {

			this.focus = { x: at.x, y: at.y || 0, z: at.z };
			const [ first ] = this.nearest( at, 1 );
			if ( first ) {

				first.away = { x: at.x, y: ( at.y || 0 ) + 2.5, z: at.z };
				this._set( first, 'swoop', 4 );

			}

			for ( const b of this.birds ) if ( b !== first && b.state === 'idle' && Math.hypot( b.x - at.x, b.z - at.z ) < 60 ) { this._set( b, 'follow', 0 ); b.r = 6 + R() * 5; b.h = 7 + R() * 4; b.t = - 10; }

		} else if ( kind === 'stow' ) {

			// (a catch's followers keep circling the landed fish for their while)
			let keep = false;
			for ( const b of this.birds ) {

				if ( b.state === 'follow' && b.t >= 0 ) this._set( b, 'leave', 1.5 );
				else if ( b.state === 'follow' || b.state === 'swoop' ) keep = true;

			}

			if ( ! keep ) this.focus = null;

		}

	}

	step( dt ) {

		dt = clamp( dt, 0, 0.1 );
		if ( dt <= 0 ) return;
		const R = this.rng;
		for ( const b of this.birds ) {

			let tx, ty, tz, speed = b.speed, flap = 0;
			if ( b.state === 'follow' && this.focus ) {

				// circle the bobber low; a catch's followers wander off after a while (t counts up from -10)
				b.th += b.dir * dt * speed / b.r;
				tx = this.focus.x + Math.cos( b.th + 0.4 * b.dir ) * b.r; tz = this.focus.z + Math.sin( b.th + 0.4 * b.dir ) * b.r;
				ty = this.focus.y + b.h;
				speed *= 0.85;
				if ( b.t < 0 ) { b.t += dt; if ( b.t >= 0 ) this._set( b, 'leave', 1.5 ); }

			} else if ( b.state === 'scatter' || b.state === 'swoop' ) {

				const a = b.away || { x: b.x, y: b.y + 10, z: b.z };
				tx = a.x; ty = a.y; tz = a.z;
				speed = b.state === 'scatter' ? 15 : 13;
				flap = 1;
				b.t -= dt;
				const there = Math.hypot( b.x - a.x, b.y - a.y, b.z - a.z ) < 3;
				if ( b.state === 'swoop' && there ) { b.away = { x: b.x + b.vx * 2, y: b.y + 18, z: b.z + b.vz * 2 }; this._set( b, 'scatter', 2 ); }
				else if ( b.t <= 0 ) this._set( b, this.focus && b.state === 'scatter' ? 'follow' : 'idle', 0 );

			} else {

				// idle (and leave): soar on the thermal over the player
				if ( b.state === 'leave' ) { flap = 1; b.t -= dt; if ( b.t <= 0 ) this._set( b, 'idle' ); }
				if ( b.r < 15 ) { b.r = 18 + R() * 18; b.h = 18 + R() * 14; }
				b.th += b.dir * dt * speed / b.r;
				tx = this.cx + b.ox + Math.cos( b.th + 0.35 * b.dir ) * b.r; tz = this.cz + b.oz + Math.sin( b.th + 0.35 * b.dir ) * b.r;
				ty = b.h + Math.sin( b.th * 2 + b.seed * 9 ) * 3;

			}

			// steer: the velocity eases toward the target at the state's speed
			let dx = tx - b.x, dy = ty - b.y, dz = tz - b.z;
			const d = Math.hypot( dx, dy, dz ) || 1;
			const k = Math.min( speed, d * 2 ) / d;
			dx *= k; dy *= k; dz *= k;
			const e = 1 - Math.exp( - dt * ( flap ? 3 : 1.6 ) );
			const pvx = b.vx, pvz = b.vz;
			b.vx += ( dx - b.vx ) * e; b.vy += ( dy - b.vy ) * e; b.vz += ( dz - b.vz ) * e;
			b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
			b.y = Math.max( b.y, 1.2 ); // never into the sea
			// bank into the turn (lateral acceleration), flap when climbing hard or told to
			const sp = Math.hypot( b.vx, b.vz ) || 1;
			const lat = ( ( b.vx - pvx ) * - b.vz + ( b.vz - pvz ) * b.vx ) / ( sp * dt );
			b.bank += ( clamp( lat * 0.08, - 0.8, 0.8 ) - b.bank ) * Math.min( 1, dt * 4 );
			const climb = b.vy > 1.5 ? 1 : 0;
			// gliders beat now and then (a slow gate), like the bay's gulls
			const gate = ( Math.sin( ( b.seed * 50 + b.th * 3 ) ) > 0.7 ) ? 1 : 0;
			b.flap += ( Math.max( flap, climb, gate ) - b.flap ) * Math.min( 1, dt * 5 );

		}

	}

	counts() {

		const c = Object.fromEntries( STATES.map( ( s ) => [ s, 0 ] ) );
		for ( const b of this.birds ) c[ b.state ] ++;
		return c;

	}

}

// ~1.3 m gull: body diamonds and bent wings (gSide -1 / 1 wings, 0 body; gSpan 0 shoulder .. 1 tip), nose +z
function gullGeometry() {

	const pos = [], col = [], side = [], span = [], idx = [];
	const W = [ 0.93, 0.93, 0.91 ], GREY = [ 0.56, 0.59, 0.63 ], TIP = [ 0.06, 0.06, 0.07 ], BILL = [ 0.88, 0.72, 0.2 ];
	const v = ( x, y, z, c, s, sp ) => { pos.push( x, y, z ); col.push( ...c ); side.push( s ); span.push( sp ); return pos.length / 3 - 1; };
	const nose = v( 0, 0.01, 0.27, BILL, 0, 0 ), tail = v( 0, 0, - 0.25, W, 0, 0 );
	const lt = v( - 0.045, 0.03, 0.02, W, 0, 0 ), rt = v( 0.045, 0.03, 0.02, W, 0, 0 );
	const lb = v( - 0.04, - 0.03, 0.02, W, 0, 0 ), rb = v( 0.04, - 0.03, 0.02, W, 0, 0 );
	idx.push( nose, rt, lt, nose, lb, rb, nose, lt, lb, nose, rb, rt, tail, lt, rt, tail, rb, lb, tail, lb, lt, tail, rt, rb );
	for ( const s of [ - 1, 1 ] ) {

		const ls = v( s * 0.04, 0.02, 0.07, GREY, s, 0 ), ts = v( s * 0.04, 0.02, - 0.08, GREY, s, 0 );
		const le = v( s * 0.33, 0.05, 0.05, GREY, s, 0.5 ), te = v( s * 0.33, 0.05, - 0.09, GREY, s, 0.5 );
		const tip = v( s * 0.67, 0, - 0.06, TIP, s, 1 ), tt = v( s * 0.56, 0.01, - 0.1, TIP, s, 0.85 );
		if ( s > 0 ) idx.push( ls, le, ts, ts, le, te, le, tip, te, te, tip, tt );
		else idx.push( ls, ts, le, ts, te, le, le, te, tip, te, tt, tip );

	}

	const g = new BufferGeometry();
	g.setIndex( idx );
	g.setAttribute( 'position', new Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'color', new Float32BufferAttribute( col, 3 ) );
	g.setAttribute( 'gSide', new Float32BufferAttribute( side, 1 ) );
	g.setAttribute( 'gSpan', new Float32BufferAttribute( span, 1 ) );
	g.computeVertexNormals();
	return g;

}

const ABOARD = new Set( [ 'boat', 'deck', 'seat', 'ride' ] );

export class GullCues {

	constructor( app, features, { count = 8, rng = Math.random } = {} ) {

		this.app = app;
		this.features = features;
		this.flock = new GullFlock( { count, rng } );
		this.mesh = null;
		this._rod = null; this._fight = null; this._phase = null; this._lineOut = false;
		this._off = [];
		if ( features && features.on ) {

			this._off.push( features.on( 'strikeMissed', () => this.flock.cue( 'miss' ) ) );
			this._off.push( features.on( 'fishCaught', () => this.flock.cue( 'catch', this._catchSpot() ) ) );

		}

	}

	_build() {

		if ( this.mesh || ! this.app || ! this.app.scene ) return;
		const n = this.flock.birds.length;
		const geo = gullGeometry();
		this.gA = new InstancedBufferAttribute( new Float32Array( n * 4 ), 4 );
		this.gB = new InstancedBufferAttribute( new Float32Array( n * 4 ), 4 );
		geo.setAttribute( 'gA', this.gA );
		geo.setAttribute( 'gB', this.gB );
		geo.instanceCount = n;
		const mat = new Material( {
			name: 'GullCues',
			roughness: 0.75, metalness: 0,
			vertexColors: true,
			side: 'double',
			underwaterLighting: 'none',
			attributes: { gA: 'vec4f', gB: 'vec4f', gSide: 'f32', gSpan: 'f32' },
			vertex: /* wgsl */`
	let A = v.gA; let B = v.gB;
	let side = v.gSide; let span = v.gSpan;
	// wing beat (3 Hz) gated by the flap weight, a slight dihedral when gliding
	let beat = sin( frame.time * 19.5 + B.w * 40.0 );
	let lift = B.z * beat * 0.6 + 0.1 - ( 1.0 - B.z ) * span * span * 0.2;
	var p = v.position;
	let ang = lift * ( span * 0.6 + 0.4 );
	let ax = abs( p.x );
	p = vec3f( select( p.x, p.x * cos( ang ), side != 0.0 ), select( p.y, p.y + ax * sin( ang ), side != 0.0 ), p.z );
	// roll (bank), pitch, then yaw (nose +z)
	let cb = cos( B.y ); let sb = sin( B.y );
	p = vec3f( p.x * cb - p.y * sb, p.x * sb + p.y * cb, p.z );
	let cp = cos( B.x ); let sp = sin( B.x );
	p = vec3f( p.x, p.y * cp - p.z * sp, p.y * sp + p.z * cp );
	let cy = cos( A.w ); let sy = sin( A.w );
	p = vec3f( p.x * cy + p.z * sy, p.y, - p.x * sy + p.z * cy );
	v.useWorld = true;
	v.worldPos = A.xyz + p * 1.15;
	v.worldNormal = normalize( vec3f( 0.0, 1.0, 0.0 ) );
	v.prevWorldPos = v.worldPos;
`,
		} );
		this.mesh = new Mesh( geo, mat );
		this.mesh.name = 'GullCues';
		this.mesh.frustumCulled = false;
		this.mesh.castShadow = false;
		this.mesh.visible = false;
		this.app.scene.add( this.mesh );

	}

	_bobber() {

		const g = this.app && this.app.game, r = g && g.rod;
		return r && r.bobber ? r.bobber : null;

	}

	_catchSpot() {

		const p = this.app && this.app.player;
		const b = this._bobber();
		return p && p.position ? { x: p.position.x, y: p.position.y, z: p.position.z } : b ? { x: b.x, y: b.y, z: b.z } : null;

	}

	// edges of the rod / bite / fight state -> cues (the events cover the rest)
	_watch() {

		const g = this.app && this.app.game;
		if ( ! g ) return;
		const rod = g.rod ? g.rod.state : null;
		const fight = g.fight || null;
		const phase = g.bite ? g.bite.phase : null;
		const b = this._bobber();
		const at = b ? { x: b.x, y: b.y, z: b.z } : null;
		if ( rod === 'floating' && this._rod !== 'floating' && this._rod !== 'fighting' && at ) this.flock.cue( 'cast', at );
		if ( fight && ! this._fight ) this.flock.cue( 'strike', at );
		else if ( ! fight && this._fight && this._fight.state === 'escaped' ) this.flock.cue( 'miss' );
		else if ( ! fight && this._phase === 'take' && phase === 'wait' ) this.flock.cue( 'miss' );
		const lineOut = !! ( g.rod && 'lineInWater' in g.rod ? g.rod.lineInWater : rod && rod !== 'idle' && rod !== 'stowed' && rod !== 'windup' );
		if ( this._lineOut && ! lineOut && ! fight ) this.flock.cue( 'stow' );
		if ( this.flock.focus && at && ( rod === 'floating' || rod === 'fighting' ) ) { this.flock.focus.x = at.x; this.flock.focus.z = at.z; }
		this._rod = rod; this._fight = fight; this._phase = phase; this._lineOut = lineOut;

	}

	get roosting() {

		const s = this.app && this.app.settings;
		const h = s && Number.isFinite( s.timeOfDay ) ? s.timeOfDay : 12;
		return h < 5.5 || h > 20;

	}

	update( dt ) {

		const app = this.app;
		const p = app && app.player;
		if ( ! p || ! p.position ) return;
		this._watch();
		const ax = ABOARD.has( p.mode ) && app.boatCtl && app.boatCtl.position ? app.boatCtl.position : p.position;
		this.flock.anchor( ax.x, ax.z );
		this.flock.step( dt );
		if ( ! this.mesh ) this._build();
		if ( ! this.mesh ) return;
		this.mesh.visible = ! this.roosting && ! ( app.camera && app.camera.position.y < ( app.cameraWaterHeight ?? 0 ) );
		if ( ! this.mesh.visible ) return;
		const A = this.gA.array, B = this.gB.array;
		this.flock.birds.forEach( ( b, i ) => {

			const sp = Math.hypot( b.vx, b.vz );
			A[ i * 4 ] = b.x; A[ i * 4 + 1 ] = b.y; A[ i * 4 + 2 ] = b.z; A[ i * 4 + 3 ] = Math.atan2( b.vx, b.vz );
			B[ i * 4 ] = - clamp( Math.atan2( b.vy, sp || 1 ), - 0.6, 0.6 ); B[ i * 4 + 1 ] = b.bank; B[ i * 4 + 2 ] = b.flap; B[ i * 4 + 3 ] = b.seed;

		} );
		this.gA.needsUpdate = true;
		this.gB.needsUpdate = true;

	}

	dispose() {

		for ( const off of this._off ) try { off(); } catch ( e ) { /* gone */ }
		this._off.length = 0;
		if ( this.mesh && this.mesh.parent ) this.mesh.parent.remove( this.mesh );
		this.mesh = null;

	}

}
