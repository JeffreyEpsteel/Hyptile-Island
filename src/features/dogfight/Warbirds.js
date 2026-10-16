// The three fighters (wave 26A, "I want to be able to fight other players with airplanes. I'd like 2-4 WW2 style ones."):
// fictional 1940s-style single-seat fighters, no real names or markings. Pure data and pure functions (node tests).
//
//   WARBIRDS.sabrewing  the nimble low-wing interceptor with the elliptical wing: the best turner, light guns
//   WARBIRDS.stormgull  the rugged gull-wing carrier fighter: balanced, six heavy machine guns, the best climber
//   WARBIRDS.bulwark    the radial-engine brawler: fastest, rolls quickest, armoured, cannons; turns worst
//   WARBIRD_IDS         in hangar order
//
// Frame (the models and every offset here): +Z the nose, +Y up, +X the LEFT wing (the seaplane's convention), metres,
// origin at the centre of mass in level flight; the main wheels' contact at gear.main[ 1 ] below it.
//   flight:  mass (kg), area (m2), span, ar, cl0, clMax, alphaStall (rad), cd0, e (Oswald), power (W), eta, thrustStatic (N),
//            nMax (g the pilot pulls before the stick goes light), rates { pitch, roll, yaw } (rad/s at full authority),
//            qRef (Pa: full control authority from this dynamic pressure), vne (m/s: controls stiffen above it)
//   guns:    groups of mounts { kind, at: [ x, y, z ], rof (rounds/s), ammo (rounds per gun), dmg, vel (m/s), heatPer
//            (heat a round adds, 1 = jammed), cool (heat/s), tracer (one round in n draws a tracer), shell (explodes) }
//   armour:  damage taken is divided by it; parts: hit volumes (spheres, model frame) of each damage part
//   seat / eye / sight: where the avatar sits (its feet origin: the eye is 1.29 m over it, as in the seaplane), where the
//   cockpit camera is, the reflector sight's glass (model frame)

export const DEG = Math.PI / 180;
export const G0 = 9.81;
export const RHO0 = 1.225;

// a gun's kinds: the light (7.7 mm), heavy (12.7 mm) machine guns and the 20 mm cannon
export const GUN_KINDS = {
	light: { rof: 16, dmg: 2.6, vel: 830, heatPer: 1 / ( 16 * 11 ), cool: 0.09, tracer: 4, shell: false, spread: 0.0022, sound: 'mg' },
	heavy: { rof: 13, dmg: 5.2, vel: 870, heatPer: 1 / ( 13 * 10 ), cool: 0.085, tracer: 4, shell: false, spread: 0.0018, sound: 'hmg' },
	cannon: { rof: 9.5, dmg: 17, vel: 790, heatPer: 0, cool: 0, tracer: 2, shell: true, spread: 0.0026, sound: 'cannon' },
};

const gun = ( kind, x, y, z, ammo ) => ( { kind, at: [ x, y, z ], ammo, ...GUN_KINDS[ kind ] } );
// a turret's gun: its muzzle in the turret's frame (+Z along the barrels, from the turret's pivot)
const tgun = ( kind, x, y, z, ammo ) => ( { kind, off: [ x, y, z ], ammo, ...GUN_KINDS[ kind ] } );
// a crew seat: role 'pilot' | 'gunner' | 'radio' | 'engineer'; seat (the avatar's feet origin) and eye (model frame); face: the
// seat's rest heading (0 the nose, PI the tail); a gunner's turret { id, at (pivot), rest (its heading at 0), arc { yaw: [ min,
// max ], pitch: [ min, max ] } (rad, about the rest), slew (rad/s), guns }
const seatAt = ( role, eye, face = 0, extra = {} ) => ( { role, eye, face, seat: [ eye[ 0 ], eye[ 1 ] - 1.29, eye[ 2 ] - 0.05 * ( face ? - 1 : 1 ) ], ...extra } );

