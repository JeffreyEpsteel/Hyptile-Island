# tools/roster: the roster and fleet pipeline

Rebuilds the eight playable characters (`public/models/roster/*.glb`, portraits in `public/ui/roster/*.png`)
and the four fleet hulls (`public/models/fleet/*.glb`) from the owner's fishing workspace with Blender 5.x.
The committed GLBs are the output; you only need this when a source mesh, rig or clip changes.

## Requirements

- Blender 5.x at `D:\blender\blender.exe`, or set `$env:BLENDER`.
- The fishing workspace at `D:\fishing game`, or set `$env:FISHING_WORKSPACE`. It must contain:
  - `JadeFisher_Comfy/animations/*.fbx` (the v03 rig's base clips)
  - `Assets/HyptileEyes/exports/SK_Hyptile_Eyes.fbx` and `Assets/HyptileEyes/roster/<Name>/exports/SK_<Name>_Eyes.fbx`
    for Pepe, Doge, Bonk, Pengu and Clown
  - `Assets/HyptileCousins/exports/SK_Bravile.fbx`, `SK_Heptyle.fbx`
  - `Assets/HyptileTraversal/animations`, `Assets/HyptileMotion/animations`, `Assets/HyptileIslandLife/animations`,
    `Assets/FishingFleet/animations` (the extra clips) and `Assets/FishingFleet/exports/SM_*.fbx` (the hulls)
- Windows PowerShell (the host has 5.1; the script uses nothing newer).

## Command

From the project root:

```powershell
powershell -ExecutionPolicy Bypass -File tools/roster/build.ps1                  # all 8 characters
powershell -ExecutionPolicy Bypass -File tools/roster/build.ps1 -Only hyptile,pepe
powershell -ExecutionPolicy Bypass -File tools/roster/build.ps1 -Boats           # characters + 4 hulls
powershell -ExecutionPolicy Bypass -File tools/roster/build.ps1 -Boats -NoCharacters
```

Each Blender run is logged to `tools/roster/logs/<id>.log`; the script echoes the `DECIMATED` / `KEPT` /
`CLIP` / `EXPORTED` / `PORTRAIT` lines and any `Error` / `Traceback`. A character takes a minute or two.

Then check the result headlessly:

```sh
node test/roster-smoke.mjs            # 48 joints, 20 clips, a walk frame per character -> test/out/roster-*.png
node test/roster-smoke.mjs pepe doge  # a subset
```

## Inputs → outputs

| Input (fishing workspace) | Script | Output |
|---|---|---|
| `SK_<Name>.fbx` on the 48-bone JadeFisher v03 rig + 20 animation-only FBXs on the same rig | `convert-character.py` | `public/models/roster/<id>.glb`, `public/ui/roster/<id>.png` |
| `Assets/FishingFleet/exports/SM_<Hull>.fbx` | `convert-boat.py` | `public/models/fleet/SM_<Hull>.glb` |

The character ids and source paths are the `$Chars` table in `build.ps1`; the clip list is `$Clips`
(`Name=path.fbx`). The clip names must match `CLIPS` in `src/game/Characters.js`: the avatar looks clips up by
name.

## What `convert-character.py` does

`blender -b --python convert-character.py -- <character.fbx> <out.glb> <portrait.png> <maxTris> <Name=anim.fbx> ...`

1. Imports the character FBX, drops empties and any actions that came with it.
2. **Meshes**: removes shape keys (morph targets); if the meshes exceed `maxTris` (100 000, `-Budget` in `build.ps1`),
   adds a collapse Decimate per mesh sized to its share of the budget and applies it. A temporary vertex group
   with the head, eyes, neck, hands and fingers at weight 0.9 (0.3 elsewhere, env `DECIMATE_DETAIL_W`) is used with
   `invert_vertex_group`, so the collapse spends its triangles on the face and hands. Never use 1.0: an edge with both
   vertices at inverted weight 0 is not collapsible, so the head and hands froze whole, Doge's (99 k of the 100 k budget)
   left about 1.5 k triangles for the body and Doge / Pengu tore into shards (the log prints `DETAIL_SPLIT head+hands / body`); symmetry and a position weld were tried and tore the lids
   (env `DECIMATE_SYMMETRY=1`, `WELD=1`, `DECIMATE_VG=0` switch them for experiments). Skin weights survive.
3. **Materials**: base-colour textures are scaled to 2048, other maps to 1024; metallic above 0.5 is reset to 0
   (the generations ship with metallic skin); `M_` prefixes are stripped and `Material_0` becomes `body`.
4. **Clips**: each animation FBX is imported, its action taken (same bone names, so no retargeting), put on its own muted NLA
   track and the imported rig deleted; clips with no action print `NO ACTION` and are skipped. A clip passed as
   `Name=anim.fbx|rebase` is rebased first (prints `REBASE`, see "Rebased clips" below). Then `fishing_pose.py` replaces
   Fishing_Hold / Reel / Strike / Cast (the authored ones were static arm poses) and adds Fishing_Fight / Charge. See "Fishing clips" below.
5. **Export**: glTF binary, JPEG textures at quality 86, skins on, animations from the NLA tracks with forced
   sampling and size optimisation, morphs off, Y up, modifiers applied.
6. **Portrait**: frame 10 of `Idle_Breathe` from the front, 512 × 640 transparent PNG, Workbench studio
   lighting with cavity and shadows.

## Rebased clips (wave 11C)

Helm_Idle, Steer_Left / Steer_Right, Seated_Idle and Fall_Loop exported as the bind pose (an A for their whole length;
`ProcPose.bindLike` flagged them). Cause: the authored clip FBXs (`HyptileMotion/scripts/build_motion.py`,
`FishingFleet/build_fleet.py`, the JadeFisher animations) were exported with the rig posed on frame 1, and Blender's FBX
exporter writes the current pose as the skeleton's rest. The importer reads that back as the clip armature's rest, so the
keys are deltas from the clip's first frame (every SK_*.fbx shares the true JadeFisher v03 rest; the clip rests differ by
up to 118 deg, the seated ones also have the pelvis 0.29 m lower). Assigned directly, every authored clip starts in the bind
pose, and a clip that holds one pose is the bind pose throughout. `rebase_action` composes every key with the clip's rest:
`basis' = inv(rest_char_local) @ rest_clip_local @ basis` (translation kept for root / pelvis only), which reproduces the
authored pose exactly (checked bone by bone against the source armature: 0.0 deg, 0.0 m).

