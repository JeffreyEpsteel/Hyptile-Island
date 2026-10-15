// The driver's controls and the car's own systems (wave 24A): the automatic drivetrain readout, fuel, coolant temperature,
// indicators and hazards, wipers, the interior lamp, the taxi's fare meter, the bus's doors, the odometer. Plain state on
// the record (rec.sys; rec.fuel persists for your own cars) stepped by Cars every frame; no DOM, no GPU.
//
//   drivetrain( rec ) -> { engineOn, gear, gearIndex, rpm }   systemsOf( rec ) -> rec.sys
//   stepSystems( rec, dt, { rain, night, steer, speed, throttle } ) -> { ticks, wipes } (sound cues this step)
//   carPanelSnapshot( cars, hover ) -> everything the instruments draw    carControl( cars, id ) -> { ok, reason? }
const clamp = ( n, lo, hi ) => Math.max( lo, Math.min( hi, n ) );
export const GEARS = [ 3.2, 2.1, 1.5, 1.14, 0.92, 0.76 ];
// fuel: tank fractions per second (idle, flat out); the reserve the gauge never drops below (no stranding: the dealer
// refuels with a repair), the low-fuel lamp
export const FUEL = { idle: 0.00004, full: 0.00055, reserve: 0.05, low: 0.12 };
// coolant: ambient, running, the hot lamp (°C), the warm-up time constant (s)
export const TEMP = { ambient: 18, run: 88, hot: 112, tau: 30 };
// wipers: one sweep out and back (s) at normal and fast speed; the arc (rad) from the parked angle
export const WIPE = { normal: 1.5, fast: 0.9, arc: 1.55 };
export const WIPER_MODES = [ 'auto', 'on', 'fast', 'off' ];
export const TAXI_FARE = { flag: 3.2, perKm: 1.9, perMin: 0.45 };
export const BLINK_HZ = 1.5;

export function drivetrain( record, input = record?.body?.input || {} ) {

	if ( ! record ) return { engineOn: false, gear: '—', gearIndex: 0, rpm: 0 };
	const speed = record.body?.speed || 0, spec = record.spec;
	const engineOn = record.engineOn !== false && record.stage < 4 && record.hp > 0;
	const reversing = speed < - 0.2 || speed < 0.4 && input.brake > 0 && ! input.throttle;
	const gearIndex = reversing ? - 1 : Math.min( 6, 1 + Math.floor( Math.abs( speed ) / spec.top * 5.8 ) );
	const ratio = reversing ? 3 : GEARS[ gearIndex - 1 ];
	const wheelRPM = Math.abs( speed ) / ( 2 * Math.PI * spec.r ) * 60;
	const rpm = engineOn ? clamp( 780 + wheelRPM * ratio * 3.4 + ( input.throttle || 0 ) * 450, 780, 6500 ) : 0;
	return { engineOn, gearIndex, gear: record.parkBrake && Math.abs( speed ) < 0.3 ? 'P' : ! engineOn ? 'N' : reversing ? 'R' : 'D' + gearIndex, rpm };

}

export function systemsOf( rec ) {

	if ( ! rec ) return null;
	if ( ! rec.sys ) {

		const seed = String( rec.id || 'car' ).split( '' ).reduce( ( a, c ) => ( a * 31 + c.charCodeAt( 0 ) ) >>> 0, 7 );
		rec.sys = {
			temp: TEMP.ambient, ind: null, hazard: false, blinkT: 0, blinkOn: false, indPeak: 0,
			wipers: 'auto', wipe: 0, wipeDir: 0, wipeSpeed: 0, dome: false, domeT: 0, doors: false,
			meter: { on: false, fare: 0, dist: 0, time: 0 }, odo: 12000 + seed % 90000, trip: 0,
		};

	}
	if ( ! Number.isFinite( rec.fuel ) ) rec.fuel = 0.55 + ( ( rec.sys.odo * 7 ) % 40 ) / 100;
	return rec.sys;

}