export const WARBIRDS = {
	sabrewing: {
		id: 'sabrewing', name: 'Sabrewing', price: 34000,
		sub: 'Elliptical-wing interceptor: turns inside anything, six light wing guns',
		role: 'Turn fighter', model: 'models/warbirds/Sabrewing.glb',
		flight: {
			mass: 3050, area: 22.5, span: 11.2, ar: 5.6, cl0: 0.12, clMax: 1.48, alphaStall: 16 * DEG, cd0: 0.0205, e: 0.9,
			power: 1150e3, eta: 0.82, thrustStatic: 19500, nMax: 7.2, rates: { pitch: 1.75, roll: 3.4, yaw: 0.5 },
			qRef: 3200, vne: 205,
		},
		armour: 1,
		guns: [
			gun( 'light', 2.15, - 0.12, 0.55, 350 ), gun( 'light', - 2.15, - 0.12, 0.55, 350 ),
			gun( 'light', 2.65, - 0.1, 0.45, 350 ), gun( 'light', - 2.65, - 0.1, 0.45, 350 ),
			gun( 'light', 3.15, - 0.08, 0.35, 350 ), gun( 'light', - 3.15, - 0.08, 0.35, 350 ),
		],
		gear: { main: [ 1.0, - 1.62, 0.55 ], tail: [ 0, - 0.4, - 6.3 ], track: 1.0, retract: 'out' },
		length: 9.2, prop: [ 0, 0.18, 4.15 ], propRadius: 1.6,
		seat: [ 0, - 0.45, - 0.9 ], eye: [ 0, 0.84, - 0.85 ], sight: [ 0, 0.86, - 0.12 ],
		parts: {
			engine: [ [ 0, 0.05, 2.9, 0.75 ], [ 0, 0.05, 1.8, 0.75 ] ],
			pilot: [ [ 0, 0.35, - 0.85, 0.42 ] ],
			fuselage: [ [ 0, 0, 0.4, 0.72 ], [ 0, 0, - 1.6, 0.6 ], [ 0, 0.05, - 3.2, 0.48 ] ],
			wingL: [ [ 1.5, - 0.2, 0.35, 0.85 ], [ 3.0, - 0.12, 0.25, 0.72 ], [ 4.4, - 0.05, 0.1, 0.55 ] ],
			wingR: [ [ - 1.5, - 0.2, 0.35, 0.85 ], [ - 3.0, - 0.12, 0.25, 0.72 ], [ - 4.4, - 0.05, 0.1, 0.55 ] ],
			tail: [ [ 0, 0.15, - 4.75, 0.45 ], [ 1.2, 0.05, - 4.95, 0.45 ], [ - 1.2, 0.05, - 4.95, 0.45 ], [ 0, 0.85, - 5.0, 0.42 ] ],
		},
		livery: { main: [ 0.42, 0.46, 0.33 ], trim: [ 0.62, 0.66, 0.68 ], band: [ 0.86, 0.72, 0.28 ] },
	},
	stormgull: {
		id: 'stormgull', name: 'Stormgull', price: 42000,
		sub: 'Gull-wing carrier fighter: rugged, six heavy machine guns, climbs like a lift',
		role: 'All-rounder', model: 'models/warbirds/Stormgull.glb',
		flight: {
			mass: 4150, area: 29, span: 12.5, ar: 5.4, cl0: 0.13, clMax: 1.5, alphaStall: 15.5 * DEG, cd0: 0.0185, e: 0.88,
			power: 1550e3, eta: 0.83, thrustStatic: 26000, nMax: 6.6, rates: { pitch: 1.5, roll: 3.0, yaw: 0.45 },
			qRef: 3600, vne: 215,
		},
		armour: 1.2,
		guns: [
			gun( 'heavy', 2.6, - 0.05, 0.6, 400 ), gun( 'heavy', - 2.6, - 0.05, 0.6, 400 ),
			gun( 'heavy', 2.95, - 0.02, 0.55, 400 ), gun( 'heavy', - 2.95, - 0.02, 0.55, 400 ),
			gun( 'heavy', 3.3, 0.0, 0.5, 400 ), gun( 'heavy', - 3.3, 0.0, 0.5, 400 ),
		],
		gear: { main: [ 1.95, - 1.95, 0.75 ], tail: [ 0, - 0.6, - 6.7 ], track: 1.95, retract: 'back' },
		length: 10.2, prop: [ 0, 0.05, 4.35 ], propRadius: 2.0,
		seat: [ 0, - 0.43, - 1.3 ], eye: [ 0, 0.86, - 1.25 ], sight: [ 0, 0.88, - 0.52 ],
		parts: {
			engine: [ [ 0, 0.0, 3.25, 0.82 ], [ 0, 0.0, 2.2, 0.82 ] ],
			pilot: [ [ 0, 0.38, - 1.25, 0.42 ] ],
			fuselage: [ [ 0, 0, 0.6, 0.78 ], [ 0, 0, - 1.3, 0.7 ], [ 0, 0.05, - 3.3, 0.52 ] ],
			wingL: [ [ 1.7, - 0.45, 0.5, 0.85 ], [ 3.4, 0.0, 0.4, 0.75 ], [ 5.0, 0.25, 0.2, 0.6 ] ],
			wingR: [ [ - 1.7, - 0.45, 0.5, 0.85 ], [ - 3.4, 0.0, 0.4, 0.75 ], [ - 5.0, 0.25, 0.2, 0.6 ] ],
			tail: [ [ 0, 0.2, - 5.1, 0.48 ], [ 1.3, 0.1, - 5.3, 0.48 ], [ - 1.3, 0.1, - 5.3, 0.48 ], [ 0, 0.95, - 5.35, 0.45 ] ],
		},
		livery: { main: [ 0.16, 0.24, 0.38 ], trim: [ 0.72, 0.74, 0.76 ], band: [ 0.93, 0.93, 0.9 ] },
	},
	bulwark: {
		id: 'bulwark', name: 'Bulwark', price: 48000,
		sub: 'Radial-engine brawler: fastest, rolls quickest, armoured, four cannons',
		role: 'Boom and zoom', model: 'models/warbirds/Bulwark.glb',
		flight: {
			mass: 4000, area: 18.3, span: 10.5, ar: 6.0, cl0: 0.11, clMax: 1.42, alphaStall: 15 * DEG, cd0: 0.0215, e: 0.88,
			power: 1500e3, eta: 0.82, thrustStatic: 27500, nMax: 8, rates: { pitch: 1.4, roll: 4.4, yaw: 0.45 },
			qRef: 4600, vne: 230,
		},
		armour: 1.45,
		guns: [
			gun( 'heavy', 0.32, 0.62, 2.1, 450 ), gun( 'heavy', - 0.32, 0.62, 2.1, 450 ),
			gun( 'cannon', 1.45, - 0.3, 0.6, 125 ), gun( 'cannon', - 1.45, - 0.3, 0.6, 125 ),
			gun( 'cannon', 2.6, - 0.22, 0.45, 125 ), gun( 'cannon', - 2.6, - 0.22, 0.45, 125 ),
		],
		gear: { main: [ 1.75, - 1.7, 0.6 ], tail: [ 0, - 0.5, - 6.0 ], track: 1.75, retract: 'in' },
		length: 9.0, prop: [ 0, 0.0, 4.1 ], propRadius: 1.65,
		seat: [ 0, - 0.43, - 0.8 ], eye: [ 0, 0.86, - 0.75 ], sight: [ 0, 0.88, - 0.05 ],
		parts: {
			engine: [ [ 0, 0.0, 3.0, 0.9 ], [ 0, 0.0, 2.0, 0.85 ] ],
			pilot: [ [ 0, 0.38, - 0.75, 0.42 ] ],
			fuselage: [ [ 0, 0, 0.5, 0.78 ], [ 0, 0, - 1.5, 0.62 ], [ 0, 0.05, - 3.1, 0.5 ] ],
			wingL: [ [ 1.4, - 0.3, 0.4, 0.8 ], [ 2.7, - 0.22, 0.3, 0.7 ], [ 4.0, - 0.12, 0.15, 0.55 ] ],
			wingR: [ [ - 1.4, - 0.3, 0.4, 0.8 ], [ - 2.7, - 0.22, 0.3, 0.7 ], [ - 4.0, - 0.12, 0.15, 0.55 ] ],
			tail: [ [ 0, 0.15, - 4.5, 0.45 ], [ 1.15, 0.05, - 4.7, 0.45 ], [ - 1.15, 0.05, - 4.7, 0.45 ], [ 0, 0.85, - 4.75, 0.42 ] ],
		},
		livery: { main: [ 0.5, 0.42, 0.3 ], trim: [ 0.32, 0.36, 0.28 ], band: [ 0.75, 0.2, 0.12 ] },
	},
	// ---- the crewed aircraft ("additional dogfighting planes for more players, like with 2-3-4 seats")
	kitewing: {
		id: 'kitewing', name: 'Kitewing', price: 58000, kind: 'crew',
		sub: 'Two-seat dive bomber: a rear gunner on twin guns, dive brakes and one bomb',
		role: 'Dive bomber', model: 'models/warbirds/Kitewing.glb',
		flight: {
			mass: 4300, area: 32, span: 13.6, ar: 5.8, cl0: 0.14, clMax: 1.4, alphaStall: 15.5 * DEG, cd0: 0.024, e: 0.85,
			power: 1250e3, eta: 0.8, thrustStatic: 23000, nMax: 5.5, rates: { pitch: 1.25, roll: 2.2, yaw: 0.4 }, qRef: 3200, vne: 190,
		},
		armour: 1.25, hp: 1.2,
		guns: [ gun( 'light', 2.7, - 0.35, 0.75, 500 ), gun( 'light', - 2.7, - 0.35, 0.75, 500 ) ],
		gear: { main: [ 1.6, - 2.0, 0.75 ], tail: [ 0, - 0.55, - 6.4 ], track: 1.6, retract: 'fixed' },
		length: 11.2, prop: [ 0, 0.1, 4.6 ], propRadius: 1.7,
		seat: [ 0, - 0.34, - 0.6 ], eye: [ 0, 0.95, - 0.55 ], sight: [ 0, 0.97, 0.15 ],
		seats: [
			seatAt( 'pilot', [ 0, 0.95, - 0.55 ] ),
			seatAt( 'gunner', [ 0, 0.92, - 2.35 ], Math.PI, { turret: { id: 'rear', at: [ 0, 0.72, - 2.95 ], rest: Math.PI, arc: { yaw: [ - 1.15, 1.15 ], pitch: [ - 0.3, 1.05 ] }, slew: 2.4,
				guns: [ tgun( 'light', 0.09, 0.04, 0.85, 900 ), tgun( 'light', - 0.09, 0.04, 0.85, 900 ) ] } } ),
		],
		bomb: { at: [ 0, - 1.2, 0.3 ], kg: 250, radius: 22, dmg: 220 },
		brakes: { cd: 0.07 },
		parts: {
			engine: [ [ 0, 0.05, 3.4, 0.85 ], [ 0, 0.05, 2.3, 0.82 ] ],
			pilot: [ [ 0, 0.45, - 0.55, 0.42 ] ],
			fuselage: [ [ 0, 0, 0.8, 0.85 ], [ 0, 0, - 1.2, 0.78 ], [ 0, 0.05, - 3.2, 0.62 ], [ 0, 0.1, - 4.7, 0.48 ] ],
			wingL: [ [ 1.6, - 0.5, 0.45, 1.0 ], [ 3.4, - 0.35, 0.3, 0.88 ], [ 5.4, - 0.2, 0.1, 0.65 ] ],
			wingR: [ [ - 1.6, - 0.5, 0.45, 1.0 ], [ - 3.4, - 0.35, 0.3, 0.88 ], [ - 5.4, - 0.2, 0.1, 0.65 ] ],
			tail: [ [ 0, 0.2, - 5.7, 0.5 ], [ 1.4, 0.1, - 5.9, 0.5 ], [ - 1.4, 0.1, - 5.9, 0.5 ], [ 0, 1.0, - 6.0, 0.5 ] ],
		},
		livery: { main: [ 0.38, 0.4, 0.3 ], trim: [ 0.62, 0.66, 0.7 ], band: [ 0.95, 0.85, 0.3 ] },
	},
	seawarden: {
		id: 'seawarden', name: 'Seawarden', price: 72000, kind: 'crew',
		sub: 'Three-seat torpedo and patrol bomber: a dorsal turret, a radio operator who spots and patches',
		role: 'Patrol bomber', model: 'models/warbirds/Seawarden.glb',
		flight: {
			mass: 6300, area: 42, span: 15.8, ar: 6.0, cl0: 0.15, clMax: 1.38, alphaStall: 15 * DEG, cd0: 0.025, e: 0.85,
			power: 1550e3, eta: 0.81, thrustStatic: 31000, nMax: 4.2, rates: { pitch: 1.0, roll: 1.6, yaw: 0.35 }, qRef: 3000, vne: 178,
		},
		armour: 1.35, hp: 1.45,
		guns: [ gun( 'heavy', 3.0, - 0.35, 0.95, 400 ), gun( 'heavy', - 3.0, - 0.35, 0.95, 400 ) ],
		gear: { main: [ 2.3, - 2.3, 0.9 ], tail: [ 0, - 0.65, - 7.0 ], track: 2.3, retract: 'back' },
		length: 12.6, prop: [ 0, 0.1, 5.0 ], propRadius: 2.0,
		seat: [ 0, - 0.17, 0.35 ], eye: [ 0, 1.12, 0.4 ], sight: [ 0, 1.14, 1.1 ],
		seats: [
			seatAt( 'pilot', [ 0, 1.12, 0.4 ] ),
			seatAt( 'gunner', [ 0, 1.38, - 2.75 ], Math.PI, { turret: { id: 'dorsal', at: [ 0, 1.2, - 2.75 ], rest: Math.PI, arc: { yaw: [ - 2.7, 2.7 ], pitch: [ - 0.08, 1.3 ] }, slew: 1.9,
				guns: [ tgun( 'heavy', 0.13, 0.05, 0.95, 600 ), tgun( 'heavy', - 0.13, 0.05, 0.95, 600 ) ] } } ),
			seatAt( 'radio', [ 0, 0.98, - 1.25 ] ),
		],
		parts: {
			engine: [ [ 0, 0.1, 3.7, 0.95 ], [ 0, 0.1, 2.5, 0.92 ] ],
			pilot: [ [ 0, 0.62, 0.4, 0.45 ] ],
			fuselage: [ [ 0, 0, 1.1, 0.95 ], [ 0, 0, - 1.0, 0.92 ], [ 0, 0.05, - 3.0, 0.75 ], [ 0, 0.1, - 5.0, 0.55 ] ],
			wingL: [ [ 1.9, - 0.5, 0.65, 1.1 ], [ 4.0, - 0.3, 0.45, 0.98 ], [ 6.4, - 0.1, 0.2, 0.75 ] ],
			wingR: [ [ - 1.9, - 0.5, 0.65, 1.1 ], [ - 4.0, - 0.3, 0.45, 0.98 ], [ - 6.4, - 0.1, 0.2, 0.75 ] ],
			tail: [ [ 0, 0.25, - 6.2, 0.55 ], [ 1.7, 0.15, - 6.4, 0.55 ], [ - 1.7, 0.15, - 6.4, 0.55 ], [ 0, 1.15, - 6.5, 0.55 ] ],
		},
		livery: { main: [ 0.3, 0.4, 0.44 ], trim: [ 0.8, 0.82, 0.82 ], band: [ 0.9, 0.42, 0.12 ] },
	},
	longreach: {
		id: 'longreach', name: 'Longreach', price: 96000, kind: 'crew',
		sub: 'Four-seat twin-engine medium bomber: nose and top turrets, a flight engineer who keeps her flying',
		role: 'Medium bomber', model: 'models/warbirds/Longreach.glb',
		flight: {
			mass: 11000, area: 62, span: 20.5, ar: 6.8, cl0: 0.15, clMax: 1.42, alphaStall: 14.5 * DEG, cd0: 0.027, e: 0.83,
			power: 2750e3, eta: 0.81, thrustStatic: 64000, nMax: 3.8, rates: { pitch: 0.8, roll: 1.1, yaw: 0.3 }, qRef: 3000, vne: 172,
		},
		armour: 1.5, hp: 2.0,
		guns: [],
		gear: { main: [ 3.4, - 2.5, 1.6 ], tail: [ 0, - 0.75, - 8.2 ], track: 3.4, retract: 'back' },
		length: 15.8, prop: [ 3.4, - 0.05, 3.7 ], propRadius: 1.9,
		props: [ [ 3.4, - 0.05, 3.7 ], [ - 3.4, - 0.05, 3.7 ] ],
		engines: [ { part: 'engineL', at: [ 3.4, - 0.05, 3.7 ] }, { part: 'engineR', at: [ - 3.4, - 0.05, 3.7 ] } ],
		seat: [ 0.35, - 0.04, 2.95 ], eye: [ 0.35, 1.25, 3.0 ], sight: [ 0.35, 1.27, 3.7 ],
		seats: [
			seatAt( 'pilot', [ 0.35, 1.25, 3.0 ] ),
			seatAt( 'engineer', [ - 0.4, 1.18, 2.1 ] ),
			seatAt( 'gunner', [ 0, 0.45, 5.9 ], 0, { turret: { id: 'nose', at: [ 0, 0.25, 6.75 ], rest: 0, arc: { yaw: [ - 0.8, 0.8 ], pitch: [ - 0.7, 0.4 ] }, slew: 2.0,
				guns: [ tgun( 'heavy', 0, 0, 0.7, 700 ) ] } } ),
			seatAt( 'gunner', [ 0, 1.58, - 0.6 ], Math.PI, { turret: { id: 'top', at: [ 0, 1.4, - 0.6 ], rest: Math.PI, arc: { yaw: [ - 2.75, 2.75 ], pitch: [ - 0.06, 1.3 ] }, slew: 1.8,
				guns: [ tgun( 'heavy', 0.14, 0.06, 1.0, 650 ), tgun( 'heavy', - 0.14, 0.06, 1.0, 650 ) ] } } ),
		],
		parts: {
			engineL: [ [ 3.4, - 0.1, 2.5, 0.9 ], [ 3.4, - 0.1, 1.3, 0.85 ] ],
			engineR: [ [ - 3.4, - 0.1, 2.5, 0.9 ], [ - 3.4, - 0.1, 1.3, 0.85 ] ],
			pilot: [ [ 0.35, 1.3, 3.0, 0.45 ] ],
			fuselage: [ [ 0, 0, 5.0, 0.95 ], [ 0, 0.05, 2.6, 1.08 ], [ 0, 0.05, 0.0, 1.05 ], [ 0, 0.05, - 2.6, 0.9 ], [ 0, 0.1, - 5.2, 0.68 ] ],
			wingL: [ [ 1.9, - 0.2, 1.4, 1.15 ], [ 5.2, 0.0, 1.0, 1.05 ], [ 8.2, 0.2, 0.6, 0.85 ] ],
			wingR: [ [ - 1.9, - 0.2, 1.4, 1.15 ], [ - 5.2, 0.0, 1.0, 1.05 ], [ - 8.2, 0.2, 0.6, 0.85 ] ],
			tail: [ [ 0, 0.35, - 7.6, 0.6 ], [ 1.6, 0.3, - 7.9, 0.65 ], [ - 1.6, 0.3, - 7.9, 0.65 ], [ 2.6, 1.0, - 8.1, 0.65 ], [ - 2.6, 1.0, - 8.1, 0.65 ] ],
		},
		livery: { main: [ 0.36, 0.38, 0.27 ], trim: [ 0.66, 0.69, 0.7 ], band: [ 0.82, 0.78, 0.66 ] },
	},
};

