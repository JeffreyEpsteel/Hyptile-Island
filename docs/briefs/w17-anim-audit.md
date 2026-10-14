# Wave 17B: no A-pose anywhere: audit every pose the characters can be in, fix the ones that fall back

Read docs/briefs/COMMON.md first, then src/player/Avatar.js (the modes, ACTIONS, the swim pitch, the ragdoll, NO_FEET),
src/player/anim/AnimDef.js + AnimGraph.js + ClipTools.js (states, rules, montages, derived / pose clips: `{ base, baseTime,
keys }` builds a clip from a base clip's frame plus bone deltas), src/player/ik/ProcPose.js (helm / swim procedural layers,
bindLike), src/game/Characters.js (CLIPS: the clip names every roster GLB carries), tools/roster/README.md, and
test/clip-frame.mjs (renders a roster character at any clip and time headlessly:
`CLIP=Jump CLIP_T=1.0 node test/clip-frame.mjs hyptile` -> test/out/roster-hyptile-Jump-1.0.png; READ the PNG to judge it).

Context: the user said "I want all animations good for our Hyptile. Even jumping is an A-pose now." Root is replacing 23
roster clips with NVIDIA Kimodo takes retargeted onto the 48-bone rig (Jump, Land_Soft, Stumble, Airborne_Tumble,
Hit_Reaction, Knockdown, GetUp_Front, new GetUp_Back, Swim_*, Board_Low / Disembark_Low, Catch_*, Inspect_Catch,
Sweep_Work, Offer_Finger, Prank_Laugh, Sit_Down / Stand_Up / Seated_Idle, Helm_Idle) and has already changed the jump /
fall / hit / get-up entries of AnimDef.js and Avatar.ragdoll. Do not touch those clips or the GLBs. Your job is everything
else that can still show a bind-like (A) pose or a frozen pose:

Owned files: src/features/seaplane/Pilot.js + Chute.js (pose parts only), src/features/crew/Deck.js (pose parts only),
src/features/firearms/** (the aim / hold pose), src/features/emotes/**, src/features/rescue/Coxswain.js,
src/features/melee/Raider.js (clip choices only), src/game/CaptainRoid.js (clip choices only), src/features/harbour/**
(resident clip choices only), test/feature-anim-audit.mjs (new). AnimDef.js / Avatar.js / ProcPose.js are root's: report
exact patches (anchor + replacement) for them.

1. Inventory: list every state, mode, montage, vehicle and action that poses the player avatar (walk, sprint, jump, fall,
   land, swim, dive, climb-out / climb aboard (Player.updateSwim pull-up: is there any pose?), ladder, deck, helm, seated,
   ride, plane cockpit, parachute (Chute.js: what pose hangs under the canopy?), aboard another hull, cannon aiming,
   pistol / musket draw, aim, fire, reload, melee swing / block / parry / dodge, emotes (Digit5 wheel), fishing rod
   states, crew posted on deck (gunners, anglers), the rescue coxswain, the residents and port folk, raiders and guards,
   Captain Roid, remote players (netsync avatars)). For each: the clip / procedural layer it uses today.
2. Judge each: render it with test/clip-frame.mjs (clips) or reason from code (procedural layers), and flag anything bind-
   like (every bone within ~10 deg of rest), frozen (no motion where motion is expected), or wrong (e.g. the chute pilot
   standing in an idle while hanging, a gunner in an A at the cannon).
3. Fix what you own (pick a fitting existing clip, or build a pose with the AnimDef `{ base, baseTime, keys }` recipe
   through a reported AnimDef patch); for root files give the exact patch. Ideas that fit the existing system: the chute
   hang pose (Fall_Air style arms up to the risers, legs together), climb pull-up (a montage from Board_Low's step-up
   frames), aiming poses for pistol / musket over the locomotion (upper overlay), crew gunners at the gun (crouch +
   hands forward), the coxswain at the wheel (Helm_Idle).
4. Tests (test/feature-anim-audit.mjs): every state / montage / action the graph knows resolves to a clip present in the
   roster GLB (Characters.js CLIPS + AnimDef derived clips), and none of the clips the game plays is bind-like on
   hyptile.glb except the ones root is replacing (list those as known, by name, so the test passes now and stays a guard).
   Existing anim / melee / combat / seaplane / crew / firearms tests green. Vite build check as in COMMON.md. No browsers.
Report under 300 words: the inventory table's problem rows, what you fixed, patches for root with exact anchors.
