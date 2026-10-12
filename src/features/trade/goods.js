import { WORLD } from '../../world/WorldLayout.js';

// Merchant trade: the static tables. Plain data, no engine and no DOM, so the market model, the panel and the
// tests all read the same numbers.
//
// Every port in WORLD.ports has a market (read dynamically: syncPorts() adds the ports that land later, islands
// 5-8 included). Home (the village harbour) makes ice, salt, rope, rum and iron tools; Pons Cove grows timber,
// coconuts, tobacco and weaves sailcloth; Gull Rock digs guano and keeps black powder for the light's signal guns;
// Saltmarsh Key renders lamp oil and cures salt fish. A "unit" of a good is what you buy and sell (a block, a
// sack, a coil...); it fills `crates` slots of the hold (timber bundles are bulky: 2).
//
//   GOODS[ id ]   { name, unit, base ($ per unit at a price of 1.0), crates, kg, perish (fraction of value lost per
//                   in-game hour in the hold), depth (units that move the price by a factor e at a port of size 1),
//                   recover (hours for a trade's price push to fade by a factor e), color, note,
//                   cat (category), tags, origin / demand (port ids that make / want it) }
//   LEGALITY[ good ]          { port: 'contraband', default } where a good may not be traded openly (smuggler only)
//   REGION[ port ][ good ]    price multiplier of the port (cheap where it is made, dear where it is wanted)
//   HOLD_CRATES[ boat ]       crates of cargo a boat carries, independent from the fish cooler (no boat: on foot)
//   EVENTS                    market event templates (storms, festivals, gluts); CAUSES the world-caused ones

export const PORT_IDS = [ 'home', 'pons', 'gull', 'key' ];

export const PORTS = {
	home: { id: 'home', name: 'Home', title: 'Home harbour market', size: 1.4 },
	pons: { id: 'pons', name: 'Pons Cove', title: 'Pons Cove market', size: 1.0 },
	gull: { id: 'gull', name: 'Gull Rock', title: 'Gull Rock lighthouse store', size: 0.6 },
	key: { id: 'key', name: 'Saltmarsh Key', title: 'Saltmarsh Key landing', size: 0.75 },
};

