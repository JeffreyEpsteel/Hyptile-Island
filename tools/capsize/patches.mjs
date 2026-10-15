// Wave 22B (capsize + breath): the patches to files this worker does not own, as exact anchors. tools/capsize/apply-patches.mjs
// applies them (each anchor must appear exactly once; --check on a copy first). KEEL_LEAN / KEEL_STATE are the same data as the
// AnimDef patch, for tools/capsize/capture.mjs to inject into a running App before the patch is in the tree.

export const KEEL_LEAN = { base: 'Idle_Breathe', loopBase: true, keys: [
	{ t: 0, pose: { pelvis: [ 0, - 0.12, - 0.08 ], spine_01: [ [ 'x', - 18 ] ], spine_02: [ [ 'x', - 8 ] ], head: [ [ 'x', 14 ] ], thigh_l: [ [ 'x', - 40 ] ], calf_l: [ [ 'x', 56 ] ], foot_l: [ [ 'x', - 16 ] ], thigh_r: [ [ 'x', - 32 ] ], calf_r: [ [ 'x', 48 ] ], foot_r: [ [ 'x', - 16 ] ], reach: { l: [ 0.15, 1.0, 0.44, 1, - 0.2, - 0.6 ], r: [ - 0.15, 1.0, 0.44, - 1, - 0.2, - 0.6 ] } } },
	{ t: 1.4, pose: { pelvis: [ 0, - 0.15, - 0.12 ], spine_01: [ [ 'x', - 26 ] ], spine_02: [ [ 'x', - 10 ] ], head: [ [ 'x', 20 ] ], thigh_l: [ [ 'x', - 46 ] ], calf_l: [ [ 'x', 62 ] ], foot_l: [ [ 'x', - 16 ] ], thigh_r: [ [ 'x', - 38 ] ], calf_r: [ [ 'x', 54 ] ], foot_r: [ [ 'x', - 16 ] ], reach: { l: [ 0.15, 0.95, 0.4, 1, - 0.2, - 0.6 ], r: [ - 0.15, 0.95, 0.4, - 1, - 0.2, - 0.6 ] } } },
	{ t: 2.8, pose: { pelvis: [ 0, - 0.12, - 0.08 ], spine_01: [ [ 'x', - 18 ] ], spine_02: [ [ 'x', - 8 ] ], head: [ [ 'x', 14 ] ], thigh_l: [ [ 'x', - 40 ] ], calf_l: [ [ 'x', 56 ] ], foot_l: [ [ 'x', - 16 ] ], thigh_r: [ [ 'x', - 32 ] ], calf_r: [ [ 'x', 48 ] ], foot_r: [ [ 'x', - 16 ] ], reach: { l: [ 0.15, 1.0, 0.44, 1, - 0.2, - 0.6 ], r: [ - 0.15, 1.0, 0.44, - 1, - 0.2, - 0.6 ] } } },
] };
export const KEEL_STATE = { clip: 'Keel_Lean', slot: 'full', loop: true, blendIn: 0.3, blendOut: 0.3 };

const KEEL_TEXT = `		// wave 22B: on the keel of an upturned hull, leaning back on the line to her far gunwale (the capsize feature's 'keelPull'
		// action while you right her): knees bent, the body back, both hands forward at the waist, a slow sway with the swell
		Keel_Lean: { base: 'Idle_Breathe', loopBase: true, keys: [
${ KEEL_LEAN.keys.map( ( k ) => `			${ JSON.stringify( k ).replace( /"(\w+)":/g, '$1: ' ).replace( /"/g, '\'' ).replace( /,/g, ', ' ).replace( /\[/g, '[ ' ).replace( /\]/g, ' ]' ).replace( /\{/g, '{ ' ).replace( /\}/g, ' }' ).replace( /:\s+/g, ': ' ).replace( /-(\d)/g, '- $1' ) },` ).join( '\n' ) }
		] },
