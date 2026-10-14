// An independent, empirical fit for old preset parameters. This does not use
// editor shaders and does not assert equivalence to the original material.
export function legacyHighlight(roughness) {
  const r = Math.max(.05, Number(roughness) || 1);
  return {strength: Math.min(1.5, r * .45), power: Math.max(1, 24 / (r * r))};
}

export function legacyHandleGlow(bladeGlow, mask) {
  // In this fit, the handle mask identifies reflective regions. We attenuate
  // their emission rather than treating handleColor's fourth component as a
  // Vain glow control. This interpretation still needs visual game validation.
  return Math.max(0, bladeGlow) * (1 - Math.max(0, Math.min(1, mask)));
}
