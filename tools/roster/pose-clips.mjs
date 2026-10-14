// Pose clips baked INTO the roster GLBs (wave 18E): the way-of-life takes Rocketbox has no mocap for. Residents
// (src/world/Residents.js) play GLB clips directly, without the AnimGraph, so AnimDef's runtime pose clips would not reach
// them. Same recipe format as AnimDef.clips (ClipTools.poseClip: deltas in model axes on a base clip, +X the character's
// left, +Y up, +Z forward; `reach` = two-bone IK targets [ wrist x, y, z, elbow pole x, y, z ]), plus `cycle: true`: the
// key times are fractions of the base clip's length and the clip loops with it (the carry walk on Walk_InPlace).
// tools/roster/post-clips.mjs bakes them (`bake` steps); the rig's shoulders sit at y 1.08 and an arm reaches ~0.4 m.

const LEAN = ( turn = 0, knee = 0 ) => ( {
	pelvis: [ 0, - 0.015, 0.05 ], spine_01: [ [ 'x', - 7 ] ], spine_02: [ [ 'x', - 5 ] ], head: [ [ 'x', 5 ], [ 'y', turn ] ],
	thigh_r: [ [ 'x', - 12 - knee ], [ 'y', - 10 ] ], calf_r: [ [ 'x', 20 + 2 * knee ] ], foot_r: [ [ 'x', - 8 - knee ] ],
	// arms folded over the belly (left hand under the right elbow, right hand on the left forearm)
	reach: { l: [ - 0.13, 0.9, 0.15, 1, - 0.3, 0.2 ], r: [ 0.13, 0.94, 0.17, - 1, - 0.3, 0.2 ] },
} );
const CARRY = { spine_01: [ [ 'x', - 6 ] ], spine_02: [ [ 'x', - 3 ] ], head: [ [ 'x', - 4 ] ],
	reach: { l: [ 0.19, 0.9, 0.2, 1, - 0.8, - 0.1 ], r: [ - 0.19, 0.9, 0.2, - 1, - 0.8, - 0.1 ] } };
const BENCH = { spine_01: [ [ 'x', 18 ] ], spine_02: [ [ 'x', 6 ] ], head: [ [ 'x', 10 ] ], thigh_l: [ [ 'x', - 6 ] ], calf_l: [ [ 'x', 10 ] ] };
const HAMMER = ( up ) => ( { ...BENCH, reach: {
	l: [ 0.08, 0.74, 0.3, 1, - 0.4, - 0.3 ],
	r: up ? [ - 0.2, 1.08, 0.18, - 1, - 0.3, - 0.6 ] : [ - 0.07, 0.76, 0.33, - 1, - 0.2, - 0.4 ] } } );
const REACH_UP = ( wob = 0 ) => ( { spine_01: [ [ 'x', - 6 ], [ 'z', 4 ] ], spine_02: [ [ 'x', - 4 ] ], head: [ [ 'x', - 22 ] ], upperarm_l: [ [ 'z', 6 ] ],
	reach: { r: [ - 0.14 + wob, 1.4, 0.3, - 1, - 0.2, - 0.3 ] } } );
// a crouched walk: the walk's legs with the knees bent (ClipTools.crouch inlined), the chest forward
const crouch = ( drop, extra = {} ) => {

	const a = Math.acos( 1 - drop / 0.6 ) * 180 / Math.PI;
	return { pelvis: [ 0, - drop, 0 ], thigh_l: [ [ 'x', - a ] ], calf_l: [ [ 'x', 2 * a ] ], foot_l: [ [ 'x', - a ] ], thigh_r: [ [ 'x', - a ] ], calf_r: [ [ 'x', 2 * a ] ], foot_r: [ [ 'x', - a ] ], ...extra };

};
const SNEAK = crouch( 0.16, { spine_01: [ [ 'x', 20 ] ], spine_02: [ [ 'x', 6 ] ], head: [ [ 'x', - 14 ] ], upperarm_l: [ [ 'x', - 10 ] ], upperarm_r: [ [ 'x', - 10 ] ], lowerarm_l: [ [ 'x', - 25 ] ], lowerarm_r: [ [ 'x', - 25 ] ] } );

export default {
	// back against a wall 0.25 m behind the root, arms folded, one knee bent; a slow look around (4 s loop)
	Lean_Wall: { base: 'Idle_Breathe', loopBase: true, keys: [ { t: 0, pose: LEAN( 0, 0 ) }, { t: 1.4, pose: LEAN( 18, 4 ) }, { t: 2.6, pose: LEAN( - 12, 2 ) }, { t: 3.94, pose: LEAN( 0, 0 ) } ] },
	// the walk with a crate held against the chest (loops with Walk_InPlace; the game scales its rate like the walk)
	Carry_Box: { base: 'Walk_InPlace', cycle: true, loopBase: true, keys: [ { t: 0, pose: CARRY }, { t: 1, pose: CARRY } ] },
	// at a bench: the left hand holds the nail, the right hand strikes (0.8 s loop)
	Hammer: { base: 'Idle_Breathe', loopBase: true, keys: [ { t: 0, pose: HAMMER( true ) }, { t: 0.22, ease: 'in', pose: HAMMER( false ) }, { t: 0.32, pose: HAMMER( false ) }, { t: 0.8, pose: HAMMER( true ) } ] },
	// the lamplighter: the right arm up to the lamp, a few small adjustments, back down (3 s)
	Lamp_Light: { base: 'Idle_Breathe', keys: [ { t: 0, pose: {} }, { t: 0.7, pose: REACH_UP( 0 ) }, { t: 1.2, pose: REACH_UP( 0.03 ) }, { t: 1.7, pose: REACH_UP( - 0.02 ) }, { t: 2.2, pose: REACH_UP( 0 ) }, { t: 3, pose: {} } ] },
	// sneaking: the walk crouched (loops with Walk_InPlace)
	Crouch_Walk: { base: 'Walk_InPlace', cycle: true, loopBase: true, keys: [ { t: 0, pose: SNEAK }, { t: 1, pose: SNEAK } ] },
};