`;

export const PATCHES = [
	// ---- the feature itself
	{ file: 'src/features/install.js', anchor: `import * as citywreck from './citywreck/index.js';\n`,
		replace: `import * as citywreck from './citywreck/index.js';\nimport * as capsize from './capsize/index.js';\n` },
	{ file: 'src/features/install.js', anchor: `	[ 'rescue', rescue ], // wave 15D: distress flares and the harbour launch that answers them\n`,
		replace: `	[ 'rescue', rescue ], // wave 15D: distress flares and the harbour launch that answers them\n	[ 'capsize', capsize ], // wave 22B: a small boat stays over, hull up; E at her hull rights her (after naval, crew, death)\n` },
	{ file: 'src/features/Features.js', anchor: `//   (weapons); world event cityStages (host -> all); hostRequest cityHit / citySnap\n`,
		replace: `//   (weapons); world event cityStages (host -> all); hostRequest cityHit / citySnap\n//   (capsize, wave 22B) boatCapsized { boat, x, z, aboard, lost } rightingStarted { helpers, rough } boatRighted { boat, x, z, t, helpers }\n//   rightingSlipped { heel, letGo }; world events capsize / capsizeHelp   (death, wave 22B) breathLow { left } breathOut\n` },
	// ---- Player: an upturned hull is not boarded with "Board boat" / the rail climb (the capsize feature's E climbs onto her keel)
	{ file: 'src/player/Player.js', anchor: `		if ( ! this.boat ) return false;\n		const bp = this.boat.toWorld( this.boat.model.boardPoint, _v );\n`,
		replace: `		if ( ! this.boat || this.boat.capsized ) return false; // (hull up: src/features/capsize climbs onto her keel)\n		const bp = this.boat.toWorld( this.boat.model.boardPoint, _v );\n` },
	{ file: 'src/player/Player.js', anchor: `		if ( ! b || ! b.model || ! b.position || b.enabled === false || b.sunk || ! b.model.lines ) return null;\n`,
		replace: `		if ( ! b || ! b.model || ! b.position || b.enabled === false || b.sunk || b.capsized || ! b.model.lines ) return null;\n` },
	// ---- the lean-back pose on the keel (19D's AnimDef / Avatar: a looping full-body montage while the action is 'keelPull')
	{ file: 'src/player/anim/AnimDef.js', anchor: `			{ t: 0.8, pose: {} },\n		] },\n	},\n\n	spaces: {\n`,
		replace: `			{ t: 0.8, pose: {} },\n		] },\n${ KEEL_TEXT }	},\n\n	spaces: {\n` },
	{ file: 'src/player/anim/AnimDef.js', anchor: `		climbUp: { clip: 'Climb_Pull', slot: 'full', blendIn: 0.06, blendOut: 0.25 },\n`,
		replace: `		climbUp: { clip: 'Climb_Pull', slot: 'full', blendIn: 0.06, blendOut: 0.25 },\n		keelPull: { clip: 'Keel_Lean', slot: 'full', loop: true, blendIn: 0.3, blendOut: 0.3 }, // wave 22B: righting an upturned hull\n` },
	{ file: 'src/player/Avatar.js', anchor: `	boardLow: 'boardLow', disembarkLow: 'disembarkLow', climbUp: 'climbUp',\n`,
		replace: `	boardLow: 'boardLow', disembarkLow: 'disembarkLow', climbUp: 'climbUp', keelPull: 'keelPull', // (keelPull loops while the action is set)\n` },
	{ file: 'src/player/Avatar.js', anchor: `disembarkLow: true, stumble: true, landSoft: true, climbUp: true };\n`,
		replace: `disembarkLow: true, stumble: true, landSoft: true, climbUp: true, keelPull: true };\n` },
	// ---- crew: nobody stands on the deck of an upturned hull
	{ file: 'src/features/crew/index.js', anchor: `		const visible = !! ( ctx.boat && b && b.position && b.enabled !== false && b.position.y > - 50 && ! ( nv && nv.playerHull && nv.playerHull.sunk ) );\n`,
		replace: `		const visible = !! ( ctx.boat && b && b.position && b.enabled !== false && ! b.capsized && b.position.y > - 50 && ! ( nv && nv.playerHull && nv.playerHull.sunk ) );\n` },
	// ---- sound: the heartbeat of the last seconds of air (death's breathLow / breathOut)
	{ file: 'src/features/sfx/Voices.js', anchor: `	// ---- the towns (18B)\n`,
		replace: `	// ---- breath (22B): a slow double thump under the water (the last seconds of air, the damage)\n	heartbeat: {\n		cat: 'sfx', gain: 0.7, ref: 2, max: 20, voices: 1, gap: 0.9, build( ctx, out, t, o ) {\n\n			const k = num( o && o.rate, 1 );\n			const lp = filterNode( ctx, 'lowpass', 140, 0.9, out );\n			tone( ctx, lp, { type: 'sine', f0: 62, f1: 44, t, dur: 0.16, peak: 0.6, attack: 0.01 } );\n			tone( ctx, lp, { type: 'sine', f0: 56, f1: 40, t: t + 0.28 / k, dur: 0.14, peak: 0.45, attack: 0.01 } );\n			return 0.7 / k;\n\n		},\n	},\n\n	// ---- the towns (18B)\n` },
	{ file: 'src/features/sfx/EventSounds.js', anchor: `	{ event: 'crew snoring (activity sleep)', cue: 'snore', sound: 'snore', source: 'sfx synth' },\n`,
		replace: `	{ event: 'crew snoring (activity sleep)', cue: 'snore', sound: 'snore', source: 'sfx synth' },\n	{ event: 'the last seconds of air under water (breathLow / breathOut)', cue: 'heartbeat', sound: 'double thump', source: 'sfx synth' },\n	{ event: 'a boat capsizing / coming upright (capsize feature)', cue: 'flood_rush', also: 'bucket_slosh', sound: 'water rush, slosh', source: 'sfx synth (capsize calls events.trigger)' },\n` },
	{ file: 'src/features/sfx/EventSounds.js', anchor: `			on( 'meleeHit', ( e ) => this._meleeHit( e ) );\n`,
		replace: `			on( 'meleeHit', ( e ) => this._meleeHit( e ) );\n			// wave 22B: the last seconds of air under water (death's breath): a heartbeat at the listener\n			on( 'breathLow', () => { const p = this.sfx.app && this.sfx.app.player && this.sfx.app.player.position; if ( p ) this.trigger( 'heartbeat', { at: { x: p.x, y: p.y + 1.5, z: p.z } } ); } );\n			on( 'breathOut', () => { const p = this.sfx.app && this.sfx.app.player && this.sfx.app.player.position; if ( p ) this.trigger( 'heartbeat', { at: { x: p.x, y: p.y + 1.5, z: p.z }, rate: 1.6 } ); } );\n` },
];
