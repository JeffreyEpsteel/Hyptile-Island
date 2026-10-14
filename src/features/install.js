// The v2 feature modules installed into the game (see Features.js and docs/PLAN.md "v2").
// Add a module here once it is integrated; each lives in its own folder under src/features/.
import { Features } from './Features.js';
import { WORLD } from '../world/WorldLayout.js';
import * as trade from './trade/index.js';
import * as weather from './weather/index.js';
import * as notices from './notices/index.js';
import * as melee from './melee/index.js';
import * as naval from './naval/index.js';
import * as sfx from './sfx/index.js';
import * as boarding from './boarding/index.js';
import * as netsync from './netsync/index.js';
import * as dressing from './dressing/index.js';
import * as worldmap from './worldmap/index.js';
import * as vfx from './vfx/index.js';
import * as night from './night/index.js';
import * as story from './story/index.js';
import * as debugPanel from '../ui/DebugPanel.js';
import * as saveManager from '../ui/SaveManager.js';
import * as destruction from './destruction/index.js';
import * as pirates from './pirates/index.js';
import * as stronghold from './pirates/Stronghold.js';
import * as harbour from './harbour/index.js';
import * as agents from './agents/index.js';
import * as crafting from './crafting/index.js';
import * as inverted from './inverted/index.js';
import * as life from './life/index.js';
import * as exploration from './exploration/index.js';
import * as seaplane from './seaplane/index.js';
import * as customs from './customs/index.js';
import * as death from './death/index.js';
import * as firearms from './firearms/index.js';
import * as crew from './crew/index.js';
import * as emotes from './emotes/index.js';
import * as start from '../world/start/index.js';

export const MODULES = [
	[ 'start', start ], // Jade Landing + intro (first: later modules see its colliders)
	[ 'weather', weather ],
	[ 'trade', trade ],
	[ 'customs', customs ], // inspections on arrival; after trade
	[ 'notices', notices ],
	[ 'story', story ], // quest chains, conversations, NPC memory (after notices: it lists on their boards)
	[ 'harbour', harbour ], // after trade / notices / story; needs app.residents
	[ 'agents', agents ], // wave 14C: Roid & Co. harbour agents at every dock (after harbour: the ports' vendors)
	[ 'crafting', crafting ], // after harbour
	[ 'melee', melee ],
	[ 'destruction', destruction ], // breakable props (Rapier physics): before naval so its raycast is ready for the balls
	[ 'naval', naval ],
	[ 'sfx', sfx ],
	[ 'boarding', boarding ],
	[ 'pirates', pirates ], // named captains, dens, notoriety (spawns through naval)
	[ 'stronghold', stronghold ], // Blackwater: the fort's batteries, alarm, guards, claim and black market
	[ 'crew', crew ], // hired characters posted aboard: gunners and anglers
	[ 'emotes', emotes ], // 5 opens the emote row (wave, dance, point, cheer), synced as a world event
	[ 'netsync', netsync ],
	[ 'dressing', dressing ],
	[ 'worldmap', worldmap ],
	[ 'vfx', vfx ], // after naval: ship state is current when the fires update
	[ 'night', night ],
	[ 'seaplane', seaplane ], // the floatplane and its hangar west of the pier
	[ 'death', death ], // respawn at Jade Landing, the sea chest, wreck / death markers
	[ 'firearms', firearms ], // flintlock pistol and musket (G draws, LMB fires, RMB aims, R reloads; cartridges at the chandlery)
	[ 'inverted', inverted ], // the upside-down sky layer (off until ?inverted or the Inverted Isles)
	[ 'life', life ],
	[ 'exploration', exploration ], // after inverted and naval (the spyglass labels their things)
	[ 'debug', debugPanel ], // sandbox only: the ` key
	[ 'saves', saveManager ],
];

// builds the registry, installs every module and hands their lights to the scene's local lights
export function installFeatures( app ) {

	const features = new Features( app );
	for ( const [ name, module ] of MODULES ) {

		const inst = features.add( name, module );
		if ( inst && inst.lights && app.localLights ) for ( const l of inst.lights ) app.localLights.add( l );

	}

	app.netsync = features.get( 'netsync' );
	// the fish well module widens the fish hold (GameState.stats reads it when a boat is set)
	if ( app.game && app.game.state ) app.game.state.holdKgBonus = () => features.get( 'naval' )?.fishHoldBonus?.() ?? 1;
	// a notice's unique reward: an islander joins the crew for free
	features.on( 'rewardUnlock', ( e ) => {

		const st = app.game && app.game.state;
		if ( st && e && e.character && st.unlockCharacter( e.character, { free: true } ) && app.game.toast ) app.game.toast( `A new crew member joined (K)`, 3200 );

	} );
	// (a sunk boat: naval sinks her and leaves a wreck; the death feature respawns the player: src/features/death)
	return features;

}