// every airframe the same shape: its seats (a fighter: the pilot's alone), its propellers and engines, the turrets
for ( const W of Object.values( WARBIRDS ) ) {

	W.kind = W.kind || 'fighter';
	W.hp = W.hp || 1;
	if ( ! W.seats ) W.seats = [ { role: 'pilot', seat: W.seat, eye: W.eye, face: 0 } ];
	if ( ! W.props ) W.props = [ W.prop ];
	if ( ! W.engines ) W.engines = [ { part: 'engine', at: W.prop } ];
	W.turrets = W.seats.map( ( s, i ) => ( s.turret ? { ...s.turret, seat: i } : null ) ).filter( Boolean );
	W.crew = W.seats.length;

}
export const WARBIRD_IDS = Object.keys( WARBIRDS );

// the damage parts (Damage.js) and what a part's hit points are on every airframe (x armour)
// (a twin's engines are engineL / engineR; a bigger airframe has more of each: W.hp)
export const PARTS = [ 'engine', 'wingL', 'wingR', 'tail', 'fuselage', 'pilot', 'engineL', 'engineR' ];
export const PART_HP = { engine: 100, wingL: 110, wingR: 110, tail: 90, fuselage: 140, pilot: 60, engineL: 110, engineR: 110 };
export const PART_NAMES = { engine: 'Engine', wingL: 'Left wing', wingR: 'Right wing', tail: 'Tail', fuselage: 'Fuselage', pilot: 'Pilot', engineL: 'Left engine', engineR: 'Right engine' };
export const ROLE_NAMES = { pilot: 'Pilot', gunner: 'Gunner', radio: 'Radio operator', engineer: 'Flight engineer' };
// the fighters and the crewed aircraft, in hangar order
export const FIGHTER_IDS = [ 'sabrewing', 'stormgull', 'bulwark' ];
export const CREWED_IDS = [ 'kitewing', 'seawarden', 'longreach' ];