export const GOODS = {
	ice: { name: 'Block ice', unit: 'block', base: 16, crates: 1, kg: 40, perish: 0.03, depth: 30, recover: 4, color: '#9fd8ee', note: 'Cut at the Home ice house. Melts in the hold.', cat: 'provisions', tags: [ 'perishable' ], origin: [ 'home' ], demand: [ 'pons', 'gull', 'key' ] },
	salt: { name: 'Sea salt', unit: 'sack', base: 10, crates: 1, kg: 30, perish: 0, depth: 44, recover: 7, color: '#e9e4d4', note: 'Raked from the Home salt pans.', cat: 'provisions', tags: [], origin: [ 'home', 'key' ], demand: [ 'pons' ] },
	rope: { name: 'Hemp rope', unit: 'coil', base: 22, crates: 1, kg: 25, perish: 0.0015, depth: 30, recover: 7, color: '#c9a86a', note: 'Twisted at the Home rope walk.', cat: 'naval', tags: [], origin: [ 'home' ], demand: [ 'pons', 'gull', 'key' ] },
	rum: { name: 'Cane rum', unit: 'cask', base: 34, crates: 1, kg: 35, perish: 0, depth: 22, recover: 8, color: '#b5642f', note: 'Distilled at Home; Pons drinks it.', cat: 'luxury', tags: [ 'drink' ], origin: [ 'home' ], demand: [ 'pons', 'gull' ] },
	timber: { name: 'Palm timber', unit: 'bundle', base: 40, crates: 2, kg: 90, perish: 0.001, depth: 18, recover: 9, color: '#8a6a43', note: 'Felled on Pons. Bulky: two crates a bundle.', cat: 'raw', tags: [ 'bulky' ], origin: [ 'pons' ], demand: [ 'home', 'gull' ] },
	coconuts: { name: 'Coconuts', unit: 'sack', base: 11, crates: 1, kg: 28, perish: 0.005, depth: 38, recover: 5, color: '#6e8a3c', note: 'Pons groves. They keep a few days.', cat: 'provisions', tags: [ 'perishable' ], origin: [ 'pons' ], demand: [ 'home', 'gull' ] },
	spices: { name: 'Spices', unit: 'chest', base: 58, crates: 1, kg: 14, perish: 0.001, depth: 15, recover: 10, color: '#d9812b', note: 'Traders drop them at Pons first.', cat: 'luxury', tags: [], origin: [ 'pons' ], demand: [ 'home', 'key' ] },
	pearls: { name: 'Pearls', unit: 'pouch', base: 120, crates: 1, kg: 2, perish: 0, depth: 11, recover: 13, color: '#f0eaf6', note: 'Pons divers. Small, dear, and the market is thin.', cat: 'luxury', tags: [ 'valuable' ], origin: [ 'pons', 'key' ], demand: [ 'home' ] },
	cloth: { name: 'Sailcloth', unit: 'bolt', base: 30, crates: 1, kg: 20, perish: 0, depth: 26, recover: 8, color: '#e6dcc0', note: 'Woven in the Pons lofts. Every harbour mends sails.', cat: 'naval', tags: [], origin: [ 'pons' ], demand: [ 'gull', 'key' ] },
	tools: { name: 'Iron tools', unit: 'crate', base: 48, crates: 1, kg: 45, perish: 0, depth: 20, recover: 9, color: '#7d8a90', note: 'Forged at Home. The islets have no smithy.', cat: 'manufactured', tags: [ 'heavy' ], origin: [ 'home' ], demand: [ 'gull', 'key' ] },
	oil: { name: 'Lamp oil', unit: 'cask', base: 26, crates: 1, kg: 32, perish: 0, depth: 26, recover: 7, color: '#d8b24a', note: 'Rendered at Saltmarsh Key. The Gull Rock light burns it every night.', cat: 'provisions', tags: [], origin: [ 'key' ], demand: [ 'gull' ] },
	saltfish: { name: 'Salt fish', unit: 'barrel', base: 24, crates: 1, kg: 40, perish: 0.004, depth: 30, recover: 6, color: '#b9a184', note: 'Cured at Saltmarsh Key from the flats catch.', cat: 'provisions', tags: [ 'perishable' ], origin: [ 'key' ], demand: [ 'gull', 'pons' ] },
	guano: { name: 'Guano', unit: 'sack', base: 9, crates: 1, kg: 35, perish: 0, depth: 40, recover: 6, color: '#cfc6a8', note: 'Dug on Gull Rock. The Pons farms pay for it.', cat: 'raw', tags: [], origin: [ 'gull' ], demand: [ 'pons', 'home' ] },
	tobacco: { name: 'Tobacco', unit: 'bale', base: 44, crates: 1, kg: 22, perish: 0.0005, depth: 18, recover: 9, color: '#8c5a32', note: 'Pons leaf. Banned at Home and on Gull Rock, so it fetches a fortune there after dark.', cat: 'luxury', tags: [ 'restricted' ], origin: [ 'pons', 'key' ], demand: [ 'home', 'gull' ] },
	powder: { name: 'Black powder', unit: 'keg', base: 70, crates: 1, kg: 25, perish: 0, depth: 14, recover: 11, color: '#3a3a3a', note: 'Kept on Gull Rock for the signal guns. Contraband anywhere else.', cat: 'munitions', tags: [ 'restricted', 'dangerous' ], origin: [ 'gull' ], demand: [ 'home', 'pons', 'key' ] },
	relics: { name: 'Sunken relics', unit: 'chest', base: 160, crates: 1, kg: 18, perish: 0, depth: 9, recover: 14, color: '#c9a25a', note: 'Salvage from the wrecks. No harbour may buy them: only the smuggler deals.', cat: 'contraband', tags: [ 'contraband', 'valuable' ], origin: [], demand: [] },
};

export const GOOD_IDS = Object.keys( GOODS );

