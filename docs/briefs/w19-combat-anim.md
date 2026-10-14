# Wave 19D: combat moves from NVIDIA Kimodo

Read COMMON.md, w19-common.md, tools/roster/README.md (the Kimodo section of wave 17: kimodo_clip_pipeline.py, kimodo-
splice.ps1, unpitch-swim.mjs; the 18E Rocketbox section and anim-splice.ps1), D:\fishing game\tools\kimodo_text_encoder_setup\
README.md (how Kimodo runs here: ComfyUI at 127.0.0.1:8188 with the ComfyUI-Kimodo-Enhanced nodes, the CPU text-encoder
server start_text_encoder.cmd on 127.0.0.1:9550 (~17 GB RAM, ~1 min to load), batch_game_clip_set.py / generate_one.py post
a prompt and collect .npz / .bvh / .glb), src/features/weapons/** + WeaponPose.js (wave 18D's 8 pose clips), src/features/melee/
** (swing / block / parry / dodge timings and the 'contact' notify), src/player/anim/AnimDef.js (montages: swing, block,
parry, dodge*, hit*), test/clip-frame.mjs.

Owned files: src/player/anim/AnimDef.js (combat montages and states), src/game/Characters.js (clip names), public/models/
roster/*.glb (splice only), tools/roster/** (additive), the clip choices in src/features/weapons/WeaponPose.js and
src/features/melee/MeleeData.js timings, test/feature-anim*.mjs + test/roster-clips.mjs (additive). 19B / 19C use the roster
too: splice only your clips, one character build at a time.

1. Start the Kimodo stack: ComfyUI (the comfy CLI: `comfy launch --background` in its workspace
   D:\Comfy-Desktop\ComfyUI-Installs\ComfyUI\ComfyUI, or Comfy Desktop's backend if already up; check /system_stats) and the
   text-encoder server (start_text_encoder.cmd in its own background process). If either cannot start (RAM, ports), say so
   and fall back to Rocketbox / pose clips; never block the wave on it. Stop both when done.
2. Generate (one prompt at a time, 2-3 seeds each, pick the best by clip-frame renders): Sword_Slash_R, Sword_Slash_L,
   Sword_Thrust, Sword_Parry, Axe_Chop (overhead, two hands), Harpoon_Thrust, Harpoon_Throw, Throw_Overhand (bombs),
   Pistol_Fire (one hand, recoil), Rifle_Aim_Idle (shouldered), Rifle_Reload (ramrod), Blunderbuss_Fire (braced), Club_Swing,
   Dodge_Roll, Block_Hit (shield-less parry knocked back), Taunt. In place, 1-2.5 s, a contact frame noted per attack.
3. Run each through kimodo_clip_pipeline.py (review.png), splice the accepted ones into all eight GLBs (kimodo-splice.ps1 or
   anim-splice.ps1), then wire them: AnimDef montages per weapon (cutlass: slash L / R alternating, thrust; axe: chop;
   harpoon: thrust / throw; pin: club; guns: fire / reload / aim idle on the upper body; bombs: overhand throw), with the
   melee 'contact' notify at the right frame so PlayerCombat's hit timing holds; keep 18D's pose clips as the fallback.
4. Tests: every new clip in all GLBs and not bind-like, each weapon resolves a montage, contact notify timing within the
   melee windows (the melee tests stay green). Report under 300 words with the clip table and the review image paths.
