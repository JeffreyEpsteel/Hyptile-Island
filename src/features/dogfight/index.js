// Dogfight (wave 26A): WW2-style warbirds, single seat and crewed, for air combat between players (both armed) and
// practice against drones and Blackwater's raiders. See Dogfight.js for the interface, the keys and the events.
//
//   features.add( 'dogfight', dogfight );   // import * as dogfight from './features/dogfight/index.js'
//   const df = features.get( 'dogfight' );  df.decorateState( out )  (netsync: the state's df / dc / chute)

import { Dogfight } from './Dogfight.js';

export function install( app, features, opts = {} ) {

	return new Dogfight( app, features, opts );

}

export { Dogfight, ID } from './Dogfight.js';
export { WARBIRDS, WARBIRD_IDS, FIGHTER_IDS, CREWED_IDS, PARTS, PART_HP, COSTS, GUN_KINDS, gunDps, stallSpeed, cornerSpeed, rebuildPrice } from './Warbirds.js';
export { FighterFlight } from './FighterFlight.js';
export { Guns, Bullets, aimPoint, leadPoint, segmentSphere, hitParts, CONVERGENCE } from './Guns.js';
export { Damage, FIRE } from './Damage.js';
export { canHit, ArmSwitch, ARM } from './Consent.js';
export { Aircraft } from './Aircraft.js';
export { Seats, Turret, TurretGuns, CrewSystems, AIGunner, turretQuat, aimAngles, clampArc, blocked, SYS } from './Crew.js';
export { AIPilot } from './AI.js';
export { DogfightNet, NET, cleanDf, cleanDc, sampleSnaps } from './Net.js';
export { lineSlots, stripOf, deskAt, LINE } from './Site.js';

export default { install };