// one step of the car's systems; returns the sound cues (indicator relay ticks, wiper reversals)
export function stepSystems( rec, dt, { rain = 0, steer = 0, speed = 0, throttle = 0, rpm = 0, engineOn = true } = {} ) {

	const s = systemsOf( rec ), out = { ticks: 0, wipes: 0 };
	if ( ! s || ! ( dt > 0 ) ) return out;
	const v = Math.abs( speed );
	// fuel and coolant follow the engine
	if ( engineOn ) rec.fuel = Math.max( FUEL.reserve, rec.fuel - ( FUEL.idle + ( FUEL.full - FUEL.idle ) * throttle * clamp( rpm / 6500, 0.15, 1 ) ) * dt );
	const target = engineOn ? TEMP.run + clamp( rpm / 6500, 0, 1 ) * 6 + ( rec.stage >= 2 ? 30 : rec.stage >= 1 ? 6 : 0 ) - clamp( v / 30, 0, 1 ) * 3 : TEMP.ambient;
	s.temp += ( target - s.temp ) * ( 1 - Math.exp( - dt / ( engineOn ? TEMP.tau : TEMP.tau * 4 ) ) );
	// indicators: a relay at BLINK_HZ; a turn the indicator called for cancels it when the wheel comes back
	const blinking = s.hazard || !! s.ind;
	if ( blinking ) {

		const was = s.blinkOn;
		s.blinkT += dt;
		s.blinkOn = ( s.blinkT * BLINK_HZ ) % 1 < 0.5;
		if ( s.blinkOn !== was ) out.ticks ++;
		if ( s.ind && ! s.hazard ) {

			const way = s.ind === 'L' ? steer : - steer;
			s.indPeak = Math.max( s.indPeak, way );
			if ( s.indPeak > 0.22 && way < 0.05 ) { s.ind = null; s.indPeak = 0; }

		}

	} else { if ( s.blinkOn ) out.ticks ++; s.blinkOn = false; s.blinkT = 0; }
	// wipers: auto follows the rain; a sweep out and back, parked when off
	const mode = s.wipers;
	const want = mode === 'off' ? 0 : mode === 'fast' ? 2 : mode === 'on' ? 1 : rain > 0.55 ? 2 : rain > 0.04 ? 1 : 0;
	s.wipeSpeed = want;
	if ( want || s.wipe > 0 ) {

		const half = ( want === 2 ? WIPE.fast : WIPE.normal ) / 2;
		if ( s.wipeDir === 0 ) s.wipeDir = 1;
		s.wipe += s.wipeDir * dt / half;
		if ( s.wipe >= 1 ) { s.wipe = 1; s.wipeDir = - 1; out.wipes ++; }
		if ( s.wipe <= 0 ) { s.wipe = 0; s.wipeDir = want ? 1 : 0; out.wipes ++; }

	}
	// the dome lamp's courtesy delay after getting in
	if ( s.domeT > 0 ) s.domeT = Math.max( 0, s.domeT - dt );
	// the taxi meter: a flag fall, distance and waiting time
	if ( s.meter.on ) {

		s.meter.dist += v * dt;
		s.meter.time += dt;
		if ( v < 2 ) s.meter.wait = ( s.meter.wait || 0 ) + dt;
		s.meter.fare = TAXI_FARE.flag + s.meter.dist / 1000 * TAXI_FARE.perKm + ( s.meter.wait || 0 ) / 60 * TAXI_FARE.perMin;

	}
	s.odo += v * dt / 1000;
	s.trip += v * dt / 1000;
	return out;

}

export function wiperAngle( s ) {

	// 0 parked (along the cowl) .. 1 the far end of the sweep
	return ( s ? s.wipe : 0 ) * WIPE.arc;

}

