// The seaplane's switches and warnings, pure logic (the node test drives it; Cockpit.js draws it, Seaplane.js routes
// the keys / clicks here): the master (battery) switch, the starter, nav and landing lights, the warning lamps, the
// fuel price at the ramp, and the plane's local lights (red / green wingtips, the landing light, a dim red cabin lamp).
//
//   const sys = new Systems( flight, pilot );
//   sys.start() / sys.stop() -> { ok, why }      the engine: a ~1.8 s crank on the starter, then it runs (needs the
//                                               master on and fuel); stop cuts it
//   sys.toggle( 'master' | 'nav' | 'landing' )  sys.update( dt, { hp } ) -> events [ 'started' | 'noStart' | 'warn' ]
//   sys.stallWarn / masterWarn / fuelLow / rudderDown / apOn / flash (blink phase)   sys.ack() (silences the master warning)
//   sys.lights (LocalLights sources: features' lights[]), sys.syncLights()
//   refuelCost( fuel, free ) -> $ to fill the tank (FUEL.litres at FUEL.price)
//   sys.toJSON() / fromJSON()  (switch positions)

import { Vector3, Color } from '../../engine/index.js';

const DEG = Math.PI / 180;

export const FUEL = { litres: 300, price: 1.0, low: 0.15 }; // a 300 L tank of avgas at $1 a litre at the ramp
export const START_TIME = 1.8; // s on the starter before it catches
export const STALL_WARN = 4.5 * DEG; // wing alpha margin that sounds the horn
export const WARN_HP = 50; // the master warning stays lit under this condition

export function refuelCost( fuel, free = false ) {

	if ( free ) return 0;
	return Math.max( 0, Math.round( ( 1 - Math.max( 0, Math.min( 1, fuel ) ) ) * FUEL.litres * FUEL.price ) );

}

// model-frame lights: [ id, position, colour, intensity, range, direction (spot / sided) ]
const LIGHTS = [
	{ id: 'navL', p: [ 7.2, 3.3, 0.4 ], color: [ 1.0, 0.06, 0.03 ], intensity: 1.6, range: 9, side: [ 1, 0, 0.3 ] }, // port: red
	{ id: 'navR', p: [ - 7.2, 3.3, 0.4 ], color: [ 0.05, 1.0, 0.3 ], intensity: 1.6, range: 9, side: [ - 1, 0, 0.3 ] }, // starboard: green
	{ id: 'landing', p: [ 2.3, 3.12, 1.42 ], color: [ 1.0, 0.93, 0.8 ], intensity: 60, range: 90, spot: [ 0, - 0.1, 1 ], inner: 8, outer: 22 },
	{ id: 'cabin', p: [ 0, 2.98, 1.5 ], color: [ 1.0, 0.12, 0.06 ], intensity: 0.22, range: 2.4 },
];

export class Systems {

	constructor( flight, pilot = null ) {

		this.flight = flight;
		this.pilot = pilot;
		this.master = true;
		this.nav = false;
		this.landing = false;
		this.starting = 0; // s of cranking left
		this.hp = 100;
		this.warnAck = true; // the master warning was acknowledged (it only flashes for new damage)
		this.time = 0;
		this.lights = LIGHTS.map( ( d ) => this._light( d ) );
		this.syncLights();

	}

	_light( d ) {

		const f = this.flight;
		const local = new Vector3( ...d.p );
		const dirL = d.spot || d.side ? new Vector3( ...( d.spot || d.side ) ).normalize() : null;
		const src = {
			id: d.id, kind: 'seaplane', position: new Vector3(), color: new Color( ...d.color ), intensity: d.intensity, range: d.range, enabled: false,
			dir: dirL ? new Vector3() : null,
			cosInner: d.spot ? Math.cos( d.inner * DEG ) : d.side ? 0.25 : undefined,
			cosOuter: d.spot ? Math.cos( d.outer * DEG ) : d.side ? - 0.2 : undefined,
			update() {

				f.toWorldXYZ( local.x, local.y, local.z, this.position );
				if ( dirL ) this.dir.copy( dirL ).applyQuaternion( f.quaternion );

			},
		};
		src.update();
		return src;

	}

