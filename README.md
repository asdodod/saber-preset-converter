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

This is a format/parameter translator, not a guaranteed 1:1 renderer. The browser does not reproduce either game's shaders.

Vain → Ree transfers simple/advanced profiles, colors, opacity, textures, trails, linked parts and rotation animators. Folded/offset rings and custom UV geometry preserve original ring order and winding in Custom Models. Per-ring RGB/glow/opacity and PNG/JPEG albedo are baked into UV atlases. These models lose VainSabers blur. Nonlinear easing, motion effects, rim shading, side restriction and animated texture atlases are approximate or unsupported.

Ree → Vain supports Blur Saber v1/v2, OBJ Custom Model, Simple Trail and nested Empty transforms. Nested transforms are flattened; non-uniform/reflected/sheared tube/model transforms are baked into OBJ. RotationSpeed maps to per-part Euler animators; group orbit motion may differ. GLB, particles/VFX, dynamic bones/joints, clones, vanilla-saber modules and other unmatched modules are explicitly reported. Supported children of unsupported modules are still traversed in their static transforms. A preset containing only unsupported visible modules fails instead of creating an empty result.

Legacy Ree `thickness` uses `thickness × 11.2 mm`, calibrated against matching v1/v2 exports. Constant, linear, ease and smooth curves are sampled according to their interpolation modes. Legacy Ree handle masks and handle colors are baked into per-ring note-color weights, neutral RGB and glow. PBR/angle/driver masks, normal/metallic/roughness/color masks and some material effects have no exact inverse. Vain output always follows live note colors for chromatic regions; white/grey/dark regions remain neutral. HDR color gain beyond the available blend range is approximated through glow. Simple Trail type 1 is mapped to a blade ribbon and type 0 to a tip trail. These inferences require checking against the original.

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
