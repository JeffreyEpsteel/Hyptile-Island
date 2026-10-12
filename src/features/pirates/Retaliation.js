// Retaliation raids (Unreal PirateRetaliationComponent, parity V9): hurt a crew - sink or take a named captain, raid a den, beat
// her guards, repel her boarders - and her band may come for you. A raid is queued with a delay; when it is due and you are at
// sea, the avenger's ship (a vengeful named captain, the victim herself when she still sails) appears ~420 m off and hunts you
// (closing to board if she is a boarder). Stay ashore too long and the raiders ransack the harbour instead: a share of your
// coins is gone (never in the sandbox).
//
//   const r = new Retaliation( pirates );   r.trigger( victimId, reason ) -> raid | null   r.update( dt )   r.pending   r.active
//   r.toJSON() / fromJSON( d ) / reset()
//
// Events (through pirates): retaliationRaid { captain, reason, at: 'sea' | 'harbour', x, z }.
//
// Wave 4: never in the peaceful home waters (melee/Peace.js). A raid that falls due while the player is on the home island or in
// its bay waits there (it does not count down the ashore grace), the avenger never appears inside the zone, and the harbour
// that gets ransacked is an outer port the player is ashore at, never Hyptile Harbour.

import { CAPTAIN_BY_ID, CAPTAINS, hasTrait } from './Roster.js';
import { inSafeZone } from '../naval/Routes.js';
import { inPeace, PEACE } from '../melee/Peace.js';

export const RAID_RULES = {
	chance: 0.35, perLevel: 0.1, vengeful: 0.4, // odds a hurt crew answers
	delay: [ 70, 160 ], // s before the raid is due
	ashoreGrace: 300, // s the raiders wait for you to put to sea before they hit the harbour instead
	cooldown: 240, // s after a raid before another is queued
	distance: 420, // m from the player where the avenger appears
	escape: 950, // m: a raid ship left this far behind gives up
	harbourShare: 0.06, harbourMax: 180,
	maxPending: 2,
};

export class Retaliation {

	constructor( pirates ) {

		this.p = pirates;
		this.reset();

	}

	reset() {

		this.pending = []; // { avenger, reason, t, wait }
		this.active = []; // Ships of running raids
		this.cool = 0;

	}

	// a free vengeful hostile captain to send: the victim if she is free, else her band
	avengerFor( victimId ) {

		const v = CAPTAIN_BY_ID[ victimId ];
		const free = ( c ) => this.p.ledger.isFree( c.id ) && ! this.p.roster.shipOf( c.id ) && ! this.pending.some( ( q ) => q.avenger === c.id );
		if ( v && v.hostile && free( v ) ) return v;
		const band = CAPTAINS.filter( ( c ) => c.hostile && hasTrait( c, 'vengeful' ) && free( c ) );
		if ( ! band.length ) return null;
		return band[ Math.floor( this.p.rng() * band.length ) % band.length ];

	}

	trigger( victimId, reason = 'hurt', { force = false } = {} ) {

		if ( this.p.features && this.p.features.sandbox && ! force ) return null;
		if ( this.pending.length >= RAID_RULES.maxPending || ( this.cool > 0 && ! force ) ) return null;
		const v = CAPTAIN_BY_ID[ victimId ];
		let odds = RAID_RULES.chance + RAID_RULES.perLevel * this.p.wanted.level;
		if ( v && hasTrait( v, 'vengeful' ) ) odds += RAID_RULES.vengeful;
		if ( ! force && this.p.rng() > odds ) return null;
		const a = this.avengerFor( victimId );
		if ( ! a ) return null;
		const [ d0, d1 ] = RAID_RULES.delay;
		const q = { avenger: a.id, reason, victim: victimId || null, t: d0 + ( d1 - d0 ) * this.p.rng(), wait: 0 };
		this.pending.push( q );
		this.cool = RAID_RULES.cooldown;
		return q;

	}

	// deep open water about `r` m from the player, not in a harbour
	_spot( pl, r ) {

		const T = this.p.terrain;
		const a0 = this.p.rng() * Math.PI * 2;
		for ( let k = 0; k < 16; k ++ ) {

			const a = a0 + k * ( Math.PI * 2 / 16 );
			const x = pl.x + Math.sin( a ) * r, z = pl.z + Math.cos( a ) * r;
			if ( inSafeZone( x, z ) || inPeace( x, z, PEACE.pad ) ) continue;
			if ( T && T.heightAt && ( T.heightAt( x, z ) > - 6 || T.heightAt( x + 20, z ) > - 4 || T.heightAt( x, z + 20 ) > - 4 ) ) continue;
			return { x, z, yaw: Math.atan2( pl.x - x, pl.z - z ) };

		}

		return null;

	}