	light( id ) {

		return this.lights.find( ( l ) => l.id === id ) || null;

	}

	// the lights follow their switches (the master feeds them all; the cabin lamp burns while the master is on)
	syncLights() {

		for ( const l of this.lights ) {

			const on = this.master && ( l.id === 'cabin' || ( l.id === 'landing' ? this.landing : this.nav ) );
			l.enabled = on;

		}

	}

	get engineOn() {

		return !! this.flight.engineOn;

	}

	get cranking() {

		return this.starting > 0;

	}

	get apOn() {

		return !! ( this.pilot && this.pilot.ap && this.pilot.ap.on );

	}

	get stallWarn() {

		const f = this.flight;
		return this.master && f.airborne && f.airspeed > 6 && f.stallMargin < STALL_WARN;

	}

	get fuelLow() {

		return this.flight.fuel < FUEL.low;

	}

	get rudderDown() {

		const f = this.flight;
		return f.onWater && ! f.airborne;

	}

	get masterWarn() {

		return this.hp < WARN_HP || ! this.warnAck;

	}

	// 2 Hz blink for the lamps that flash
	get flash() {

		return ( this.time * 2 ) % 1 < 0.5;

	}

	start() {

		const f = this.flight;
		if ( f.engineOn ) return { ok: false, why: 'running' };
		if ( this.starting > 0 ) return { ok: false, why: 'starting' };
		if ( ! this.master ) return { ok: false, why: 'master' };
		if ( f.fuel <= 0 ) return { ok: false, why: 'fuel' };
		this.starting = START_TIME;
		f.cranking = true;
		return { ok: true };

	}

	stop() {

		const f = this.flight;
		const was = f.engineOn || this.starting > 0;
		f.engineOn = false;
		f.cranking = false;
		this.starting = 0;
		return { ok: was };

	}

	toggle( id ) {

		if ( id === 'master' ) this.master = ! this.master;
		else if ( id === 'nav' ) this.nav = ! this.nav;
		else if ( id === 'landing' ) this.landing = ! this.landing;
		else return null;
		// the avionics lose power with the master: the autopilot drops, a crank stops (the magnetos keep the engine going)
		if ( id === 'master' && ! this.master ) {

			if ( this.pilot && this.pilot.disengageAutopilot ) this.pilot.disengageAutopilot();
			if ( this.starting > 0 ) this.stop();

		}

		this.syncLights();
		return this[ id ];

	}

	ack() {

		this.warnAck = true;

	}

	// per frame: the starter, the damage watch; returns what happened ( 'started', 'noStart', 'warn' )
	update( dt, { hp = this.hp } = {} ) {

		const out = [];
		const f = this.flight;
		this.time += dt;
		if ( hp < this.hp - 0.5 ) {

			this.warnAck = false;
			out.push( 'warn' );

		}

		this.hp = hp;
		if ( this.starting > 0 ) {

			this.starting -= dt;
			f.cranking = true;
			if ( this.starting <= 0 ) {

				this.starting = 0;
				f.cranking = false;
				if ( this.master && f.fuel > 0 ) {

					f.engineOn = true;
					out.push( 'started' );

				} else out.push( 'noStart' );

			}

		} else f.cranking = false;

		for ( const l of this.lights ) if ( l.enabled ) l.update();
		return out;

	}

	reset() {

		this.stop();
		this.warnAck = true;

	}

	toJSON() {

		return { master: this.master, nav: this.nav, landing: this.landing };

	}

	fromJSON( d ) {

		if ( ! d || typeof d !== 'object' ) return;
		if ( typeof d.master === 'boolean' ) this.master = d.master;
		if ( typeof d.nav === 'boolean' ) this.nav = d.nav;
		if ( typeof d.landing === 'boolean' ) this.landing = d.landing;
		this.syncLights();

	}

}
