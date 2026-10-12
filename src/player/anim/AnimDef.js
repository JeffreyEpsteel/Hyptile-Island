// The animation graph definition (src/player/anim/AnimGraph.js): plain data, so Vite hot-reloads it into the running
// avatars (AnimGraph accepts this module and swaps the definition; derived clips are rebuilt when `clips` changed).
//
//   clips       clips built per character at load from the roster clips (ClipTools.js): { from, legYaw } strafe legs,
//               { from, stride, lean } a longer stride, { base, keys } a procedural pose clip
//   spaces      blend spaces: 'polar' (direction x speed, phase-synced on the left foot's forward point) and '1d' (speed)
//   states      the state machine's states: { space } | { clip, loop, from, to, rate } | { loopClip: true } (the pose action's loop)
//   rules       [ state, ( ctx, cur ) => bool ]: the first true one is the state wanted this frame (cur = { name, time, done })
//   blends      'from>to' | 'from>*' | '*>to' | 'default' -> [ seconds, 'crossfade' | 'inertial' ]
//   montages    one-shot actions: { clip, slot: 'full' | 'upper', from, to, rate, reverse, loop, hold, blendIn, blendOut,
//               rootMotion, notifies: [ [ clipTime, name ] ] }
//   footsteps   ground phase of the left / right foot contact (phase 0 = left foot furthest forward)
//
// ctx (built by the Avatar each frame): mode, speed, forward, strafe (m/s, + = right), turn (rad/s, + = left), grounded,
// vy, airTime (s off the ground), lastAir (the last airborne stretch), rod (a rod action on the overlay), seat ('ride' |
// 'plane' | null), loopClip (the clip of a looping full-body action, or null), diving.

const G = [ 1.25, 2.7 ]; // the walker's walk (Caps Lock) and jog speeds (Player.updateWalk); sprint 4.6
const crouchPose = ( drop, extra = {} ) => {

	// knees and hips bent so the pelvis sits `drop` lower with the feet in place (ClipTools.crouch, inlined so this stays data)
	const a = Math.acos( 1 - drop / 0.6 ) * 180 / Math.PI;
	return { pelvis: [ 0, - drop, 0 ], thigh_l: [ [ 'x', - a ] ], calf_l: [ [ 'x', 2 * a ] ], foot_l: [ [ 'x', - a ] ], thigh_r: [ [ 'x', - a ] ], calf_r: [ [ 'x', 2 * a ] ], foot_r: [ [ 'x', - a ] ], ...extra };

};

// the guard: fists up under the chin (the roster's big heads leave no room in front of the face), elbows down and in.
// reach: { l | r: [ wrist x, y, z, elbow pole x, y, z ] } in model space (+X left, +Y up, +Z forward), solved by ClipTools.twoBone
const GUARD = {
	spine_01: [ [ 'x', 6 ] ], spine_02: [ [ 'x', 4 ] ], head: [ [ 'x', 6 ] ], hand_l: [ [ 'x', - 25 ] ], hand_r: [ [ 'x', - 25 ] ],
	reach: { l: [ 0.09, 1.11, 0.27, 0.5, - 1, - 0.2 ], r: [ - 0.09, 1.09, 0.27, - 0.5, - 1, - 0.2 ] },
};
const mix = ( a, b ) => {

	const o = { ...a };
	for ( const k in b ) o[ k ] = k === 'pelvis' ? b[ k ] : k === 'reach' ? { ...a.reach, ...b.reach } : [ ...( a[ k ] || [] ), ...b[ k ] ];
	return o;

};

