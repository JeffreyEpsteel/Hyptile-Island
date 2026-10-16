// Who may shoot whom (wave 26A, "no griefing unarmed players or boats"), pure: the client's hit test, the host's check of a
// claimed hit and the HUD all ask the same functions.
//
//   canHit( shooter, target, ctx ) -> { ok, why }
//     shooter / target: { id, kind: 'player' | 'ai' | 'drone', inFighter, armed, alive, grounded, speed }
//     ctx: { online (a multiplayer session), solo (offline practice: AI and drones only) }
//   Player against player: only online, only fighter against fighter, both with their guns ARMED (the toggle shows a red
//   badge to everyone), both alive and neither sitting on the ground (no hits on a fighter parked or taxiing at a strip).
//   AI raiders and target drones: only offline (they exist only there); they may shoot the player while he is armed or
//   in their practice. Boats, players on foot, swimmers, cars, helicopters and seaplanes are never a target.
//   ARM.disarm: guns stay armed this long after the switch goes to safe (a fight is not left with a key press).

export const ARM = { arm: 1.5, disarm: 6, ground: 6 }; // s: the switch's travel either way; a grounded fighter under this speed (m/s) is safe

export function canHit( shooter, target, ctx = {} ) {

	if ( ! shooter || ! target ) return { ok: false, why: 'none' };
	if ( shooter.id === target.id ) return { ok: false, why: 'self' };
	if ( ! target.inFighter ) return { ok: false, why: 'notFighter' };
	if ( target.alive === false ) return { ok: false, why: 'down' };
	if ( target.grounded && ( target.speed || 0 ) < ARM.ground ) return { ok: false, why: 'parked' };
	const pvp = shooter.kind === 'player' && target.kind === 'player';
	if ( pvp ) {

		if ( ! ctx.online ) return { ok: false, why: 'offline' };
		if ( ! shooter.inFighter || ! shooter.armed ) return { ok: false, why: 'shooterSafe' };
		if ( ! target.armed ) return { ok: false, why: 'targetSafe' };
		return { ok: true, why: 'pvp' };

	}

	// practice: the AI and the drones exist offline only
	if ( ctx.online ) return { ok: false, why: 'online' };
	if ( shooter.kind === 'player' ) return shooter.armed ? { ok: true, why: 'practice' } : { ok: false, why: 'shooterSafe' };
	// an AI raider fires on an armed player (one who flew in looking for a fight) or one in a practice he started
	if ( target.kind === 'player' ) return target.armed || ctx.practice ? { ok: true, why: 'raider' } : { ok: false, why: 'targetSafe' };
	return { ok: false, why: 'aiVsAi' };

}

// the arming switch: armed now, given when it was last thrown and which way ( at: s on any clock )
export class ArmSwitch {

	constructor() {

		this.want = false; // the switch
		this.armed = false; // what the guns are
		this.t = 0; // s since the switch was thrown

	}

	set( on ) {

		on = !! on;
		if ( on === this.want ) return false;
		this.want = on;
		this.t = 0;
		return true;

	}

	toggle() {

		return this.set( ! this.want );

	}

	update( dt ) {

		this.t += dt;
		if ( this.want && ! this.armed && this.t >= ARM.arm ) this.armed = true;
		if ( ! this.want && this.armed && this.t >= ARM.disarm ) this.armed = false;
		return this.armed;

	}

	// the switch is going to safe but the guns are still hot
	get cooling() {

		return ! this.want && this.armed;

	}

	get arming() {

		return this.want && ! this.armed;

	}

	reset() {

		this.want = false;
		this.armed = false;
		this.t = 0;

	}

}