// where a good may not be bought or sold at the stall: the smuggler's trade, and customs seize it on arrival
export const LEGALITY = {
	tobacco: { home: 'contraband', gull: 'contraband', default: 'legal' },
	powder: { gull: 'legal', default: 'contraband' },
	relics: { default: 'contraband' },
};

export function legalAt( port, good ) {

	const L = LEGALITY[ good ];
	if ( ! L ) return true;
	const v = L[ port ] !== undefined ? L[ port ] : L.default;
	return v !== 'contraband';

}

// goods that are contraband at a port
export function contrabandAt( port ) {

	return GOOD_IDS.filter( ( g ) => ! legalAt( port, g ) );

}

// regional price multiplier: where a good is made it is cheap, where it is wanted it is dear
export const REGION = {
	home: { ice: 0.74, salt: 0.78, rope: 0.78, rum: 0.84, timber: 1.30, coconuts: 1.36, spices: 1.26, pearls: 1.36, cloth: 1.06, tools: 0.8, oil: 1.08, saltfish: 1.0, guano: 1.05, tobacco: 1.42, powder: 1.45, relics: 1.5 },
	pons: { ice: 1.34, salt: 1.30, rope: 1.30, rum: 1.34, timber: 0.78, coconuts: 0.72, spices: 0.80, pearls: 0.72, cloth: 0.8, tools: 1.02, oil: 1.12, saltfish: 1.12, guano: 1.3, tobacco: 0.76, powder: 1.35, relics: 1.5 },
	gull: { ice: 1.38, salt: 1.12, rope: 1.28, rum: 1.36, timber: 1.42, coconuts: 1.3, spices: 1.1, pearls: 1.0, cloth: 1.3, tools: 1.32, oil: 1.48, saltfish: 1.28, guano: 0.6, tobacco: 1.5, powder: 0.68, relics: 1.5 },
	key: { ice: 1.4, salt: 0.84, rope: 1.24, rum: 1.12, timber: 1.24, coconuts: 1.02, spices: 1.22, pearls: 0.86, cloth: 1.2, tools: 1.34, oil: 0.66, saltfish: 0.66, guano: 1.12, tobacco: 0.86, powder: 1.42, relics: 1.5 },
};

// a port that lands later (islands 5-8): its market is derived from the goods' origin / demand and a hash of its
// id, so it is stable between sessions without a table entry
const hash = ( s ) => {

	let h = 2166136261;
	for ( let i = 0; i < s.length; i ++ ) h = Math.imul( h ^ s.charCodeAt( i ), 16777619 );
	return h >>> 0;

};

export function deriveRegion( port ) {

	const out = {};
	let h = hash( port );
	for ( const g of GOOD_IDS ) {

		const G = GOODS[ g ];
		h = Math.imul( h ^ ( h >>> 13 ), 0x5bd1e995 ) >>> 0;
		const r = ( h % 1000 ) / 1000;
		out[ g ] = G.origin.includes( port ) ? 0.72 : G.demand.includes( port ) ? 1.32 : Math.round( ( 0.82 + r * 0.5 ) * 100 ) / 100;

	}

	return out;

}

// add any WORLD.ports entry that has no market yet (mutates PORT_IDS / PORTS / REGION in place, so every importer
// sees it); returns true when something was added
export function syncPorts() {

	let added = false;
	const list = Array.isArray( WORLD.ports ) ? WORLD.ports : [];
	for ( const wp of list ) {

		if ( ! wp || typeof wp.id !== 'string' || ! wp.id ) continue;
		if ( ! PORTS[ wp.id ] ) {

			const name = typeof wp.name === 'string' && wp.name ? wp.name : wp.id;
			PORTS[ wp.id ] = { id: wp.id, name, title: `${ name } market`, size: 0.8 };
			added = true;

		}

		if ( ! REGION[ wp.id ] ) REGION[ wp.id ] = deriveRegion( wp.id );
		if ( ! PORT_IDS.includes( wp.id ) ) {

			PORT_IDS.push( wp.id );
			added = true;

		}

	}

	return added;

}