// the economy (new players start with $100,000): a rebuild after a loss, a repair per point, a rearm
// flaps: they go down with the undercarriage (more lift at the same angle, a little drag)
export const FLAPS = { cl: 0.25, cd: 0.012 };
export const COSTS = { rebuild: 0.18, repairPerHp: 9, rearm: 180, ferry: 400, raiderBounty: 1500 };
// the fighter line at the airstrips: Tidemark and Meridian (WORLD.<island>.airstrip)
export const STRIPS = [ 'tidemark', 'meridian' ];

export function warbird( id ) {

	return WARBIRDS[ id ] || null;

}

// the sum of every gun's damage per second (the host's damage budget for a shooter)
export function gunDps( id ) {

	const W = WARBIRDS[ id ];
	if ( ! W ) return 0;
	let d = W.guns.reduce( ( a, g ) => a + g.rof * g.dmg, 0 );
	for ( const t of W.turrets ) d = Math.max( d, t.guns.reduce( ( a, g ) => a + g.rof * g.dmg, 0 ) );
	return d;

}

// stall speed (m/s) at sea level in level flight: what the airframe needs on its wings
export function stallSpeed( id, rho = RHO0 ) {

	const F = WARBIRDS[ id ].flight;
	return Math.sqrt( 2 * F.mass * G0 / ( rho * F.area * F.clMax ) );

}

// corner speed: the slowest speed the pilot can pull nMax at (the best instantaneous turn)
export function cornerSpeed( id, rho = RHO0 ) {

	return stallSpeed( id, rho ) * Math.sqrt( WARBIRDS[ id ].flight.nMax );

}

// the rebuild price after a loss and the repair price of the missing hit points
export function rebuildPrice( id ) {

	const W = WARBIRDS[ id ];
	return W ? Math.round( W.price * COSTS.rebuild / 50 ) * 50 : 0;

}
