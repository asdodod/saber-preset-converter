import * as T from './vendor/three.module.js';

// Independent preview optics. No game/editor shader, texture or render code is
// used here. A normalized Gaussian diffusion and a simple sensor response are
// deliberately adjustable approximations, not a claim of engine equivalence.
export function gaussianWeights(sigma = 3, radius = 8) {
  if (!(sigma > 0) || !Number.isInteger(radius) || radius < 0) throw Error('Invalid Gaussian kernel.');
  const weights = Array.from({length: radius + 1}, (_, i) => Math.exp(-i * i / (2 * sigma * sigma)));
  const sum = weights[0] + 2 * weights.slice(1).reduce((a, b) => a + b, 0);
  return weights.map(value => value / sum);
}

export const opticsDefaults = Object.freeze({emission: 2.8, scatter: .9, core: .12});

// Kept alongside GLSL so the optical response can be checked numerically.
export function exposedLight(rgb, glow, enabled = true, optics = opticsDefaults) {
  const color = rgb.map(value => Math.max(0, value));
  const g = enabled ? Math.max(0, glow) : 0;
  const peak = Math.max(...color);
  const veil = optics.core * g * g * peak;
  return color.map(value => value * (1 + g * optics.emission) + veil);
}

const vertex = `varying vec2 q;
void main(){q=uv;gl_Position=vec4(position.xy,0.,1.);}`;

const extract = `precision highp float;
uniform sampler2D colorImage, glowImage;
uniform float emission;
varying vec2 q;
void main(){
  vec3 color=max(vec3(0.),texture2D(colorImage,q).rgb);
  float glow=max(0.,texture2D(glowImage,q).r);
  // Bloom is driven by the visible composited surface, not by hidden meshes.
  gl_FragColor=vec4(color*glow*emission,1.);
}`;

const diffuse = `precision highp float;
uniform sampler2D image;
uniform vec2 stepSize;
uniform float weights[9];
varying vec2 q;
void main(){
  vec3 color=texture2D(image,q).rgb*weights[0];
  for(int i=1;i<=8;i++){
    vec2 d=stepSize*float(i);
    color+=(texture2D(image,q+d).rgb+texture2D(image,q-d).rgb)*weights[i];
  }
  gl_FragColor=vec4(color,1.);
}`;

const combine = `precision highp float;
uniform sampler2D colorImage, glowImage, closeHalo, wideHalo;
uniform float enabled, emission, scatter, core;
varying vec2 q;
vec3 toDisplay(vec3 color){
  color=clamp(color,0.,1.);
  return mix(color*12.92,1.055*pow(color,vec3(1./2.4))-.055,step(vec3(.0031308),color));
}
void main(){
  vec3 color=max(vec3(0.),texture2D(colorImage,q).rgb);
  float glow=max(0.,texture2D(glowImage,q).r)*enabled;
  float peak=max(color.r,max(color.g,color.b));
  vec3 light=color*(1.+glow*emission)+vec3(core*glow*glow*peak);
  vec3 halo=texture2D(closeHalo,q).rgb*.7+texture2D(wideHalo,q).rgb*.3;
  gl_FragColor=vec4(toDisplay(light+halo*scatter*enabled),1.);
}`;

export class PreviewBloom {
  constructor(renderer) {
    this.renderer = renderer;
    this.optics = {...opticsDefaults};
    this.scene = new T.Scene();
    this.camera = new T.Camera();
    this.geometry = new T.PlaneGeometry(2, 2);
    this.quad = new T.Mesh(this.geometry);
    this.scene.add(this.quad);
    const material = (fragmentShader, uniforms) => new T.ShaderMaterial({
      vertexShader: vertex, fragmentShader, uniforms, depthTest: false, depthWrite: false,
    });
    this.extract = material(extract, {
      colorImage: {value: null}, glowImage: {value: null}, emission: {value: this.optics.emission},
    });
    this.diffuse = material(diffuse, {
      image: {value: null}, stepSize: {value: new T.Vector2()}, weights: {value: gaussianWeights()},
    });
    this.combine = material(combine, {
      colorImage: {value: null}, glowImage: {value: null}, closeHalo: {value: null}, wideHalo: {value: null},
      enabled: {value: 1}, emission: {value: this.optics.emission}, scatter: {value: this.optics.scatter}, core: {value: this.optics.core},
    });
    // Each comparison column has its own light buffers. Clamp-to-edge prevents
    // bloom bleeding from a bright source into a different preset's column.
    this.targets = Array.from({length: 4}, () => new T.WebGLRenderTarget(1, 1, {
      type: T.HalfFloatType, depthBuffer: false, minFilter: T.LinearFilter, magFilter: T.LinearFilter,
    }));
  }

  pass(material, target, width, height) {
    const dpr = this.renderer.getPixelRatio();
    this.renderer.setRenderTarget(target);
    this.renderer.setViewport(0, 0, width / dpr, height / dpr);
    this.quad.material = material;
    this.renderer.render(this.scene, this.camera);
  }

  draw(color, glow, enabled, viewport) {
    const {width, height, x, dpr} = viewport;
    const w = Math.max(1, Math.ceil(width / 2)), h = Math.max(1, Math.ceil(height / 2));
    for (const target of this.targets) if (target.width !== w || target.height !== h) target.setSize(w, h);
    const [source, scratch, close, wide] = this.targets;
    this.extract.uniforms.colorImage.value = color;
    this.extract.uniforms.glowImage.value = glow;
    this.extract.uniforms.emission.value = this.optics.emission;
    if (enabled) {
      this.pass(this.extract, source, w, h);
      const blur = (input, output, radius) => {
        this.diffuse.uniforms.image.value = input.texture;
        this.diffuse.uniforms.stepSize.value.set(radius / w, 0);
        this.pass(this.diffuse, scratch, w, h);
        this.diffuse.uniforms.image.value = scratch.texture;
        this.diffuse.uniforms.stepSize.value.set(0, radius / h);
        this.pass(this.diffuse, output, w, h);
      };
      blur(source, close, .55 * dpr);
      blur(source, wide, 2.1 * dpr);
    }
    const u = this.combine.uniforms;
    u.colorImage.value = color; u.glowImage.value = glow;
    u.closeHalo.value = close.texture; u.wideHalo.value = wide.texture;
    u.enabled.value = enabled ? 1 : 0;
    for (const key of ['emission', 'scatter', 'core']) u[key].value = this.optics[key];
    this.renderer.setRenderTarget(null);
    this.renderer.setViewport(x / dpr, 0, width / dpr, height / dpr);
    this.renderer.setScissor(x / dpr, 0, width / dpr, height / dpr);
    this.renderer.setScissorTest(true);
    this.quad.material = this.combine;
    this.renderer.render(this.scene, this.camera);
    this.renderer.setScissorTest(false);
  }

  dispose() {
    for (const target of this.targets) target.dispose();
    for (const material of [this.extract, this.diffuse, this.combine]) material.dispose();
    this.geometry.dispose();
  }
}
