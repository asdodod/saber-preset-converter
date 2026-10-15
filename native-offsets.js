// Express a centreline shear using ordinary nested rotation/scale transforms.
// SVD keeps each child a native tube; no OBJ or copied renderer is involved.
export function offsetTransforms(kx, ky, x = 0, y = 0) {
  const k = Math.hypot(kx, ky), degrees = 180 / Math.PI;
  if (k < 1e-10) return [{Position: {x, y, z: 0}}];
  const align = Math.atan2(ky, kx), angle = Math.atan2(2 * k, k * k) / 2;
  const scale = (Math.sqrt(k * k + 4) + k) / 2;
  const spin = Math.atan2(Math.cos(angle) * k + Math.sin(angle), Math.cos(angle));
  return [
    {Position: {x, y, z: 0}, Rotation: {x: 0, y: 0, z: align * degrees}},
    {Rotation: {x: 0, y: -angle * degrees, z: 0}, Scale: {x: scale, y: 1, z: 1 / scale}},
    {Rotation: {x: 0, y: spin * degrees, z: 0}},
    {Rotation: {x: 0, y: 0, z: -align * degrees}},
  ];
}

export function offsetRuns(rings, length) {
  if (rings.length < 2 || !(length > 0)) return null;
  const result = [], epsilon = 1e-6 / length;
  let direction = 0, run = [];
  const same = (a, b) => Math.abs(a - b) < 1e-8;
  for (let i = 1; i < rings.length; i++) {
    let a = {...rings[i - 1]}, b = {...rings[i]}, thin = false;
    const originalA = a.position, originalB = b.position;
    if (Math.abs(b.position - a.position) < 1e-12) {
      // A native tube requires an axial interval. A one-micrometre cap avoids
      // zero-length normals while keeping the original UV position.
      a.position -= epsilon / 2; b.position += epsilon / 2; thin = true;
    }
    const sign = Math.sign(b.position - a.position), dz = (b.position - a.position) * length;
    const kx = ((b.offsetx || 0) - (a.offsetx || 0)) / dz;
    const ky = ((b.offsety || 0) - (a.offsety || 0)) / dz;
    const x = (a.offsetx || 0) - kx * a.position * length;
    const y = (a.offsety || 0) - ky * a.position * length;
    const current = result.at(-1);
    if (run.length && current && !thin && !current.thin && sign === direction && same(kx, current.kx) && same(ky, current.ky) && same(x, current.x) && same(y, current.y)) {
      run.push({...b, uvPosition: originalB});
    } else {
      run = [{...a, uvPosition: originalA}, {...b, uvPosition: originalB}];
      result.push({rings: run, kx, ky, x, y, thin});
    }
    direction = sign;
    if (result.length > 256) return null;
  }
  return result;
}