Only those five are rebased (`$Rebase` in `build.ps1`). Every other authored clip (Jump, Swim_*, Row_*, Paddle_*, Sit_Down,
Stand_Up, Board / Disembark, Land_Soft, Stumble, Knockdown, GetUp_Front, Hit_Reaction, Catch_*, Sweep_Work, Inspect_Catch,
Offer_Finger, Prank_Laugh, Airborne_Tumble, Melee_Paddle when not overridden) has the same offset rest but moves, and the
game is tuned to how they play now (the swim pitch, the ragdoll get-up, the rowing grips): rebasing them is a separate,
reviewed change (`REBASE_ALL=1` for an experiment). The Rocketbox / Kimodo retargets (`retarget.py`) export in the true rest
and need nothing.

The committed GLBs were built with `-Override` Kimodo clips whose files were regenerated afterwards, so a whole rebuild
changes Idle_Breathe / Walk_InPlace. The wave 11C GLBs were therefore built into a scratch folder and only the five clips
spliced into the committed GLBs (meshes, textures and every other clip byte-for-byte the same):

```powershell
$K = 'D:\fishing game\Assets\HyptileMotion\kimodo_bip01\retargeted'
powershell -ExecutionPolicy Bypass -File tools/roster/build.ps1 -SkipRetarget -OutDir $env:TEMP\roster -PortraitDir $env:TEMP\roster `
  -Override "Idle_Breathe=$K\Idle_Breathe.fbx,Walk_InPlace=$K\Walk_InPlace.fbx,Melee_Paddle=$K\Melee_Paddle.fbx"
