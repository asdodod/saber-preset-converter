import test from 'node:test';
import assert from 'node:assert/strict';
import {gaussianWeights, exposedLight} from '../preview-bloom.js';
import {convert} from '../engine.js';
import * as s from '../schema.js';

test('diffusion conserves a constant light field and is symmetric', () => {
  for (const sigma of [.5, 3, 6]) {
    const weights = gaussianWeights(sigma);
    assert.ok(Math.abs(weights[0] + 2 * weights.slice(1).reduce((a, b) => a + b, 0) - 1) < 1e-12);
    assert.ok(weights.every((value, i) => value > 0 && (i === 0 || value <= weights[i - 1])));
  }
});

test('turning bloom off and zero-emission surfaces preserve their base color', () => {
  const color = [.1, .2, .3];
  assert.deepEqual(exposedLight(color, 4, false), color);
  assert.deepEqual(exposedLight(color, 0), color);
  const glowing = exposedLight(color, 2);
  assert.ok(glowing.every((value, i) => value > color[i]));
  assert.ok(glowing[2] > glowing[0]);
});

test('legacy reflective handles retain lighting without becoming white emitters', () => {
  const mask = s.mask();
  mask.handleMask = s.constant(1);
  mask.bladeMappings.colorOverValue = s.constant(s.color([1, 0, 0], 2));
  const module = s.module('blur-saber', 1, {...s.common('Arbitrary handle'), SaberSettings: {
    zOffsetFrom: -.15, zOffsetTo: 0, thickness: 1, saberProfile: s.constant(1),
    handleRoughness: 2.5, handleColor: s.color([1, 1, 1], 1), maskSettings: mask,
  }});
  const output = convert({data: {Modules: [module]}, assets: new Map()}, 'Unrelated filename', 'vain');
  const part = output.data.Parts[0];
  assert.equal(part.Lit, true);
  assert.ok(part.SpecularStrength > 0 && part.SpecularPower > 0);
  assert.ok(part.Rings.every(ring => ring.Glow === 0));
  assert.ok(part.Rings.every(ring => ring.CustomWeight === 0));
  assert.ok(output.report.warnings.some(warning => warning.code === 'legacy_handle_lighting'));
});

test('reverse glow compensates target material gain and covers the full Fresnel range', () => {
  const mask = s.mask();
  mask.bladeMappings.colorOverValue = s.constant(s.color([1, 0, 0], .4));
  mask.surfaceAngleMappings.alphaOverValue = s.curve([[0, .2], [1, .8]]);
  const module = s.module('blur-saber', 2, {...s.common('Glass'), MeshSettings: {
    zOffsetFrom: 0, zOffsetTo: 1, radius: .01, saberProfile: s.constant(1),
  }, MaterialSettings: {...s.material(), maskSettings: mask}});
  const part = convert({data: {Modules: [module]}, assets: new Map()}, 'Glass', 'vain').data.Parts[0];
  assert.ok(Math.abs(part.Rings[20].Glow * .8 - .4) < 1e-12);
  assert.equal(part.OpacityMultiplierGradient[0].Value, .2);
  assert.equal(part.OpacityMultiplierGradient.at(-1).Value, .8);
});
