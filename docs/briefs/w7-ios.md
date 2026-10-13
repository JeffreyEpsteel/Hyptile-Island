# Wave 7: the game does not load on iPhone (Safari and Chrome on iOS 26, iPhone 17 Pro)

User report: https://jeffreyepsteel.github.io/Hyptile-Island/ never gets past loading on an iPhone 17 Pro, in Safari
and in Chrome (both WebKit). The only console line is the harmless "ShoreWaves.buildDirTexture: no shore field data"
warning, so the game reaches terrain setup and then fails silently (a rejected promise, a lost device, a pipeline that
WebKit refuses, a limit we exceed, or memory). We have no iPhone here: the fix is (a) visibility and (b) running the
engine inside WebKit's WebGPU limits and strictness, verified headlessly with Dawn by forcing the spec's DEFAULT limits.

Owned files: src/engine/** (GPU.js device request, Shader.js, buffers, textures, pipelines), src/core/Globals.js,
src/core/Quality.js (mobile tier only if needed), src/main.js and src/ui/UI.js (ONLY the fatal-error card and ?diag page),
src/ocean/**, src/sky/**, src/post/**, src/materials/**, src/world/terrain/**, src/world/vegetation/** (shader fixes only),
tools/perf/headless.mjs (a --limits=default mode), test/engine-smoke.mjs, test/feature-ios.mjs (new). Any other file:
report the exact patch. Read docs/PERF.md for the headless Dawn harness (--backend=vulkan --dawn=<dir>; the dir prepared
earlier is C:\Users\mario\AppData\Local\Temp\claude\D--fishing-game\55e4d7d9-1ce2-4512-b14e-ddd7873f81fd\scratchpad\w4-perf\dawn).

1. Visibility first. Every failure after the loader must show on screen (phones have no console): wrap init and the
   first frames so that a rejected promise, a device.lost, an uncapturederror (validation / out-of-memory / internal),
   a pipeline or shader compilation error (getCompilationInfo messages with the shader name) and a timeout of the
   loading stage (no progress for 45 s) produce a readable card with the message, the adapter/device info and a Copy
   button, plus the stage that was running ("compiling shaders 32/400: WaterMaterial"). Add `?diag`: a page (no game)
   that prints navigator.gpu presence, adapter info (vendor/architecture/description via adapter.info or
   requestAdapterInfo), adapter.features, every adapter.limits value, the screen/devicePixelRatio, memory hints and the
   user agent, with a Copy button, so the user can send us an iPhone screenshot. Also log each loading stage to the
   error log so a hang is attributable.
2. Limits. GPU.js requests limits above the spec defaults (read it). On WebKit, adapter.limits are often the defaults
   (maxStorageBuffersPerShaderStage 8, maxStorageTexturesPerShaderStage 4, maxSampledTexturesPerShaderStage 16,
   maxSamplersPerShaderStage 16, maxUniformBufferBindingSize 64 KiB, maxStorageBufferBindingSize 128 MiB,
   maxBufferSize 256 MiB, maxTextureDimension2D 8192, maxColorAttachmentBytesPerSample 32, maxBindGroups 4,
   maxDynamicStorageBuffersPerPipelineLayout 4, maxDynamicUniformBuffersPerPipelineLayout 8, maxComputeWorkgroupStorageSize
   16384, maxComputeInvocationsPerWorkgroup 256, maxComputeWorkgroupsPerDimension 65535, maxInterStageShaderVariables 16,
   maxVertexBuffers 8, maxVertexAttributes 16). Never request a limit above adapter.limits (requestDevice rejects);
   clamp to what the adapter offers and record the clamped set on the GPU object. Then make every subsystem respect it:
   add `--limits=default` to tools/perf/headless.mjs and `node test/engine-smoke.mjs --limits=default` that request a
   device with NO requiredLimits (the spec defaults) and run the full app boot + a few frames; fix every failure that
   appears (too many storage buffers / sampled textures in one stage -> split or pack; uniform blocks over 64 KiB ->
   storage or chunks; textures over 8192; MRT byte budgets; compute workgroup sizes; dynamic buffer counts). Keep the
   desktop path identical when the limits are available.
3. WebKit strictness. Audit the WGSL for things Dawn accepts but WebKit rejects or lacks: derivative-uniformity in
   non-uniform control flow (textureSample inside branches on non-uniform values: use textureSampleLevel/Grad or
   restructure), `f16` without the feature, unused/unbound bindings in a bind group layout, `bgra8unorm-storage`,
   `rg11b10ufloat-renderable`, `float32-filterable` (sampling r32float/rgba32float with a filtering sampler is INVALID
   without the feature: find every float32 texture that is sampled with 'linear' and switch to nearest or rgba16float),
   `depth32float-stencil8`, `texture-compression-*` assumptions, `timestamp-query` (Profiler.js: must be fully optional),
   `indirect-first-instance`, `read-write` storage textures, `rgba8unorm` storage textures (not guaranteed: check
   format support), 3D texture limits, `textureNumLevels` on non-sampled textures, `@builtin(sample_index)`, `dpdx` in
   compute, `pack4x8` family, `workgroupUniformLoad`. Make each either conditional on `device.features` / format support
   with a fallback, or removed.
4. Memory on a phone: with the Low tier the GPU memory must stay under ~1 GB total (textures capped at 1024 px already
   on phones; check buffers: the FFT ocean cascades, terrain tiles, CDLOD, skinning buffers, particle pools, Rapier).
   Measure the allocation total in the headless run (sum of createBuffer/createTexture sizes: add a counter to GPU.js)
   at Low with default limits and report it; cut anything avoidable on the mobile tier.
5. iOS specifics: canvas configure with `alphaMode: 'opaque'` and the preferred format from navigator.gpu.getPreferredCanvasFormat();
   no `requestAdapter({ powerPreference })` failure path (Safari may return null for 'high-performance': retry without
   options); AudioContext only after a gesture (done by the mobile worker); avoid `OffscreenCanvas` / `createImageBitmap`
   options Safari lacks (check loaders: `imageOrientation`, `premultiplyAlpha`, `colorSpaceConversion`); `fetch` of
   `.glb` with range requests; `import.meta.env` usage in workers; top-level await in modules is fine. The service
   worker is absent (fine).
6. Tests: test/feature-ios.mjs (static audit: no float32 linear sampling, every requested limit <= defaults unless
   guarded, Profiler optional without timestamp-query) and the `--limits=default` boot in engine-smoke; keep npm test
   green and the vite build clean.
Report under 350 words: what actually failed under default limits (with the first error text), what you changed, the
measured GPU memory at Low, and what remains unverifiable without a device.
