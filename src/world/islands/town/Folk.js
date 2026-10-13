import { SPOTS, at } from './Layout.js';

// Tidemark's named residents (the harbour feature's PORT_FOLK format, world/residents/ResidentData.js): the tavern keeper
// of the Tide & Tankard (service 'tavern', the dice), the harbourmaster, a net-mender and the boatwright. The harbour
// feature fills the port up to its population (WORLD.ports tidemark size 2: nine) with generated fishers, dockworkers, a
// child, a merchant, a guard and a smuggler, every one on a role schedule. `at` is each one's own spot in the town (the
// harbour feature places PORT_FOLK by `near` rings round the stand; with the one-line patch in the report it uses `at`).
//
//   TIDEMARK_FOLK            the entries (port 'tidemark')
//   registerTidemarkFolk( PORT_FOLK )   adds them once (idempotent); Ports calls it so the harbour feature finds them

export const TIDEMARK_FOLK = [
	{
		id: 'brine', name: 'Brine', port: 'tidemark', character: 'doge', scale: 1.0, role: 'tavern', schedule: 'innkeeper', service: 'tavern', dice: true,
		near: [ 40, 48 ], at: { x: SPOTS.keeper.x, z: SPOTS.keeper.z }, base: 'Idle_Breathe', gestures: [ 'Chat_Gesture', 'Laugh', 'Friendly_Wave' ],
		lines: [
			'The Tide & Tankard: the only roof east of the Key that does not leak. Mostly.',
			'Sit. Dice? Nothing on it but pride.',
			'Planes land behind the chapel now. The goats have not forgiven them.',
			'Pirates raid the outer bay when the moon is dark. Keep your lamps lit.',
		],
	},
	{
		id: 'osric', name: 'Osric', port: 'tidemark', character: 'heptyle', scale: 0.98, role: 'merchant',
		near: [ 30, 38 ], at: at( - 147, 22 ), base: 'Talk', gestures: [ 'Point', 'Inspect_Catch', 'Shrug' ],
		lines: [
			'Harbourmaster. Moor at the pier head, not on my wharf.',
			'Timber goes out, rope comes in. That is Tidemark.',
			'Mind the berth: three fathoms at the head, nothing under the wharf.',
		],
	},
	{
		id: 'wenna', name: 'Wenna', port: 'tidemark', character: 'pengu', scale: 0.92, role: 'fisher',
		near: [ 16, 24 ], at: at( - 136, - 24 ), base: 'Idle_Breathe', gestures: [ 'Inspect_Catch', 'Fishing_Reel', 'Shrug' ],
		lines: [
			'Nets do not mend themselves. Neither do fishermen.',
			'Reef fish sell best here. Hana pays a fifth over.',
			'The stream runs clear after rain. The mullet like it.',
		],
	},
	{
		id: 'tobiah', name: 'Tobiah', port: 'tidemark', character: 'hyptile', scale: 0.96, role: 'dockworker',
		near: [ 12, 20 ], at: at( - 134, - 98 ), base: 'Idle_Breathe', gestures: [ 'Sweep_Work', 'Inspect_Catch' ],
		lines: [
			'Boatwright. That hull in the shed will float by spring.',
			'Who broke my shed doors? Again?',
			'Oak for the keel, palm for nothing.',
		],
	},
];

export function registerTidemarkFolk( list ) {

	if ( ! Array.isArray( list ) ) return 0;
	let n = 0;
	for ( const d of TIDEMARK_FOLK ) if ( ! list.some( ( q ) => q.id === d.id ) ) {

		list.push( d );
		n ++;

	}

	return n;

}