syncPorts();

// the WORLD.ports entry of a market (null for a port without one)
export function worldPort( id ) {

	return ( WORLD.ports || [] ).find( ( p ) => p && p.id === id ) || null;

}

// where a port's boats tie up, as { x, z } (home: the pier head berth)
export function dockOf( id ) {

	const wp = worldPort( id );
	const d = wp && wp.dock && wp.dock.position;
	if ( d ) return { x: d.x, z: d.z };
	if ( id === 'home' ) return { x: WORLD.boatDock.position.x, z: WORLD.boatDock.position.z };
	return null;

}

// sea distance between two ports' docks, metres: the straight line plus a tenth for rounding headlands and reefs
// (Home to Pons: about 700 m)
export function seaDistance( a, b ) {

	if ( a === b ) return 0;
	const p = dockOf( a ), q = dockOf( b );
	if ( ! p || ! q ) return SEA_DISTANCE;
	return Math.hypot( p.x - q.x, p.z - q.z ) * 1.1;

}

// market tuning
export const MARKET = {
	spread: 0.035, // the stall buys 3.5% under and sells 3.5% over the middle price
	xMax: 1.0, // the trade push on the log price is held within +-1.0 (a factor of 2.7)
	noiseTau: 22, // hours: the slow drift around the equilibrium returns to it with this time constant
	noiseStd: 0.07, // stationary spread of that drift (log price), about 7%
	histStep: 2, // hours between the points of the sparkline
	histLen: 24, // points kept (two days)
	warmHours: 48, // hours simulated before day 1 so the sparklines already have a past
	maxLot: 60, // most units in one purchase
	newsKeep: 24,
	staleHours: 24, // a price seen longer ago than this is flagged as stale in the panel
};

// crates of cargo by boat id (BOATS in game/Boats.js); the cooler's kilograms are a separate matter
export const HOLD_CRATES = { foot: 2, skiff: 4, canoe: 5, cutter: 8, launch: 11, lobster: 20, sloop: 16, trawler: 30, brigantine: 44 }; // the ships carry the most

// typical speed in m/s, only used to estimate the voyage (and so the spoilage) in the panel
export const BOAT_SPEED = { foot: 0.9, skiff: 2.4, canoe: 3.0, cutter: 5.0, launch: 7.5, lobster: 9.0, sloop: 8.5, trawler: 6.5, brigantine: 7.5 };

// sea distance between Home and Pons, metres (the straight line is about 635 m; boats go round the reef)
export const SEA_DISTANCE = 700;