export default {

	version: 1,

	clips: {
		// longer strides at the same cadence for the jog and the sprint (the run take is a short-stride 1.95 m/s run)
		Run_Long: { from: 'Run_InPlace', stride: 1.2 },
		Run_Sprint: { from: 'Run_InPlace', stride: 1.38, lean: 9 },
		// strafe legs: L40 = the legs turned 40 deg to the character's left, the chest still forward
		Walk_L40: { from: 'Walk_InPlace', legYaw: 40 }, Walk_R40: { from: 'Walk_InPlace', legYaw: - 40 },
		Walk_L75: { from: 'Walk_InPlace', legYaw: 75 }, Walk_R75: { from: 'Walk_InPlace', legYaw: - 75 },
		Run_L40: { from: 'Run_Long', legYaw: 40 }, Run_R40: { from: 'Run_Long', legYaw: - 40 },
		Run_L75: { from: 'Run_Long', legYaw: 75 }, Run_R75: { from: 'Run_Long', legYaw: - 75 },
		// combat (procedural; the roster has no dodge / guard takes): deltas in model axes on the idle pose, see ClipTools.poseClip
		Dodge_Left: { base: 'Idle_Breathe', keys: [
			{ t: 0, pose: {} },
			{ t: 0.1, ease: 'out', pose: crouchPose( 0.11, { pelvis: [ 0.13, - 0.11, 0 ], spine_01: [ [ 'z', - 20 ] ], head: [ [ 'z', 8 ] ], upperarm_l: [ [ 'z', 32 ] ], upperarm_r: [ [ 'x', - 30 ], [ 'z', - 10 ] ], lowerarm_r: [ [ 'x', - 40 ] ] } ) },
			{ t: 0.28, pose: crouchPose( 0.09, { pelvis: [ 0.08, - 0.09, 0 ], spine_01: [ [ 'z', - 10 ] ], head: [ [ 'z', 6 ] ], upperarm_l: [ [ 'z', 24 ] ], upperarm_r: [ [ 'x', - 25 ] ], lowerarm_r: [ [ 'x', - 35 ] ] } ) },
			{ t: 0.5, pose: {} },
		] },
		Dodge_Right: { base: 'Idle_Breathe', keys: [
			{ t: 0, pose: {} },
			{ t: 0.1, ease: 'out', pose: crouchPose( 0.11, { pelvis: [ - 0.13, - 0.11, 0 ], spine_01: [ [ 'z', 20 ] ], head: [ [ 'z', - 8 ] ], upperarm_r: [ [ 'z', - 32 ] ], upperarm_l: [ [ 'x', - 30 ], [ 'z', 10 ] ], lowerarm_l: [ [ 'x', - 40 ] ] } ) },
			{ t: 0.28, pose: crouchPose( 0.09, { pelvis: [ - 0.08, - 0.09, 0 ], spine_01: [ [ 'z', 10 ] ], head: [ [ 'z', - 6 ] ], upperarm_r: [ [ 'z', - 24 ] ], upperarm_l: [ [ 'x', - 25 ] ], lowerarm_l: [ [ 'x', - 35 ] ] } ) },
			{ t: 0.5, pose: {} },
		] },
		Dodge_Back: { base: 'Idle_Breathe', keys: [
			{ t: 0, pose: {} },
			{ t: 0.1, ease: 'out', pose: crouchPose( 0.13, { pelvis: [ 0, - 0.13, - 0.06 ], spine_01: [ [ 'x', 16 ] ], spine_02: [ [ 'x', 6 ] ], head: [ [ 'x', - 10 ] ], upperarm_l: [ [ 'x', - 40 ], [ 'z', 12 ] ], upperarm_r: [ [ 'x', - 40 ], [ 'z', - 12 ] ], lowerarm_l: [ [ 'x', - 45 ] ], lowerarm_r: [ [ 'x', - 45 ] ] } ) },
			{ t: 0.28, pose: crouchPose( 0.1, { pelvis: [ 0, - 0.1, - 0.04 ], spine_01: [ [ 'x', 12 ] ], head: [ [ 'x', - 8 ] ], upperarm_l: [ [ 'x', - 32 ] ], upperarm_r: [ [ 'x', - 32 ] ], lowerarm_l: [ [ 'x', - 40 ] ], lowerarm_r: [ [ 'x', - 40 ] ] } ) },
			{ t: 0.5, pose: {} },
		] },
		Dodge_Forward: { base: 'Idle_Breathe', keys: [
			{ t: 0, pose: {} },
			{ t: 0.1, ease: 'out', pose: crouchPose( 0.15, { pelvis: [ 0, - 0.15, 0.06 ], spine_01: [ [ 'x', 24 ] ], spine_02: [ [ 'x', 8 ] ], head: [ [ 'x', - 16 ] ], upperarm_l: [ [ 'x', 25 ] ], upperarm_r: [ [ 'x', 25 ] ] } ) },
			{ t: 0.28, pose: crouchPose( 0.1, { spine_01: [ [ 'x', 16 ] ], head: [ [ 'x', - 10 ] ], upperarm_l: [ [ 'x', 15 ] ], upperarm_r: [ [ 'x', 15 ] ] } ) },
			{ t: 0.5, pose: {} },
		] },
		Block_Guard: { base: 'Idle_Breathe', loopBase: true, keys: [ { t: 0, pose: GUARD }, { t: 1.97, pose: GUARD } ] },
		Block_Impact: { base: 'Idle_Breathe', keys: [
			{ t: 0, pose: GUARD },
			{ t: 0.07, ease: 'out', pose: mix( GUARD, { spine_01: [ [ 'x', - 12 ] ], spine_02: [ [ 'x', - 6 ] ], head: [ [ 'x', - 8 ] ], reach: { l: [ 0.09, 1.02, 0.16, 1, - 1, - 0.5 ], r: [ - 0.09, 1.0, 0.16, - 1, - 1, - 0.5 ] } } ) },
			{ t: 0.38, pose: GUARD },
		] },
		Parry: { base: 'Idle_Breathe', keys: [
			{ t: 0, pose: GUARD },
			{ t: 0.1, ease: 'out', pose: mix( GUARD, { spine_02: [ [ 'y', 16 ] ], reach: { r: [ - 0.26, 1.1, 0.34, - 1, - 0.6, 0 ], l: [ 0.1, 0.98, 0.2, 1, - 1, - 0.3 ] } } ) },
			{ t: 0.2, pose: mix( GUARD, { spine_02: [ [ 'y', 12 ] ], reach: { r: [ - 0.24, 1.08, 0.32, - 1, - 0.6, 0 ] } } ) },
			{ t: 0.45, pose: GUARD },
		] },
		Hit_Back: { base: 'Idle_Breathe', keys: [
			{ t: 0, pose: {} },
			{ t: 0.09, ease: 'out', pose: { pelvis: [ 0, - 0.03, 0.05 ], spine_01: [ [ 'x', 14 ] ], spine_02: [ [ 'x', 10 ] ], head: [ [ 'x', - 18 ] ], upperarm_l: [ [ 'x', 18 ], [ 'z', 10 ] ], upperarm_r: [ [ 'x', 18 ], [ 'z', - 10 ] ] } },
			{ t: 0.55, pose: {} },
		] },
		Hit_Left: { base: 'Idle_Breathe', keys: [
			{ t: 0, pose: {} },
			{ t: 0.09, ease: 'out', pose: { pelvis: [ - 0.05, - 0.02, 0 ], spine_01: [ [ 'y', 12 ], [ 'z', 8 ] ], spine_02: [ [ 'y', 8 ], [ 'z', 6 ] ], head: [ [ 'z', 12 ], [ 'y', - 10 ] ], upperarm_l: [ [ 'z', 20 ] ], upperarm_r: [ [ 'z', - 12 ] ] } },
			{ t: 0.55, pose: {} },
		] },
		Hit_Right: { base: 'Idle_Breathe', keys: [
			{ t: 0, pose: {} },
			{ t: 0.09, ease: 'out', pose: { pelvis: [ 0.05, - 0.02, 0 ], spine_01: [ [ 'y', - 12 ], [ 'z', - 8 ] ], spine_02: [ [ 'y', - 8 ], [ 'z', - 6 ] ], head: [ [ 'z', - 12 ], [ 'y', 10 ] ], upperarm_r: [ [ 'z', - 20 ] ], upperarm_l: [ [ 'z', 12 ] ] } },
			{ t: 0.55, pose: {} },
		] },
	},

	spaces: {
		// columns by direction (deg, + = right of the facing); each column a speed axis; idle is shared at speed 0. Backward
		// columns play their clip in reverse (legs turned the other way, so the back diagonals step the right way)
		ground: {
			kind: 'polar', idle: 'Idle_Breathe', maxRate: 1.9, sync: true,
			columns: [
				{ dir: 0, samples: [ [ 'Walk_InPlace', G[ 0 ] ], [ 'Run_Long', G[ 1 ] ], [ 'Run_Sprint', 4.6 ] ] },
				{ dir: 45, samples: [ [ 'Walk_R40', G[ 0 ] ], [ 'Run_R40', G[ 1 ] ] ] },
				{ dir: 90, samples: [ [ 'Walk_R75', G[ 0 ] ], [ 'Run_R75', G[ 1 ] ] ] },
				{ dir: 135, reverse: true, samples: [ [ 'Walk_L40', G[ 0 ] ], [ 'Run_L40', G[ 1 ] ] ] },
				{ dir: 180, reverse: true, samples: [ [ 'Walk_InPlace', G[ 0 ] ], [ 'Run_Long', G[ 1 ] ] ] },
				{ dir: - 135, reverse: true, samples: [ [ 'Walk_R40', G[ 0 ] ], [ 'Run_R40', G[ 1 ] ] ] },
				{ dir: - 90, samples: [ [ 'Walk_L75', G[ 0 ] ], [ 'Run_L75', G[ 1 ] ] ] },
				{ dir: - 45, samples: [ [ 'Walk_L40', G[ 0 ] ], [ 'Run_L40', G[ 1 ] ] ] },
			],
			// the state label by speed (m/s)
			labels: [ [ 0.25, 'idle' ], [ 1.9, 'walk' ], [ 3.4, 'jog' ], [ 4.2, 'run' ], [ Infinity, 'sprint' ] ],
		},
		swim: { kind: '1d', samples: [ [ 'Swim_Idle', 0 ], [ 'Swim_Forward', 1.0 ], [ 'Swim_Fast', 1.8 ] ], minRate: 0.5, maxRate: 2 },
	},

	states: {
		locomotion: { space: 'ground', lean: true },
		fishing: { space: 'ground', lean: true, label: 'fishing' },
		deck: { space: 'ground', lean: true },
		jump: { clip: 'Jump', from: 0.5, to: 1.05, rate: 1.15, loop: false },
		fall: { clip: 'Fall_Loop', loop: true },
		land: { clip: 'Land_Soft', from: 0.08, to: 0.8, rate: 1.5, loop: false },
		swim: { space: 'swim' },
		helm: { clip: 'Helm_Idle', loop: true },
		seated: { clip: 'Seated_Idle', loop: true },
		ride: { clip: 'Seated_Idle', loop: true },
		plane: { clip: 'Seated_Idle', loop: true },
		action: { loopClip: true },
	},

	rules: [
		[ 'swim', ( c ) => c.mode === 'swim' ],
		[ 'action', ( c ) => !! c.loopClip ],
		[ 'helm', ( c ) => c.mode === 'boat' ],
		[ 'plane', ( c ) => c.mode === 'seat' && c.seat === 'plane' ],
		[ 'ride', ( c ) => c.mode === 'seat' && c.seat === 'ride' ],
		[ 'seated', ( c ) => c.mode === 'seat' ],
		// air: the jump on the way up, the fall after a while in the air, a landing crouch after a real drop when slow
		[ 'jump', ( c, s ) => ! c.grounded && ( s.name === 'jump' ? c.vy > - 1.5 || s.time < 0.3 : s.name !== 'fall' && c.vy > 1.0 ) ],
		[ 'fall', ( c ) => ! c.grounded && c.airTime > 0.3 ],
		[ 'land', ( c, s ) => s.name === 'land' ? ! s.done && ! ( c.speed > 1.2 && s.time > 0.12 ) : ( s.name === 'fall' || s.name === 'jump' ) && c.grounded && c.lastAir > 0.45 && c.speed < 1.5 ],
		[ 'deck', ( c ) => c.mode === 'deck' ],
		[ 'fishing', ( c ) => c.rod ],
		[ 'locomotion', () => true ],
	],

	blends: {
		default: [ 0.25, 'crossfade' ],
		'*>jump': [ 0.12, 'inertial' ],
		'jump>fall': [ 0.35, 'crossfade' ],
		'*>land': [ 0.1, 'inertial' ],
		'jump>*': [ 0.18, 'inertial' ],
		'fall>*': [ 0.2, 'inertial' ],
		'land>*': [ 0.25, 'crossfade' ],
		'*>swim': [ 0.4, 'crossfade' ],
		'swim>*': [ 0.35, 'crossfade' ],
		'locomotion>fishing': [ 0.2, 'crossfade' ],
		'fishing>locomotion': [ 0.2, 'crossfade' ],
		'*>action': [ 0.3, 'crossfade' ],
		'action>*': [ 0.3, 'crossfade' ],
		'*>helm': [ 0.3, 'inertial' ],
		'*>seated': [ 0.3, 'inertial' ],
	},

	montages: {
		// fishing (the rod clips also stay on the Avatar's rod overlay; these are for callers that want one-shots)
		cast: { clip: 'Fishing_Cast', slot: 'upper', from: 0.06, blendIn: 0.04, blendOut: 0.25 },
		strike: { clip: 'Fishing_Strike', slot: 'upper', blendIn: 0.08, blendOut: 0.2 },
		catch: { clip: 'Catch_Celebrate', slot: 'full', blendIn: 0.2, blendOut: 0.3 },
		// melee: PlayerCombat's swing hits 0.3 s after the press; Melee_Paddle's paddle comes down at 1.03 s, so the swing starts
		// in the wind-up and plays fast: ( 1.03 - 0.45 ) / 1.93 = 0.3 s to 'contact'
		swing: { clip: 'Melee_Paddle', slot: 'full', from: 0.45, rate: 1.93, blendIn: 0.06, blendOut: 0.2, notifies: [ [ 1.03, 'contact' ] ] },
		dodge: { clip: 'Dodge_Back', slot: 'full', blendIn: 0.04, blendOut: 0.15, rootMotion: true },
		dodgeBack: { clip: 'Dodge_Back', slot: 'full', blendIn: 0.04, blendOut: 0.15, rootMotion: true },
		dodgeLeft: { clip: 'Dodge_Left', slot: 'full', blendIn: 0.04, blendOut: 0.15, rootMotion: true },
		dodgeRight: { clip: 'Dodge_Right', slot: 'full', blendIn: 0.04, blendOut: 0.15, rootMotion: true },
		dodgeForward: { clip: 'Dodge_Forward', slot: 'full', blendIn: 0.04, blendOut: 0.15, rootMotion: true },
		block: { clip: 'Block_Guard', slot: 'upper', loop: true, blendIn: 0.1, blendOut: 0.18 },
		blockImpact: { clip: 'Block_Impact', slot: 'upper', blendIn: 0.03, blendOut: 0.15 },
		parry: { clip: 'Parry', slot: 'upper', blendIn: 0.03, blendOut: 0.15, notifies: [ [ 0.1, 'parry' ] ] },
		hit: { clip: 'Hit_Reaction', slot: 'full', blendIn: 0.04, blendOut: 0.2 },
		hitFront: { clip: 'Hit_Reaction', slot: 'full', blendIn: 0.04, blendOut: 0.2 },
		hitBack: { clip: 'Hit_Back', slot: 'full', blendIn: 0.03, blendOut: 0.2 },
		hitLeft: { clip: 'Hit_Left', slot: 'full', blendIn: 0.03, blendOut: 0.2 },
		hitRight: { clip: 'Hit_Right', slot: 'full', blendIn: 0.03, blendOut: 0.2 },
		knockdown: { clip: 'Knockdown', slot: 'full', hold: true, blendIn: 0.1, blendOut: 0.2 },
		// GetUp_Front is authored as a fall; the knockdown played backwards is a clean get-up from the back
		getUp: { clip: 'Knockdown', slot: 'full', reverse: true, rate: 1.1, blendIn: 0.05, blendOut: 0.25 },
		stumble: { clip: 'Stumble', slot: 'full', blendIn: 0.08, blendOut: 0.2 },
		landSoft: { clip: 'Land_Soft', slot: 'full', blendIn: 0.05, blendOut: 0.2 },
		// gestures and emotes
		wave: { clip: 'Wave', slot: 'full', blendIn: 0.2, blendOut: 0.3 },
		friendlyWave: { clip: 'Friendly_Wave', slot: 'full', blendIn: 0.2, blendOut: 0.3 },
		celebrate: { clip: 'Catch_Celebrate', slot: 'full', blendIn: 0.15, blendOut: 0.3 },
		disappointed: { clip: 'Catch_Disappointed', slot: 'full', blendIn: 0.15, blendOut: 0.3 },
		cheer: { clip: 'Cheer_Clap', slot: 'full', blendIn: 0.2, blendOut: 0.3 },
		dance: { clip: 'Dance', slot: 'full', loop: true, blendIn: 0.3, blendOut: 0.3 },
		laugh: { clip: 'Laugh', slot: 'full', blendIn: 0.2, blendOut: 0.3 },
		shrug: { clip: 'Shrug', slot: 'full', blendIn: 0.15, blendOut: 0.25 },
		point: { clip: 'Point', slot: 'full', to: 3, blendIn: 0.2, blendOut: 0.3 },
		beckon: { clip: 'Beckon', slot: 'full', blendIn: 0.2, blendOut: 0.3 },
		inspect: { clip: 'Inspect_Catch', slot: 'full', blendIn: 0.2, blendOut: 0.3 },
		offer: { clip: 'Offer_Finger', slot: 'full', blendIn: 0.2, blendOut: 0.3 },
		prankLaugh: { clip: 'Prank_Laugh', slot: 'full', blendIn: 0.2, blendOut: 0.3 },
		sitDown: { clip: 'Sit_Down', slot: 'full', hold: true, blendIn: 0.15, blendOut: 0.25 },
		standUp: { clip: 'Stand_Up', slot: 'full', blendIn: 0.1, blendOut: 0.25 },
		// boarding a low boat: the clips step up / down; the game moves the player (root motion flag)
		boardLow: { clip: 'Board_Low', slot: 'full', blendIn: 0.1, blendOut: 0.2, rootMotion: true },
		disembarkLow: { clip: 'Disembark_Low', slot: 'full', blendIn: 0.1, blendOut: 0.2, rootMotion: true },
		boarding: { clip: 'Board_Low', slot: 'full', blendIn: 0.1, blendOut: 0.2, rootMotion: true },
		// other names callers may use
		attack: { clip: 'Melee_Paddle', slot: 'full', from: 0.45, rate: 1.93, blendIn: 0.06, blendOut: 0.2, notifies: [ [ 1.03, 'contact' ] ] },
		guard: { clip: 'Block_Guard', slot: 'upper', loop: true, blendIn: 0.1, blendOut: 0.18 },
		evade: { clip: 'Dodge_Back', slot: 'full', blendIn: 0.04, blendOut: 0.15, rootMotion: true },
		stagger: { clip: 'Hit_Reaction', slot: 'full', blendIn: 0.04, blendOut: 0.2 },
	},

	footsteps: [ 0.12, 0.62 ],
	// stance windows of the planted foot (phase), walk and run: the foot-lock hook weights
	stance: { walk: [ 0.1, 0.62 ], run: [ 0.14, 0.4 ] },
	// lean into turns (rad of roll per (m/s x rad/s)), capped; eased at `rate` 1/s
	lean: { k: 0.045, max: 0.2, rate: 6 },
	// inertial blend after a cut (s) when nothing else says
	inertial: 0.25,

};