node tools/roster/splice-clips.mjs public/models/roster/hyptile.glb $env:TEMP\roster\hyptile.glb public/models/roster/hyptile.glb Helm_Idle Seated_Idle Steer_Left Steer_Right Fall_Loop
node test/roster-clips.mjs   # every graph clip present and none bind-like; the seated clips drop the pelvis
```

## Fishing clips (`fishing_pose.py`)

Six procedural clips, computed in plain Python per frame (no Blender constraints, no IK at runtime) and baked as FK keys on
every bone: torso Euler angles, a rod frame (pitch / cant / yaw), a fixed hand grip on the rod (the right hand's long axis 48 deg off
the shaft, the left hand mirrored), both arms solved analytically with the upper-arm roll searched to spread the twist over
shoulder / elbow / wrist, and `weapon_r` (the rod socket) keyed as the rod frame itself. Each build prints a `FISHING` line per clip
into the character's log (reach error, elbow bend, wrist flexion, twist per joint); `FISHING_DUMP=1` adds joint positions.

The clips play as an upper-body overlay in the game (`src/player/Avatar.js`, `SkinnedModel.setOverlay`: spine ramp 0.5 / 0.8, then
clavicles, arms, neck, head at 1), so the legs and pelvis stay at rest in them. Keys are `pose( ... )` dictionaries in
`fishing_pose.py` (HOLD, BACK, MID, REL_, FOLLOW, REEL, FIGHT_LOW / FIGHT_HIGH, strike keys); the clips are Hermite tracks through them.

| Clip | Length | What it does |
|---|---|---|
| Fishing_Hold | 3 s loop | ready stance, rod 42 deg up, both elbows bent, the left hand on the crank |
| Fishing_Charge | 0.7 s, holds its last frame | rod up and back over the right shoulder (about 128 deg, tip behind), left hand on the butt, torso turned right and leaning back |
| Fishing_Cast | 1.6 s | whip from the back swing; the rod passes the release angle (about 40 deg above horizontal) 0.09 s in, when the bobber leaves the tip (`FishingRod.js` flick); follow-through points at the water, then eases to the Hold pose |
| Fishing_Reel | 2 s loop | rod 52 deg, the left hand circles the crank once per second |
| Fishing_Fight | 2 s loop | pump the rod up (80 deg) and back with the torso leaning, then lower it while winding in |
| Fishing_Strike | 1 s | hook-set snap up and back, settles to the reel stance |

`test/avatar-overlay.mjs` checks the overlay engine, the Avatar's layering and these angles on the exported GLB; `node test/clip-rod.mjs <glb> <clip>`
prints the rod elevation, grip, elbows and head per frame.

## What `convert-boat.py` does

`blender -b --python convert-boat.py -- <hull.fbx> <out.glb>`

Imports the hull, deletes every `UCX_` collision box and every non-mesh object, strips `M_` from material
names and exports a static GLB (no skins, animations, morphs, cameras or lights). Frames: Blender -Y bow,
+Z up, +X port → glTF +Z bow, +X port, y = 0 at the design waterline, which is the game's boat frame
(`src/game/Boats.js`, kind `fleet`; `src/world/boat/FleetBoatModel.js` builds the driven hull from the GLB and
`src/game/BoatYard.js` shows the four for sale, moored by the boathouse).

## Limits

- Morph targets (blink, gaze) are dropped; the engine's skinning has no morph support.
- Decimation is uniform per mesh: faces, hands and the eyes lose detail along with everything else. The
  budget is the fourth argument in `build.ps1` if a character needs more.
- The scripts assume one armature per FBX and bone names identical between the character and every clip;
  a clip from a different rig imports but produces `NO ACTION` or a wrong pose rather than an error.
- `build.ps1` continues on error (`$ErrorActionPreference = 'Continue'`): read the echoed lines or the log.
- Blender writes the portrait with Workbench, so it does not match the game's lighting; it is a picker
  thumbnail, not a render.
- The hull converter keeps the FBX's textures as they are (`export_image_format='AUTO'`); there is no size cap.

## Rocketbox motion-capture clips

The authored starter clips (A-pose idle, stiff walk and run) are replaced for the locomotion, idle and gesture
names by retargeted [Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox) mocap (MIT, credited
in `CREDITS.md`, licence copy in `rocketbox/LICENSE.md`). The fishing, swim, helm, rowing, boat, fall, prank, sit
and jump clips stay authored. `build.ps1` runs the stage before the characters.

    tools/roster/fetch-rocketbox.ps1                  # clips listed in rocketbox/clips.json -> rocketbox/ (skips existing)
    tools/roster/build.ps1 -RetargetOnly              # clips -> retargeted/<Name>.fbx, no characters
    tools/roster/build.ps1 [-SkipRetarget]            # everything; -SkipRetarget reuses retargeted/*.fbx

`rocketbox/clips.json` is the single list: name in the game, Rocketbox file (set `static` is in place, `xy`/`xyz`
travel on the ground) and `retarget.py` options (`loop`, `zero`, `keepz`, `nocap`). Replaced names: Idle_Breathe,
Walk_InPlace, Run_InPlace, Wave, Friendly_Wave, Talk, Chat_Gesture, Look_Around, Cheer_Clap, Dance, Laugh, Shrug,
Point, Beckon, Swagger_Idle (the exact source file of each is in the manifest).

`retarget.py` (Blender, background) turns one clip FBX plus the Hyptile rig FBX into an animation-only FBX on the
48-bone rig (`Armature`, -Y forward, Z up, 30 fps, frames from 1, every bone keyed every frame, translation on the
pelvis only), the same convention as the authored clips, so `convert-character.py` takes it unchanged:

1. The clip skeleton (Bip01) imports with its first frame as the rest pose (arms down), the rig rests in an A-pose,
   so neither a world-rotation copy nor a delta from rest is right. Each mapped bone is first matched to the clip's
   rest by direction (minimal swing `F` from the rig bone's rest direction, head to child head, onto the clip
   bone's), then the clip's motion is applied as a world-space delta:
   `target_world(t) = clip_world(t) * inverse(clip_rest_world) * F * target_rest_world`.
2. Map: Pelvis, Spine1 -> spine_01, Spine2 -> spine_02, Neck, Head, clavicles, arms, hands, three joints of index /
   middle / ring (little finger dropped), thumb Finger0/01 -> thumb_01/02, thighs, calves, feet, Toe0 -> ball.
   Eyes, weapon_l/r and `root` stay at rest. Bones without a child to aim at reuse their parent's `F`.
3. Only the pelvis translates: scaled by rig / clip pelvis height (0.674 / 0.895), xy in place (the linear travel
   of the take is removed so walk and run loop on the spot), z kept. The lowest sole vertices are then kept on the
   floor by a per-clip height offset (the rig's legs are shorter than a scaled Bip01). Walk, run and idles are
   cut to whole loops (the repeated last frame is dropped).
4. Clips longer than 8 s (the talk and idle takes run up to 35 s) are cut to 8 s and the last 15 frames cross-fade
   into the 15 frames before the cut, so the loop has no pop and the GLBs stay small.
5. Export (FBX, selected armature, no leaf bones, baked, primary bone Y / secondary X, unit scale applied) happens
   with the rig in its true rest pose on frame 0, because the FBX exporter writes the current pose as the
   skeleton's rest and the importer reads it back as such. Each file is re-imported and checked (48 bones, finite
   values, no translation off the pelvis, keys equal to what was written).

Preview: `blender -b --python retarget.py -- <rig.fbx> <out_dir> --preview <png_dir> Name=clip.fbx|opts ...` renders
`retarget-<Name>.png`, four frames from the front and the side on the Hyptile mesh, and prints `FEET` (lowest skinned
vertex against the rest floor). Reference ground speeds for playback scaling (pelvis travel per cycle on this rig):
walk about 0.76 m/s, run about 2.17 m/s (`CLIP_SPEED` in `src/game/Characters.js`).

## Kimodo clips (wave 17)

Twenty-two roster clips came from the old procedural motion pack and moved only the pelvis, arms and legs (11 to 13 of the
48 joints), so the spine, shoulders, neck, head and hands sat in the bind pose: the A-pose the user saw in the jump, the
swim and the falls. They were replaced with NVIDIA Kimodo text-to-motion takes (ComfyUI-Kimodo-Enhanced, generated in an
earlier session into `D:\fishing game\Assets\HyptileMotion\game_set\<Folder>\<Name>.bvh`) run through the approved
roster pipeline, which retargets by bone direction onto this rig and fixes the arms against each character's own body:

```powershell
# per clip (Blender, about 20 min: the arm-collision fix runs per character); review.png shows Hyptile and Clown, front and side
D:\Comfy-Desktop\ComfyUI-Installs\ComfyUI\ComfyUI\.venv\Scripts\python.exe "D:\fishing game\tools\kimodo_text_encoder_setup\kimodo_clip_pipeline.py" Jump --in-place --tag v2
# then all eight GLBs at once: build with the accepted clips, stand the swim clips up, splice only those clips
powershell -ExecutionPolicy Bypass -File tools/roster/kimodo-splice.ps1 -Clips Jump,Land_Soft,...
```

Accepted (in the GLBs): Jump, Land_Soft, Stumble, Airborne_Tumble, Hit_Reaction, Knockdown, GetUp_Front, GetUp_Back (new),
Swim_Idle, Swim_Forward, Swim_Fast, Board_Low, Disembark_Low, Catch_Celebrate, Catch_Disappointed, Inspect_Catch,
Sweep_Work, Offer_Finger, Prank_Laugh. Rejected on review: Fall_Loop (lies on its back on the floor; the graph's fall
state plays `Fall_Air`, a pose clip from the jump's airborne frame), Sit_Down / Stand_Up / Seated_Idle (sit on the floor,
not at seat height: the boats, the cockpit and Captain Roid's crate need the 0.29 m pelvis drop of the current clips) and
Helm_Idle (arms hang; the helm IK holds the wheel on the current one).

`unpitch-swim.mjs`: Kimodo's swim takes lie face down, but Avatar.js pitches upright swim clips forward itself and
ProcPose layers the sculling and flutter kick on top, so the swim clips get one constant rotation on the pelvis (the mean
spine direction onto up, about 84-89 deg) and the standing pelvis height. `test/clip-frame.mjs` renders any clip at any time
headlessly (`CLIP=Jump CLIP_T=1.0 node test/clip-frame.mjs hyptile` -> `test/out/roster-hyptile-Jump-1.0.png`).

## Checking by eye

- `node test/roster-preview.mjs <out.png> action=reel rod=1 cam=three frames=6 step=0.25` drives the real `Avatar`
  (and with `rod=1` the real `FishingRod`) headlessly and writes a contact sheet; swim: `mode=swim speed=1`, walking with the rod:
  `action=hold speed=1.25` (legs walk, arms hold), switch action mid-run: `then=cast at=0.9`. Textures are flat grey there.
  `clip=Fishing_Cast loop=0 warm=0.001 step=0.0333` plays one clip directly (base layer; `from=` seeks), `overlay=Fishing_Reel` plays a clip on the
  upper-body overlay over the mode / speed locomotion. `cam=front,q,sideU` renders one panel per camera (rows when there are several frames);
  named cameras are listed at the top of the file (`q`, `qL`, `sideU`, `wide`, `arms`, `hands` ...), and `cam=p:x;y;z>lx;ly;lz@fov` is a custom one.
- `blender -b --python tools/roster/face-closeup.py -- <abs model.glb> <abs out.png>` renders a textured face close-up for
  decimation comparisons (use absolute paths).
- `retarget.py` prints `PENETRATION <clip> max ... m`: the deepest hand / forearm / fingers point (with limb radius) inside the
  torso cross-section taken from the mesh. Fixes: `ARM_ABDUCT` 18 deg and `ELBOW_BEND` 10 deg scaled by how much the upper arm
  hangs, neck and head keep half of the source rotation (`NECK_KEEP`).
