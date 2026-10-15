import test from 'node:test';
import assert from 'node:assert/strict';
import {atlasLayout,atlasUV} from '../texture-atlas.js';
import {convert,png} from '../engine.js';
import {decodeImage} from '../textures.js';
import * as s from '../schema.js';

test('flipbook frame selection advances in rows and wraps',()=>{
  assert.deepEqual(atlasUV(.5,.5,{x:3,y:2},{x:2},0),[1/6,.25]);
  assert.deepEqual(atlasUV(.5,.5,{x:3,y:2},{x:2},1.5),[1/6,.75]);
  assert.deepEqual(atlasUV(.5,.5,{x:3,y:2},{x:2},3),[1/6,.25]);
});

test('atlas flips reorder cells without mirroring pixels inside a frame',()=>{
  const a=atlasLayout({x:2,y:2},{x:10,y:1,z:1},0);assert.equal(a.z,.5);assert.equal(a.w,.5);
  const first=atlasUV(.1,.2,{x:2,y:2},{x:10,y:1,z:1},0),second=atlasUV(.9,.8,{x:2,y:2},{x:10,y:1,z:1},0);
  assert.ok(first[0]<second[0]&&first[1]<second[1]);
  assert.deepEqual(atlasUV(.2,.7,{x:1,y:1},{y:1,z:1},10),[.2,.7]);
});

test('part export extracts one color/glow frame before Advanced UV resampling',()=>{
  const color=new Uint8Array(4*4*4),palette=[[255,0,0,255],[0,255,0,255],[0,0,255,255],[255,255,0,255]];
  for(let y=0;y<4;y++)for(let x=0;x<4;x++)color.set(palette[Math.floor(y/2)*2+Math.floor(x/2)],(y*4+x)*4);
  const bytes=png(4,4,color),assets=new Map([['textures/atlas.png',bytes]]);
  const part={...s.vainPart('Water'),GeometryMode:1,ColorTexture:'atlas.png',GlowTexture:'atlas.png',ColorAtlasCount:{x:2,y:2},ColorAtlasSpeedFlip:{x:37,y:0,z:1},GlowAtlasCount:{x:2,y:2},GlowAtlasSpeedFlip:{x:37,y:1,z:0},Rings:[{Position:0,Radius:.01,CustomWeight:1,Color:[1,1,1],Glow:1,Opacity:1},{Position:1,Radius:.01,CustomWeight:1,Color:[1,1,1],Glow:1,Opacity:1}]};
  const out=convert({data:{Parts:[part],UseCustomTrails:true},assets},'Unrelated preset','ree');
  const tex=out.data.Modules[0].Children[0].Config.TexturesSettings;
  for(const [id,expected] of [[tex.mainTextureId,palette[0]],[tex.glowMapTextureId,palette[3]]]){const image=decodeImage(out.assets.get('textures/'+id));for(let i=0;i<image.data.length;i+=4)assert.deepEqual([...image.data.slice(i,i+4)],expected);}
  assert.equal(out.report.warnings.filter(w=>w.code==='texture_atlas_frame').length,2);
});

test('a Sprite keeps within-frame pixel orientation and the selected tile size',()=>{
  const pixels=new Uint8Array([10,0,0,255,20,0,0,255,30,0,0,255,40,0,0,255]);
  const p={...s.vainPart('Atlas sprite'),GeometryMode:2,ColorTexture:'sheet.png',ColorAtlasCount:{x:2,y:1},ColorAtlasSpeedFlip:{x:0,y:1,z:0}};
  const output=convert({data:{Parts:[p],UseCustomTrails:true},assets:new Map([['textures/sheet.png',png(4,1,pixels)]])},'Sprite','ree');
  const id=output.data.Modules[0].Config.TexturesSettings.mainTextureId,image=decodeImage(output.assets.get('textures/'+id));assert.equal(image.width,2);assert.deepEqual([...image.data],[30,0,0,255,40,0,0,255]);
});

test('translucent rings and angular opacity masks cannot become solid depth blockers',()=>{
  for(const fields of [{StartOpacity:.5,EndOpacity:.5},{OpacityMultiplierGradient:[{Time:0,Value:1},{Time:1,Value:0}]}]){
    const p={...s.vainPart('Transparent layer'),...fields};
    const out=convert({data:{Parts:[p],UseCustomTrails:true},assets:new Map()},'Layer','ree');assert.equal(out.data.Modules[0].Config.MaterialSettings.depthWrite,false);
  }
  const opaque=convert({data:{Parts:[s.vainPart('Solid')],UseCustomTrails:true},assets:new Map()},'Solid','ree');assert.equal(opaque.data.Modules[0].Config.MaterialSettings.depthWrite,true);
});

test('a texture alpha hole does not acquire an invisible depth-writing face',()=>{
  const p={...s.vainPart('Cutout'),ColorTexture:'cutout.png'},assets=new Map([['textures/cutout.png',png(2,1,new Uint8Array([255,255,255,255,255,255,255,0]))]]);
  const o=convert({data:{Parts:[p],UseCustomTrails:true},assets},'Cutout','ree');assert.equal(o.data.Modules[0].Config.MaterialSettings.depthWrite,false);
});

test('a negatively depth-biased opaque body covers transparent detail without filename rules',()=>{
  const body={...s.vainPart('Body'),DepthOffset:-.02,RenderQueueOffset:-8},detail={...s.vainPart('Detail'),StartOpacity:.7,EndOpacity:.7,RenderQueueOffset:9};
  const o=convert({data:{Parts:[body,detail],UseCustomTrails:true},assets:new Map()},'Unrelated model','ree');
  const [solid,transparent]=o.data.Modules.map(m=>m.Config.MaterialSettings);assert.ok(solid.renderQueue>transparent.renderQueue);assert.equal(transparent.depthWrite,false);assert.equal(solid.depthWrite,true);
  body.DepthOffset=0;const normal=convert({data:{Parts:[body,detail],UseCustomTrails:true},assets:new Map()},'No bias','ree');assert.ok(normal.data.Modules[0].Config.MaterialSettings.renderQueue<normal.data.Modules[1].Config.MaterialSettings.renderQueue);
});