	_launch( q ) {

		const pl = this.p.playerPos(), c = CAPTAIN_BY_ID[ q.avenger ];
		if ( ! pl || ! c ) return false;
		const at = this._spot( pl, RAID_RULES.distance );
		if ( ! at ) return false;
		const s = this.p.roster.spawn( c.id, { x: at.x, z: at.z, yaw: at.yaw, state: 'chase', alert: 180, speed: 4 } );
		if ( ! s ) return false;
		s.raid = { reason: q.reason, victim: q.victim };
		s.faction = 'pirate'; // a raid always means business
		if ( hasTrait( c, 'boarder' ) ) s.mustBoard = true;
		this.active.push( s );
		this.p.toast( `Black sails to the ${ this._quarter( pl, at ) }: ${ c.captain } has come for revenge`, 4600 );
		this.p._emitRaid( { captain: c.captain, id: c.id, reason: q.reason, at: 'sea', x: Math.round( at.x ), z: Math.round( at.z ) } );
		return true;

	}

	_quarter( pl, at ) {

		const a = Math.atan2( at.x - pl.x, at.z - pl.z ); // +z is south, +x east
		const names = [ 'south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west' ];
		const i = ( Math.round( a / ( Math.PI / 4 ) ) + 8 ) % 8;
		return names[ i ];

	}

	_harbourRaid( q ) {

		const c = CAPTAIN_BY_ID[ q.avenger ];
		const st = this.p.state, f = this.p.features;
		let lost = 0;
		if ( st && ! ( f && f.sandbox ) && Number.isFinite( st.money ) && st.money > 0 ) {

			lost = Math.min( RAID_RULES.harbourMax, Math.round( st.money * RAID_RULES.harbourShare ) );
			if ( lost > 0 && st.spend ) st.spend( lost );

		}

		this.p.toast( `${ c ? c.captain : 'Pirates' } raided the harbour while you were ashore${ lost ? ` · $${ lost } of your takings is gone` : '' }`, 4800 );
		this.p._emitRaid( { captain: c ? c.captain : '', id: c ? c.id : null, reason: q.reason, at: 'harbour', lost } );

	}

	update( dt ) {

		if ( this.cool > 0 ) this.cool -= dt;
		for ( let i = this.pending.length - 1; i >= 0; i -- ) {

			const q = this.pending[ i ];
			if ( ! this.p.ledger.isFree( q.avenger ) ) { this.pending.splice( i, 1 ); continue; } // she died first
			q.t -= dt;
			if ( q.t > 0 ) continue;
			const pl = this.p.playerPos();
			if ( pl && inPeace( pl.x, pl.z ) ) continue; // home waters: the raid waits for him to leave them
			if ( this.p.playerAtSea() && this.p.navalActive() ) {

				if ( this._launch( q ) ) this.pending.splice( i, 1 );

			} else {

				q.wait += dt;
				if ( q.wait >= RAID_RULES.ashoreGrace ) {

					this._harbourRaid( q );
					this.pending.splice( i, 1 );

				}

			}

		}

		const pl = this.p.playerPos();
		for ( let i = this.active.length - 1; i >= 0; i -- ) {

			const s = this.active[ i ];
			if ( ! s.alive ) { this.active.splice( i, 1 ); continue; }
			if ( pl && Math.hypot( s.x - pl.x, s.z - pl.z ) > RAID_RULES.escape ) {

				s.state = 'gone';
				this.active.splice( i, 1 );
				this.p.toast( `You shook off the ${ s.name }`, 2600 );

			}

		}

	}

	toJSON() {

		return { pending: this.pending.map( ( q ) => ( { avenger: q.avenger, reason: q.reason, victim: q.victim, t: Math.round( q.t ), wait: Math.round( q.wait ) } ) ) };

	}

	fromJSON( d ) {

		this.reset();
		if ( ! d || ! Array.isArray( d.pending ) ) return;
		for ( const q of d.pending.slice( 0, RAID_RULES.maxPending ) ) {

			if ( ! q || ! CAPTAIN_BY_ID[ q.avenger ] ) continue;
			this.pending.push( { avenger: q.avenger, reason: String( q.reason || 'hurt' ).slice( 0, 20 ), victim: CAPTAIN_BY_ID[ q.victim ] ? q.victim : null, t: Math.max( 20, +q.t || 60 ), wait: Math.max( 0, +q.wait || 0 ) } );

		}

	}

}
