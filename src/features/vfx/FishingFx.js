// Feedback for the rod (wave 25D, gap 4.1): reads app.game each frame and turns its edges into particles. The game owns
// the rod, the bite and the fight; this only watches (it changes no game state, like the sound side in
// src/features/sfx/FishingSfx.js).
//
//   cast            rod 'flick' -> 'flying'      a fan of drops off the line, a glint at the tip
//   landing         'flying' -> 'floating'       the bobber's plop: crown, drops, two rings (stronger for a longer cast)
//                   'flying' -> 'retrieving'     (it hit the sand) a puff of dust
//   a nibble        bite 'nibble' pulse          a ring from the float, a second one on the next pulse
//   the take        bite 'take'                  the float dunked: a plop and a bubble
//   the strike      'floating' -> 'fighting'     a glint at the rod tip, a thrash at the float, drops off the line
//   the fight       fight.surge crosses 0.6      the fish thrashing: a plop that grows with its weight; rings while it runs
//   reeling         crank turning in the water   drops thrown off the wet line along its length; a wake behind the float
//   the catch       'fighting' -> 'landing'      a glint, drips off the fish hanging on the line (the splash is the fishCaught one)
//   a loss          'fighting' -> idle / retrieve  the line snaps taut: a glint and a fan of drops from the tip
//
// pure of the GPU: it calls VfxSystem recipes (FishRecipes.js). `counts` records what started (tests).

const num = ( v, d = 0 ) => ( Number.isFinite( v ) ? v : d );

export class FishingFx {

	constructor( vfx ) {

		this.vfx = vfx;
		this.state = null;
		this.phase = null;
		this.pulse = 0;
		this.wasSurge = false;
		this.t = 0;
		this.lineT = 0;
		this.wakeT = 0;
		this.rippleT = 0;
		this.dripT = 0;
		this.counts = { cast: 0, plop: 0, ground: 0, nibble: 0, take: 0, strike: 0, thrash: 0, line: 0, catch: 0, loss: 0 };

	}

	get sys() {

		return this.vfx.sys;

	}

	update( dt ) {

		const app = this.vfx.app, g = app && app.game, rod = g && g.rod;
		if ( ! rod || ! rod.tip || ! rod.bobber ) return;
		const sys = this.sys, st = rod.state, prev = this.state;
		this.t += dt;
		const tip = rod.tip, b = rod.bobber;
		const wy = Number.isFinite( rod.waterY ) ? rod.waterY : this.vfx.env.seaLevel();

		if ( prev !== st ) this._edge( prev, st, rod, g, wy );
		this.state = st;

		const bite = g.bite || null, fight = g.fight || null;
		if ( st === 'floating' && bite ) this._bite( bite, b, wy );
		else this.phase = null;

		if ( st === 'fighting' && fight ) this._fight( dt, fight, rod, wy );
		else this.wasSurge = false;

		// a wet line shedding drops while it is cranked in, and a wake behind a float skimming home
		if ( ( st === 'fighting' || st === 'retrieving' ) && rod.crankRate > 0.6 ) {

			this.lineT -= dt;
			if ( this.lineT <= 0 ) {

				this.lineT = 0.09 + Math.random() * 0.06;
				const k = 0.25 + Math.random() * 0.7;
				const x = tip.x + ( b.x - tip.x ) * k, z = tip.z + ( b.z - tip.z ) * k;
				const y = tip.y + ( b.y - tip.y ) * k - 0.1;
				const dx = b.x - tip.x, dz = b.z - tip.z, dl = Math.hypot( dx, dz ) || 1;
				// thrown sideways off the line, a little up
				sys.flick( x, y, z, 0.35, - dz / dl * ( Math.random() < 0.5 ? 1 : - 1 ), 0.5, dx / dl * 0.2 );
				this.counts.line ++;

			}

			if ( st === 'retrieving' && b.y < wy + 0.15 ) {

				this.wakeT -= dt;
				if ( this.wakeT <= 0 ) {

					this.wakeT = 0.3;
					sys.ripple( b.x, wy, b.z, 0.5 );

				}

			}

		}

		// the fish hanging on the line drips until it is in the cooler
		if ( st === 'landing' && rod.t < 3 ) {

			this.dripT -= dt;
			if ( this.dripT <= 0 ) {

				this.dripT = 0.07 + Math.random() * 0.05;
				const ground = this.vfx.env.groundAt( b.x, b.z );
				const fl = Math.max( wy, Number.isFinite( ground ) ? ground : - Infinity );
				sys.drips( b.x, b.y - 0.1, b.z, Math.max( 0.4, 1.4 - rod.t * 0.35 ), fl );

			}

		}

	}