export function carPanelSnapshot( cars, hover = null ) {

	const r = cars.drive, b = r?.body, d = drivetrain( r ), s = systemsOf( r );
	return {
		...d, name: r?.spec.name || 'Car', kind: r?.kind || 'sedan', speed: Math.abs( b?.speed || 0 ) * 3.6,
		top: ( r?.spec.top || 44 ) * 3.6, hp: r ? clamp( r.hp / r.maxHp * 100, 0, 100 ) : 0,
		steer: b?.steer || 0, brake: !! ( b?.input.brake > 0 || b?.input.handbrake ), parkBrake: !! r?.parkBrake,
		throttle: b?.input.throttle || 0, lights: !! r?.lights, lightMode: cars.lightsOn === null ? 'AUTO' : cars.lightsOn ? 'ON' : 'OFF',
		horn: !! cars._horn, siren: r?.kind === 'police' && cars.siren, wanted: cars.policeLevel(),
		grounded: b?.grounded !== false, hover,
		fuel: r ? r.fuel : 0, temp: s ? s.temp : 0, ind: s?.ind || null, hazard: !! s?.hazard, blinkOn: !! s?.blinkOn,
		wipers: s?.wipers || 'auto', wiping: !! s?.wipeSpeed, dome: !! ( s?.dome || s?.domeT > 0 ), doors: !! s?.doors,
		meter: s ? { ...s.meter } : null, odo: s ? s.odo : 0, trip: s ? s.trip : 0,
		rain: cars.cockpit?.rain ?? 0, clock: cars.app?.settings?.timeOfDay ?? 12, stage: r?.stage || 0,
	};

}

export function carControl( cars, id ) {

	const r = cars.drive;
	if ( ! r || r.state !== 'player' ) return { ok: false, reason: 'not-driving' };
	const a = cars.app;
	if ( a.paused || a.menuOpen || a.input?.enabled === false || a.game?.guide?.open ) return { ok: false, reason: 'blocked' };
	const s = systemsOf( r ), still = Math.abs( r.body?.speed || 0 ) < 0.8;
	if ( id === 'engine' ) {

		if ( r.stage >= 4 || r.hp <= 0 ) return { ok: false, reason: 'wreck' };
		if ( ! still ) return { ok: false, reason: 'Stop before switching the engine' };
		r.engineOn = r.engineOn === false;
		return { ok: true, engineOn: r.engineOn };

	}
	if ( id === 'lights' ) { cars.toggleLights(); return { ok: true }; }
	if ( id === 'park' ) { r.parkBrake = ! r.parkBrake; return { ok: true }; }
	if ( id === 'horn' ) { cars._hornPulse = 0.35; return { ok: true }; }
	if ( id === 'siren' && r.kind === 'police' ) { cars.toggleSiren(); return { ok: true }; }
	if ( id === 'hazard' ) { s.hazard = ! s.hazard; s.blinkT = 0; return { ok: true }; }
	if ( id === 'indL' || id === 'indR' ) { const w = id === 'indL' ? 'L' : 'R'; s.ind = s.ind === w ? null : w; s.indPeak = 0; s.blinkT = 0; return { ok: true }; }
	if ( id === 'wipers' ) { s.wipers = WIPER_MODES[ ( WIPER_MODES.indexOf( s.wipers ) + 1 ) % WIPER_MODES.length ]; return { ok: true, wipers: s.wipers }; }
	if ( id === 'dome' ) { s.dome = ! ( s.dome || s.domeT > 0 ); s.domeT = 0; return { ok: true }; }
	if ( id === 'meter' && r.kind === 'taxi' ) {

		s.meter = s.meter.on ? { on: false, fare: s.meter.fare, dist: s.meter.dist, time: s.meter.time, last: s.meter.fare } : { on: true, fare: TAXI_FARE.flag, dist: 0, time: 0, wait: 0 };
		return { ok: true, meter: s.meter.on };

	}
	if ( id === 'doors' && r.kind === 'bus' ) {

		if ( ! still ) return { ok: false, reason: 'Stop before opening the doors' };
		s.doors = ! s.doors;
		return { ok: true, doors: s.doors };

	}
	return { ok: false, reason: 'unknown' };

}
