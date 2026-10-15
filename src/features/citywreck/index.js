// The destructible city (wave 21C): Meridian's buildings (21A's plan and building handles, w21-common.md) take hits from
// cannon (ships offshore, shore batteries), bombs, fire bottles, car explosions and plane crashes (low and midrise only),
// and go through the stages 1 scarred (scorch marks, broken windows), 2 gutted (fire through the floors, a breached facade,
// a smoke column) and 3 collapsed (low and midrises: a progressive collapse of rigid chunks into a rubble heap, dust,
// falling debris on what stands near, rubble on the road: roadBlocked). Highrises breach and burn, never fall.
// The skyscrapers (wave 23A, Meridian's skyline: Skyline.js) take far more and do more: fire climbs them floor by floor
// (glowing bands, flames on the floors alight), a hit high on a badly damaged one breaks the section above it off (it
// tips over and falls beside the tower: rubble, blocked roads, what it lands on smashed; the roofs and helipads above the
// break gone), and a full fall leaves a wide rubble field; at most two falls (collapses or sections) animate at once.
//
// Fire spreads between adjacent low buildings in dry weather (weather.rain < 0.15); rain slows it and puts it out; the fire
// crews arrive CREW.respond s after the call (event cityFireCall: a fire engine can answer it) and douse two fires at once.
// Repairs: an hour after the last hit and the fire out, scaffolding (rubble cleared first, the road reopens), over in-game
// hours by stage (6 / 24 / 48 + 8). The city's mood (calm / uneasy / panic) closes shops; the local player's damage raises
// the city's wanted level (0..5); the repair bills go on the notice board (bulletin) with the player's share.
//
//   features.add( 'citywreck', citywreck );            // import * as citywreck from './features/citywreck/index.js'
//   const cw = features.get( 'citywreck' );
//   cw.attach( meridian )      (found by itself: app.meridian / app.ports.meridian; sets meridian.onStage, the looks hook)
//   cw.raycastSegment( ax, ay, az, bx, by, bz ) -> { t, id, x, y, z, building: true } | null   (cannonballs: naval patch)
//   cw.stage( id ) 0..3   cw.shopOpen( id )   cw.seatOpen( seat )   cw.blockedEdges() -> Set   cw.mood   cw.wanted() 0..5
//   cw.bulletin( port ) -> [ text ]   cw.payDamages() -> $   cw.info()   cw.model (Model.js)   update / toJSON / fromJSON / reset / dispose
//
// Listens: cannonballImpact (hit 'prop' with a building id from the raycast: a direct hit; else a ball landing within 2 m of
// a facade), explosion { x, y, z, radius, energy, by } (bombs, powder, cars: by 'car'), planeCrashed { x, y, z, speed, mass? },
// firePool { id, x, y, z, by } (weapons patch; the weapons' fire pools are polled without it), remoteWorldEvent cityStages,
// hostRequest cityHit / citySnap.
// Emits: buildingDamaged { id, stage, previous, by, x, z, kind, remote, replay }, buildingCollapsed { id, x, y, z, w, d, h, by },
//   buildingDestroyed { id, building (its interior's id), port, stage } / buildingRespawned { id, building, port } (interiors),
//   buildingRepaired { id, cost }, cityFire { id, x, z, on }, cityFireCall { id, x, z, at }, cityCrew { id, on },
//   cityFireSpread { from, to }, cityRepair { id, phase, due }, roadBlocked { id, edges, x, z, radius } / roadCleared { id, edges },
//   cityDebris { id, x, y, z, radius, energy (J) }, cityMood { mood, previous }, cityWanted { level, previous, heat },
//   towerMarked { id, marks } (cosmetic), (wave 23A) buildingSectionFell { id, x, z (where it landed), y, cut, radius, by,
//   remote, replay }, cityFireFloors { id, lo, hi } (a skyscraper's floors alight; -1 out).
// Multiplayer: the host owns the stages. Guests' bombs, fire pools, car blasts and crashes go to the host
// (netsync.askHost 'cityHit'); the host streams changes as world event 'cityStages' { s: [ [ id, stage, fire%, phase ] ] }
// (batched every NET.flush s) and answers a guest's 'citySnap' with the whole damaged city. Cannon balls fly on the host.
// Save: { v, hours, unrest, ledger, b: [ [ id, stage, fire, phase, dmg, start, due, cleared, marks, ( towers: cut, lo, hi ) ] ],
// heat } (the stream's entries: [ id, stage, fire%, phase, ( towers: cut, lo, hi ) ]); the old Twins' ids load onto the towers
// on their spots.
// Options: install( app, features, { city, plan, render: false, phone, seed } ).

import { CityWreck } from './CityWreck.js';

export function install( app, features, opts = {} ) {

	return new CityWreck( app, features, opts );

}

export { CityWreck } from './CityWreck.js';
export { CityModel } from './Model.js';
export { stubPlan, stubCity } from './StubCity.js';
export * as DATA from './CityWreckData.js';

export default { install };