// market events: a few per in-game week. mult scales the price at the named ports while the event lasts (it
// eases in over 3 h and out over the last 6 h); dur is [ min, max ] hours; {pct} is filled from mult.
export const EVENTS = [
	{ id: 'wreck', text: 'Storm wrecked a supply ship: timber {pct} at Home', good: 'timber', ports: [ 'home' ], mult: 1.6, dur: [ 28, 44 ], weight: 1.2 },
	{ id: 'festival', text: 'Festival at Pons: rum demand {pct} at Pons', good: 'rum', ports: [ 'pons' ], mult: 1.5, dur: [ 18, 30 ], weight: 1.2 },
	{ id: 'saltGlut', text: 'Salt pans overflowing, a glut: salt {pct} at Home', good: 'salt', ports: [ 'home' ], mult: 0.6, dur: [ 24, 40 ], weight: 1 },
	{ id: 'heat', text: 'Heat wave, everyone wants ice: ice {pct} at both ports', good: 'ice', ports: [ 'home', 'pons' ], mult: 1.7, dur: [ 18, 28 ], weight: 1 },
	{ id: 'pearlBed', text: 'Divers found a rich bed: pearls {pct} at Pons', good: 'pearls', ports: [ 'pons' ], mult: 0.65, dur: [ 24, 40 ], weight: 0.8 },
	{ id: 'boatyard', text: 'Boatyard rush: rope {pct} at Home', good: 'rope', ports: [ 'home' ], mult: 1.45, dur: [ 20, 34 ], weight: 1 },
	{ id: 'spiceShip', text: 'Spice ship in the harbour, a glut: spices {pct} at Home', good: 'spices', ports: [ 'home' ], mult: 0.65, dur: [ 20, 32 ], weight: 0.8 },
	{ id: 'curing', text: 'Curing season at Pons: salt {pct} at Pons', good: 'salt', ports: [ 'pons' ], mult: 1.4, dur: [ 24, 36 ], weight: 1 },
	{ id: 'copra', text: 'Copra schooner unloads, a glut: coconuts {pct} at Home', good: 'coconuts', ports: [ 'home' ], mult: 0.7, dur: [ 20, 32 ], weight: 0.9 },
	{ id: 'gale', text: 'Gale warning, Pons boards up: timber {pct} at Pons', good: 'timber', ports: [ 'pons' ], mult: 1.5, dur: [ 18, 30 ], weight: 0.9 },
	{ id: 'dinner', text: 'Governor\'s dinner at Home: spices {pct} at Home', good: 'spices', ports: [ 'home' ], mult: 1.5, dur: [ 16, 26 ], weight: 0.8 },
	{ id: 'longNight', text: 'Long nights at the light: lamp oil {pct} on Gull Rock', good: 'oil', ports: [ 'gull' ], mult: 1.5, dur: [ 20, 34 ], weight: 0.8 },
	{ id: 'flatsRun', text: 'A big run on the flats: salt fish {pct} at Saltmarsh Key', good: 'saltfish', ports: [ 'key' ], mult: 0.65, dur: [ 20, 30 ], weight: 0.8 },
	{ id: 'planting', text: 'Planting season: guano {pct} at Pons', good: 'guano', ports: [ 'pons' ], mult: 1.55, dur: [ 24, 40 ], weight: 0.8 },
	{ id: 'sailLoft', text: 'Sail loft fire at Pons: sailcloth {pct} at Pons', good: 'cloth', ports: [ 'pons' ], mult: 1.6, dur: [ 20, 32 ], weight: 0.6 },
	{ id: 'smithy', text: 'The Home smithy is cold for a week: iron tools {pct} at Home', good: 'tools', ports: [ 'home' ], mult: 1.45, dur: [ 24, 40 ], weight: 0.6 },
];

// events with a cause in the world (weather, a sunk ship, a rival's cargo): never drawn at random, started by
// trade/index.js from features events with forceEvent( id, { ports, good? } )
export const CAUSES = [
	{ id: 'stormShoal', text: 'Storm closes the shoals: salt fish {pct} everywhere', good: 'saltfish', ports: [ 'home', 'pons', 'gull', 'key' ], mult: 1.35, dur: [ 10, 18 ], weight: 0, cause: 'storm' },
	{ id: 'stormIce', text: 'Storm cuts the ice runs: ice {pct} at the islets', good: 'ice', ports: [ 'gull', 'key' ], mult: 1.4, dur: [ 10, 18 ], weight: 0, cause: 'storm' },
	{ id: 'merchantLost', text: 'A merchant went down with her cargo: {good} {pct} at {port}', good: 'spices', ports: [ 'home' ], mult: 1.45, dur: [ 20, 36 ], weight: 0, cause: 'shipSunk' },
	{ id: 'piratesSunk', text: 'Pirates sunk off the islands, the lanes are safe: powder {pct} at Gull Rock', good: 'powder', ports: [ 'gull' ], mult: 0.8, dur: [ 16, 28 ], weight: 0, cause: 'shipSunk' },
	{ id: 'rivalGlut', text: '{rival} unloaded a hold of {good}: {good} {pct} at {port}', good: 'rum', ports: [ 'pons' ], mult: 0.8, dur: [ 12, 20 ], weight: 0, cause: 'rival' },
	{ id: 'seizure', text: 'Customs burned a seized cargo of {good}: {good} {pct} at {port}', good: 'tobacco', ports: [ 'pons' ], mult: 1.3, dur: [ 12, 24 ], weight: 0, cause: 'customs' },
];