	_edge( prev, st, rod, g, wy ) {

		const sys = this.sys, tip = rod.tip, b = rod.bobber, c = this.counts;
		if ( prev === 'flick' && st === 'flying' ) {

			const p = num( rod.power, 0.5 );
			sys.glint( tip.x, tip.y, tip.z, 0.6 );
			sys.flick( tip.x, tip.y - 0.05, tip.z, 0.4 + 0.8 * p, rod.bobberVel.x, rod.bobberVel.y * 0.5, rod.bobberVel.z );
			c.cast ++;

		} else if ( prev === 'flying' && st === 'floating' ) {

			// a longer cast lands harder
			const reach = Math.hypot( b.x - tip.x, b.z - tip.z );
			sys.plop( b.x, wy, b.z, 0.55 + Math.min( 0.9, reach / ( num( rod.castM, 22 ) * 1.1 ) ) );
			c.plop ++;

		} else if ( prev === 'flying' && st === 'retrieving' ) {

			sys.dust( b.x, b.y, b.z, 0.12 );
			c.ground ++;

		} else if ( prev === 'floating' && st === 'fighting' ) {

			// fish on: the rod tip flashes as the line comes tight, the float is dragged under with a thrash
			sys.glint( tip.x, tip.y, tip.z, 1 );
			sys.plop( b.x, wy, b.z, 1.9 );
			sys.flick( b.x, wy + 0.1, b.z, 0.7, tip.x - b.x, 0.8, tip.z - b.z );
			c.strike ++;

		} else if ( prev === 'fighting' && st === 'landing' ) {

			sys.glint( tip.x, tip.y, tip.z, 1.2 );
			c.catch ++;

		} else if ( prev === 'fighting' && ( st === 'idle' || st === 'retrieving' || st === 'stowed' ) ) {

			// the line parted or the hook came free: the tip whips
			sys.glint( tip.x, tip.y, tip.z, 0.8 );
			sys.flick( tip.x, tip.y - 0.1, tip.z, 0.9, b.x - tip.x, 0.4, b.z - tip.z );
			c.loss ++;

		}

		if ( st !== 'floating' ) this.phase = null;

	}

	_bite( bite, b, wy ) {

		const sys = this.sys, ph = bite.phase, c = this.counts;
		if ( ph === 'nibble' ) {

			// each pulse of the cue: a ring (the pulse counter runs 0 -> 1 over a nibble and restarts)
			const pulse = num( bite.pulse, 0 );
			if ( this.phase !== 'nibble' || pulse < this.pulse - 0.5 ) {

				sys.ripple( b.x, wy, b.z, 0.6 );
				c.nibble ++;

			}

			this.pulse = pulse;

		} else if ( ph === 'take' && this.phase !== 'take' ) {

			sys.plop( b.x, wy, b.z, 0.9 );
			sys.bubbles( b.x, wy, b.z, 0.12 );
			c.take ++;

		}

		this.phase = ph;

	}

	_fight( dt, fight, rod, wy ) {

		const sys = this.sys, b = rod.bobber, surge = num( fight.surge, 0 );
		const big = Math.min( 1, num( fight.kg, 1 ) / 8 );
		const hot = surge > 0.6;
		if ( hot && ! this.wasSurge ) {

			sys.plop( b.x, wy, b.z, 1.3 + 1.4 * big );
			sys.flick( b.x, wy + 0.1, b.z, 0.5 + 0.5 * big, rod.tip.x - b.x, 0.9, rod.tip.z - b.z );
			this.counts.thrash ++;

		}

		this.wasSurge = hot;
		// rings spreading from the fish while it runs
		if ( surge > 0.25 ) {

			this.rippleT -= dt;
			if ( this.rippleT <= 0 ) {

				this.rippleT = 0.45 - 0.25 * Math.min( 1, surge );
				sys.ripple( b.x + ( Math.random() - 0.5 ) * 0.3, wy, b.z + ( Math.random() - 0.5 ) * 0.3, 0.7 + 0.7 * Math.min( 1, surge ) * ( 0.5 + big ) );

			}

		}

	}

}
