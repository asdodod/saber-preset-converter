import test from 'node:test';
import assert from 'node:assert/strict';
import {convert,evaluateCurve,fromBase64,png} from '../engine.js';
import {buildPreview,tubeBuffers,gradient} from '../preview-data.js';
import {vainRings,vainRingVertices,spriteBuffers} from '../vain-geometry.js';
import {decodeImage,imageSample} from '../textures.js';
import {animatedWorld,animatedTrailCenters} from '../preview-animation.js';
import {point} from '../math.js';
import * as s from '../schema.js';
const parsed=data=>({data,assets:new Map()});
const part=p=>parsed({Parts:[{...s.vainPart('Unrelated preset'),...p}],UseCustomTrails:true});
test('simple geometry follows native ring counts, vertex limits and cap UVs',()=>{
  const p={length:.2,minimumrings:7,enableendcaps:true,startradius:.012,endradius:.003,manualringverts:true,ringvertsmanual:100};
  const rings=vainRings(p);assert.equal(rings.length,9);assert.equal(vainRingVertices(p),20);assert.equal(rings[0].uvPosition,0);assert.equal(rings.at(-1).uvPosition,1);assert.ok(rings[0].position<0);assert.ok(rings.at(-1).position>1);
  const mesh=tubeBuffers(rings,p.length,20,{vain:true});assert.equal(mesh.normals.length,mesh.positions.length);assert.ok(mesh.normals.every(Number.isFinite));
});
test('Sprite subdivisions, UV orientation and both faces survive preview and export',()=>{
  const data=part({GeometryMode:2,SpriteSizeX:.4,SpriteSizeY:.2,SpriteDivisionsX:3,SpriteDivisionsY:2,DoubleSided:true});
  const source=buildPreview(data);assert.equal(source.parts[0].sprite.positions.length/3,24);assert.equal(source.parts[0].sprite.indices.length,72);assert.deepEqual(source.parts[0].sprite.positions.slice(0,3),[-.2,.1,0]);assert.equal(source.warnings.length,0);
  const result=convert(data,'Any filename','ree'),model=result.data.Modules[0].Config.MeshSettings.modelId,text=new TextDecoder().decode(result.assets.get('geometry/'+model));assert.equal(text.split('\n').filter(l=>l.startsWith('v ')).length,24);assert.equal(text.split('\n').filter(l=>l.startsWith('f ')).length,24);
});
test('Vain gradient easing belongs to the destination key',()=>{assert.equal(gradient([{Time:0,Value:0,Easing:0},{Time:1,Value:1,Easing:1}],.5,0),.25);});
test('opacity transfer respects the Vain shader exponent in both directions',()=>{
  const forward=convert(part({StartOpacity:.25,EndOpacity:.25}),'Arbitrary','ree');assert.equal(evaluateCurve(forward.data.Modules[0].Config.MaterialSettings.maskSettings.bladeMappings.alphaOverValue,.5),.125);
  const reverse=convert(parsed(forward.data),'Another name','vain');assert.ok(Math.abs(reverse.data.Parts[0].Rings[20].Opacity-.25)<1e-8);
});
test('constant Advanced offsets retain native blur and angular masks',()=>{
  const data=part({GeometryMode:1,Length:.2,Rings:[{Position:0,Radius:.01,OffsetX:.005,Color:[0,0,0],CustomWeight:1,Glow:1,Opacity:1},{Position:1,Radius:.02,OffsetX:.005,Color:[0,0,0],CustomWeight:1,Glow:1,Opacity:1}],RimPowerGradient:[{Time:0,Value:-.8},{Time:1,Value:1}],GlowAddendGradient:[{Time:0,Value:0},{Time:1,Value:2}],OpacityMultiplierGradient:[{Time:0,Value:.2},{Time:1,Value:1}]});
  const result=convert(data,'Not Flame','ree');const list=[];function visit(ms){for(const m of ms){list.push(m);visit(m.Children||[]);}}visit(result.data.Modules);const native=list.find(m=>m.ModuleId==='reezonate.blur-saber'),c=native.Config;assert.equal(list.some(m=>m.ModuleId==='reezonate.custom-model'),false);assert.ok(c.MaterialSettings.blurFrames>0);assert.ok(evaluateCurve(c.MaterialSettings.maskSettings.surfaceAngleMappings.alphaOverValue,0)<.3);assert.equal(evaluateCurve(c.MaterialSettings.maskSettings.bladeMappings.colorOverValue,.5).a,.8);
});
test('separate opacity texture and UV tiling are combined for Vain output',()=>{
  const m=s.module('custom-model',1,{...s.common('Masked model'),MeshSettings:{modelId:'plane.obj',scale:1},MaterialSettings:{...s.material('model'),color:s.color([1,0,0]),opacity:.5},TexturesSettings:{...s.textures(),opacityTextureId:'alpha.png',tilingLayout:{x:2,y:1,z:0,w:0}}});
  const input=parsed({Modules:[m]});input.assets.set('geometry/plane.obj',new TextEncoder().encode('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n'));input.assets.set('textures/alpha.png',png(1,1,new Uint8Array([64,64,64,255])));
  const result=convert(input,'All models','vain'),p=result.data.Parts[0],texture=decodeImage(fromBase64(p.ColorTextureBase64));assert.ok(Math.abs(texture.data[3]/255-64/255)<1e-8);assert.ok(Math.abs(p.StartOpacity**1.5-.5)<1e-8);assert.equal(p.DisableDepthPrepass,true);
});
test('mirrored texture wrapping repeats reflected UVs',()=>{const image={width:2,height:1,data:new Uint8Array([255,0,0,255,0,0,255,255])};assert.deepEqual(imageSample(image,1.75,.5,2),[1,0,0,1]);assert.deepEqual(imageSample(image,-1.25,.5,2),[0,0,1,1]);});
test('HDR note brightness remains RGB gain rather than becoming extra glow',()=>{
  const m=s.module('blur-saber',2,{...s.common('HDR'),MeshSettings:{zOffsetFrom:0,zOffsetTo:1,radius:.01,saberProfile:s.constant(1)},MaterialSettings:s.material()});m.Config.MaterialSettings.maskSettings.bladeMappings.colorOverValue=s.constant(s.color([1.5,0,0],2));
  const p=convert(parsed({Modules:[m]}),'Any HDR preset','vain').data.Parts[0],r=p.Rings[0],gain=1+p.RimPowerGradient[0].Value;
  assert.equal(r.Glow*.8,2);assert.ok(Math.abs(gain*(r.Color[0]*(1-r.CustomWeight)+.8*r.CustomWeight)-1.5)<1e-8);
  m.Config.MaterialSettings.maskSettings.bladeMappings.colorOverValue=s.constant(s.color([1,0,0],2));
  const normal=convert(parsed({Modules:[m]}),'Normal RGB','vain').data.Parts[0];assert.equal(normal.Rings[0].Glow,r.Glow);
});
test('native parent rotation moves children around their parent pivot',()=>{
  const root=s.empty('Orbit');root.Config.RotationSpeed=s.vec([0,0,360]);const child=s.module('blur-saber',2,{...s.common('Sphere',[.02,0,0]),MeshSettings:{radius:.01,saberProfile:s.constant(1)},MaterialSettings:s.material()});root.Children=[child];
  const data=buildPreview(parsed({Modules:[root]})),a=point(animatedWorld(data.parts[0],0),[0,0,0]),b=point(animatedWorld(data.parts[0],.25),[0,0,0]);assert.ok(Math.abs(a[0]-.02)<1e-8);assert.ok(Math.abs(b[1]-.02)<1e-8);assert.ok(Math.abs(b[0])<1e-8);
  const history=animatedTrailCenters({kind:'ree',transforms:data.parts[0].transforms,p:{MeshSettings:{TrailLength:.25},MaterialSettings:{offset:0}}},.25,2);assert.ok(Math.abs(history[0][1]-.02)<1e-8);assert.ok(Math.abs(history[1][0]-.02)<1e-8);
});

test('tilted Vain rotations retain the same Euler axes at several animation times',()=>{
  const source=part({GeometryMode:2,Position:[.03,.02,-.1],Rotation:[96,90,-90],Animators:[{$type:'RotationAdder, VainSabers',Axis:0,Speed:180},{$type:'RotationAdder, VainSabers',Axis:2,Speed:21}]});
  const output=convert(source,'Any animated sprite','ree'),a=buildPreview(source).parts[0],b=buildPreview({data:output.data,assets:output.assets}).parts[0];
  for(const time of [0,.13,.5,1.7]){const before=animatedWorld(a,time),after=animatedWorld(b,time);assert.ok(before.every((v,i)=>Math.abs(v-after[i])<1e-9));}
});
