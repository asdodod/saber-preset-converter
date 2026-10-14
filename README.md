# VainSabers / ReeSabers converter

A browser-local converter between **VainSabers** and **ReeSabers**. Supports `.vainsaber`, `.reesaber` and JSON presets, individual downloads, batch ZIP downloads, embedded textures/OBJ resources, a simple English-only interface.

No server or account is involved in conversion. Preset files stay in browser memory. The ZIP library is vendored, so there are no external CDN dependencies, fonts, analytics or runtime API calls.

## Use

1. Select the conversion direction, then add presets. The first input automatically selects its matching direction.
2. Add resource files if textures/OBJ models are stored separately from the preset.
3. Set the VainSabers global blur time and VR refresh rate. Defaults: 25 ms and 90 Hz.
4. Convert, inspect the report, and download individual outputs or the batch ZIP.

Open `.reesaber` outputs with the [ReeSabers editor](https://reesabers.beatleader.com/), or put them into `UserData/ReeSabers/Presets`. Put `.vainsaber` outputs into the VainSabers preset directory (`UserData/VainSabers`, as configured by the mod).

## Accuracy

This is a format/parameter translator, not a guaranteed 1:1 renderer. The independently written preview follows Vain preset geometry, color, opacity, inversion and lighting parameters. It uses an original analytic reflection environment and a separate Gaussian bloom pipeline. It does not contain code, shaders, textures or compiled resources from the Ree editor. Lighting and bloom are visual approximations; a game screenshot remains the reference.

Vain -> Ree transfers simple/advanced profiles, colors, opacity, textures, trails, linked parts and rotation animators. Axially symmetric Advanced rings, including folded caps, become groups of native Blur Saber tubes. Geometry reversals split the surface into monotonic runs with matching culling; per-ring color/glow/opacity stay in material curves, while PNG/JPEG UV offsets are resampled into textures. These tubes retain motion blur. Offset or mixed-inversion geometry falls back to a Custom Model and loses blur. Simple caps use displaced zero-radius profile points. Blade effects with Vertex Noise are omitted; ordinary blade and tip trails remain. Nonlinear easing, motion effects, rim shading, side restriction and animated texture atlases are approximate or unsupported.

Ree -> Vain supports Blur Saber v1/v2, OBJ Custom Model, Simple Trail and nested Empty transforms. Nested transforms are flattened; non-uniform/reflected/sheared tube/model transforms are baked into OBJ. RotationSpeed maps to per-part Euler animators; group orbit motion may differ. GLB, particles/VFX, dynamic bones/joints, clones, vanilla-saber modules and other unmatched modules are explicitly reported. Supported children of unsupported modules are still traversed in their static transforms. A preset containing only unsupported visible modules fails instead of creating an empty result.

Legacy Ree `thickness` uses `thickness x 11.2 mm`, calibrated against matching v1/v2 exports. Curve modes were checked against the public editor: Ease 0, Linear 1, Constant 2, Smooth 3. Ease uses smoothstep; Smooth uses sampled cubic Hermite interpolation and remains approximate. Legacy Ree handle masks and colors are fitted into per-ring note-color weights and neutral RGB. For legacy materials with handleRoughness, reflective regions receive a fitted Vain Lit highlight, with emission attenuated by the handle mask. This is an empirical translation; the legacy shader is not reproduced. Target glow compensates the inherited Vain Lit/unlit material gain. PBR/viewing-angle/driver masks, normal/metallic/roughness/color masks and some material effects have no exact inverse. Vain output always follows live note colors for chromatic regions; white/grey/dark regions remain neutral. HDR note-color RGB gain is retained through a material rim multiplier, with neutral regions rescaled to preserve their brightness. Live note-color tonemapping still differs. Simple Trail type 1 is mapped to a blade ribbon and type 0 to a tip trail. Ribbon length/width alpha, taper and glow masks are baked into texture maps. Vain ribbon alpha has an intrinsic fade toward its base, so full cross-width equivalence is not possible. Vain tip trails ignore texture IDs and have a fixed LineRenderer width profile; the converter fits the visible width band and truncates history at terminal zero taper/alpha, with remaining differences reported.

Conversion reports enumerate approximations, omissions and missing assets. Strict resource mode fails when a required resource is absent. Files over 128 MB, ZIPs expanding beyond 128 MB, path traversal and excessively deep JSON/module trees are rejected. Inputs are never modified.

## Local development

Buildless ES modules, CSS and HTML. No installation is needed.

```sh
python -m http.server 4173 --directory .
node --test tests/*.test.js
```

Open `http://localhost:4173`. Serve over HTTP: module workers are not supported when opening the HTML through `file://`.

## GitHub Pages

Publish the `main` branch root with GitHub Pages. `.nojekyll` disables Jekyll. All paths are relative and work at a project URL such as `https://USERNAME.github.io/saber-preset-converter/`.

Only application source belongs in this repository. Private/user presets, model/texture examples, desktop executables and the original closed-source mod are not distributed. Tests use synthetic numeric parameters.

## Credits and license

Independent community tool; not affiliated with ReeSabers, BeatLeader or VainSabers.

VainSabers serialization/geometry semantics were checked against the public [Vainstains/VainSabers](https://github.com/Vainstains/VainSabers) source. ReeSabers field structures were inferred from user-provided presets and its public editor UI.

Application code: MIT, see `LICENSE`. ZIP/PNG compression: [fflate 0.8.3](https://github.com/101arrowz/fflate), MIT; its license is included in `vendor/fflate-LICENSE.txt`.

JPEG decoding: jpeg-js 0.4.4 decoder, adapted to ES modules; Apache 2.0 license is included in `vendor/jpeg-js-LICENSE.txt`.

## Browser comparison preview

After adding a preset, the source appears in a WebGL preview. Conversion adds a second view; Add reference accepts another local JSON/.reesaber/.vainsaber file for a third 3D view, or PNG/JPEG/WebP for an unchanged game screenshot alongside the models. References remain local. All model views share one camera. Drag to rotate, scroll to zoom, or select Handle to inspect the handle. Front, Side, Handle, Blade tip, End-on, Reset view and Bloom are available. Clearing files hides the preview.

The source and target have independent loaders. Vain Simple/Advanced, Sprite grids (including both faces), OBJ normals, inversion/winding, native profile ring counts, embedded PNG/JPEG/OBJ resources, Fresnel RGB/glow/opacity gradients, depth prepass, side restrictions/mirroring and clip depth offsets are loaded directly. Vain opacity uses its native power of 1.5. Lit uses the public shader's diffuse, specular, metallic, smoothness and Fresnel rim calculations; reflections use an independently generated analytic environment rather than a copied cubemap. Ree Blur Saber v1/v2, OBJ models with mirroring/normal flips, nested/disabled modules, material masks and textures are loaded directly. Vertex Noise blade effects are excluded. GLB/VFX and other unsupported modules are reported.

This preview is an approximation. Ree surface-angle input uses a cosine-based approximation, not a reproduction of the original shader. Ree PBR lighting, animated textures, drivers, glow and motion effects differ. Compare with an actual game screenshot; matching preview views do not prove equivalent gameplay.

The converter has no preset-name rules or bundled user examples. The same geometry/material handlers process every input. Sprite export retains its subdivision grid, UV orientation and double-sided faces. Advanced Custom Model fallbacks retain surface-angle masks instead of baking them incorrectly along the blade length. Static Ree opacity maps and UV tiling can be resampled into Vain textures. Vain gradient easing uses the destination key, as in the public source.

Conversion now retains depth-write distinctions and transfers angular material masks. Vain angle gradients are no longer incorrectly sampled along the blade's length. Angle coordinate mapping and additive-versus-multiplicative glow differences are reported as approximations.

3D rendering uses a locally vendored Three.js 0.186.1 and OrbitControls (MIT); see vendor/three-LICENSE.txt. No external runtime CDN is used.


The generalized geometry and Lit formulas are based on the public [BlurSaberPart](https://github.com/Vainstains/VainSabers/blob/main/VainSabers/Sabers/BlurSaberPart.cs) and shader sources. Conversion tests use synthetic presets across geometry types, independent of private user files.

Native preset motion runs on a shared clock: Ree nested RotationSpeed groups, hue speed and UV scroll, plus Vain rotation/position oscillators and hue animators. Animated Ree trails sample the motion of their own parent hierarchy, including orbiting particles; the preview does not simulate swing or smear spheres. Physics joints, live input drivers, motion blur and special distortion remain unsupported.

## Independent bloom

The preview first composites signed surface RGB into a floating-point target. A separate scalar glow buffer follows visible part ordering and depth, so an opaque dark surface can hide a glowing interior. Negative color is retained until display composition. Static Vain opacity applies its exponent before angular and texture opacity, and inherited glow gain is .8 for unlit and .5 for Lit parts.

An original postprocess extracts visible emitted light, runs separable normalized Gaussian diffusion at two spatial radii, and combines the halos with a simple sensor response. Each comparison column has isolated buffers, preventing cross-preset bloom. The optical constants are a visual fit, not extracted values from Beat Saber or any editor. Bloom can be disabled for inspecting the underlying geometry and shading. No private presets or reference screenshots are bundled with the public site.
