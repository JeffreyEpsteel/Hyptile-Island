// Actual electrical, turbine, hover and lighting systems. No UI state drives physics directly.
import { Vector3, Color } from '../../engine/index.js';

const clamp = ( n, a, b ) => Math.max( a, Math.min( b, n ) );
export const START_TIME = 1.2;
// fuel (wave 24A): tank fractions per second running (idle .. full collective); a landed aircraft on a helipad refuels
// at REFUEL per second; the reserve it never burns below (the rescue service keeps you flying); the low-fuel caution
export const FUEL = Object.freeze( { idle: 1 / 3600, full: 1 / 1500, refuel: 0.04, reserve: 0.04, low: 0.15 } );
export class RotorSystems {

	constructor( flight ) {
		this.flight = flight; this.reset();
		const defs = [
			[ 'navL', [ 1.14, 1.24, - .8 ], [ 1, .04, .02 ], 1.5, 7 ],
			[ 'navR', [ - 1.14, 1.24, - .8 ], [ .03, 1, .22 ], 1.5, 7 ],
			[ 'landing', [ 0, .89, 2.08 ], [ 1, .91, .72 ], 65, 90, [ 0, - .24, 1 ], 10, 25 ],
			[ 'search', [ .42, .8, 1.95 ], [ .86, .95, 1 ], 130, 145, [ 0, - .65, 1 ], 5, 12 ],
			[ 'cabin', [ .2, 2.05, .3 ], [ 1, .25, .12 ], .3, 2.4 ],
		];
		this.lights = defs.map( ( [ id, p, color, intensity, range, direction, inner, outer ] ) => {
			const sys = this, local = new Vector3( ...p ), dirL = direction ? new Vector3( ...direction ).normalize() : null;
			return { id: 'helicopter-' + id, switchId: id.startsWith( 'nav' ) ? 'nav' : id, kind: 'helicopter', position: new Vector3(), color: new Color( ...color ), intensity, range, enabled: false, local, dirL,
				dir: dirL ? new Vector3() : null, cosInner: direction ? Math.cos( inner * Math.PI / 180 ) : undefined, cosOuter: direction ? Math.cos( outer * Math.PI / 180 ) : undefined,
				update() { flight.toWorld( local, this.position ); if ( dirL ) this.dir.copy( dirL ).applyQuaternion( flight.quaternion ); this.enabled = sys.master && sys[ this.switchId ]; },
			};
		} );
		this.syncLights();
	}
	reset() { this.master = true; this.fuelPump = true; this.fuel = this.fuel ?? 0.85; this.nav = true; this.landing = this.search = this.cabin = false; this.starting = 0; this.running = false; this.session = false; this.hold = null; this.time = 0; this.warnings = []; this.acknowledged = ''; this.flight.engineOn = false; this.flight.starter = false; this.syncLights(); }
	begin() { this.session = true; if ( this.flight.rpm > .8 ) this.running = true; else this.start(); }
	start( hp = 100 ) {
		if ( ! this.master ) return { ok: false, why: 'Switch on AVIONICS / battery before starting.' };
		if ( ! this.fuelPump ) return { ok: false, why: 'Switch on the FUEL PUMP (overhead) before starting.' };
		if ( hp <= 0 || this.flight.onWater ) return { ok: false, why: 'Recover and repair the helicopter at its helipad.' };
		if ( ! this.running && ! this.starting ) this.starting = START_TIME;
		return { ok: true, why: 'Starter engaged · wait for green ROTOR before lifting.' };
	}
	stop( force = false ) {
		const air = ! this.flight.grounded || this.flight.velocity.length() >= 2;
		// (realistic flight: you may cut the turbine aloft and autorotate down; the assist keeps it running)
		if ( ! force && air && this.flight.mode !== 'real' ) return { ok: false, why: 'Land and stop before shutting down the turbine.' };
		this.running = false; this.starting = 0; this.hold = null; this.flight.engineOn = false; this.flight.starter = false;
		return { ok: true, why: air && ! force ? 'Turbine cut · AUTOROTATE: collective down, keep the rotor in the green, flare at the bottom · O restarts' : 'Turbine stopped · rotor coasting down.' };
	}
	toggleHold() {
		const f = this.flight;
		if ( this.hold ) { this.hold = null; return { ok: true, why: 'Hover hold released · manual controls.' }; }
		if ( f.mode === 'real' ) return { ok: false, why: 'Hover hold belongs to the assisted flight mode (K) · realistic flight is all yours.' };
		if ( ! this.running || f.rpm < .8 || f.grounded || f.onWater ) return { ok: false, why: 'Hover hold requires airborne flight and green rotor RPM.' };
		this.hold = f.position.clone(); return { ok: true, why: 'Position and altitude held · move any flight control to release.' };
	}
	applyHold( controls ) {
		if ( ! this.hold ) return controls;
		if ( [ 'forward', 'strafe', 'yaw', 'lift' ].some( k => Math.abs( controls[ k ] || 0 ) > .15 ) || controls.brake ) { this.hold = null; return controls; }
		const f = this.flight, dx = ( this.hold.x - f.position.x ) * .65 - f.velocity.x * .35, dz = ( this.hold.z - f.position.z ) * .65 - f.velocity.z * .35;
		const fw = dx * Math.sin( f.yaw ) + dz * Math.cos( f.yaw );
		return { ...controls, forward: clamp( fw / ( fw >= 0 ? 34 : 14 ), - .4, .4 ), strafe: clamp( ( dx * Math.cos( f.yaw ) - dz * Math.sin( f.yaw ) ) / 13, - .4, .4 ), lift: clamp( ( this.hold.y - f.position.y ) * .6 / ( this.hold.y >= f.position.y ? 6 : 2.8 ), - .5, .5 ) };
	}
	aim( worldDirection ) {
		const l = this.lights.find( s => s.switchId === 'search' ); if ( ! l || ! worldDirection ) return;
		const local = worldDirection.clone().applyQuaternion( this.flight.quaternion.clone().invert() );
		const yaw = clamp( Math.atan2( local.x, local.z ), - 1.2, 1.2 ), down = clamp( Math.atan2( - local.y, Math.hypot( local.x, local.z ) ), .05, 1.3 );
		l.dirL.set( Math.sin( yaw ) * Math.cos( down ), - Math.sin( down ), Math.cos( yaw ) * Math.cos( down ) );
	}
	update( dt, { piloted, hp, onPad = false } ) {
		dt = Number.isFinite( dt ) ? clamp( dt, 0, .1 ) : 0; this.time += dt;
		if ( piloted && ! this.session ) this.begin();
		if ( ! piloted || hp <= 0 || this.flight.onWater || ! this.master || ! this.fuelPump ) { this.stop( true ); if ( ! piloted ) this.session = false; }
		else if ( this.starting > 0 ) { this.starting = Math.max( 0, this.starting - dt ); if ( this.starting === 0 ) this.running = true; }
		// a badly damaged turbine quits in the air (realistic flight): an autorotation follows
		else if ( this.running && hp < 30 && this.flight.mode === 'real' && ! this.flight.grounded ) { this.running = false; this.failed = true; }
		this.flight.engineOn = piloted && this.running && hp > 0 && ! this.flight.onWater;
		this.flight.starter = this.starting > 0;
		const f = this.flight; this.warnings = [];
		// fuel burns with the turbine and the collective; a helipad's bowser tops the tank up while you sit on it
		if ( this.running ) this.fuel = Math.max( FUEL.reserve, this.fuel - ( FUEL.idle + ( FUEL.full - FUEL.idle ) * clamp( Math.abs( f.controls.lift || 0 ) * 0.6 + Math.hypot( f.velocity.x, f.velocity.z ) / 34 * 0.4, 0, 1 ) ) * dt );
		if ( onPad && f.grounded && ! this.running && f.rpm < 0.3 ) this.fuel = Math.min( 1, this.fuel + FUEL.refuel * dt );
		if ( hp < 50 ) this.warnings.push( 'HULL DAMAGE' );
		if ( this.fuel <= FUEL.low ) this.warnings.push( 'LOW FUEL' );
		if ( piloted && ! f.grounded && ( ! f.engineOn || f.rpm < .8 ) ) this.warnings.push( 'LOW ROTOR' );
		if ( piloted && f.mode === 'real' && ! f.grounded ) {
			if ( f.rpm > 1.08 ) this.warnings.push( 'ROTOR OVERSPEED' );
			if ( f.state?.vrs > 0.4 ) this.warnings.push( 'VORTEX RING' );
			if ( f.state?.rbs > 0.25 ) this.warnings.push( 'BLADE STALL' );
			if ( ! f.engineOn && this.session && ! this.starting ) this.warnings.push( 'ENGINE OUT' );
		}
		if ( ! f.grounded && f.agl < 25 && f.velocity.y < - 3.5 ) this.warnings.push( 'SINK RATE' );
		if ( f.onWater ) this.warnings.push( 'DITCHED' );
		if ( ! this.warnings.length ) this.acknowledged = '';
		this.syncLights();
	}
	get lightsMask() { return this.master ? ( this.nav ? 1 : 0 ) | ( this.landing ? 2 : 0 ) | ( this.search ? 4 : 0 ) | ( this.cabin ? 8 : 0 ) : 0; }
	get flashing() { return this.warnings.join( '|' ) !== this.acknowledged && Math.floor( this.time * 3 ) % 2 === 0; }
	ack() { this.acknowledged = this.warnings.join( '|' ); }
	syncLights() { for ( const l of this.lights || [] ) l.update(); }
	toJSON() { return { master: this.master, fuelPump: this.fuelPump, fuel: Math.round( this.fuel * 1000 ) / 1000, nav: this.nav, landing: this.landing, search: this.search, cabin: this.cabin }; }
	fromJSON( data ) { this.reset(); for ( const key of [ 'master', 'fuelPump', 'nav', 'landing', 'search', 'cabin' ] ) if ( typeof data?.[ key ] === 'boolean' ) this[ key ] = data[ key ]; if ( Number.isFinite( data?.fuel ) ) this.fuel = clamp( data.fuel, FUEL.reserve, 1 ); this.syncLights(); }
}
