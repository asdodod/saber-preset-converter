import test from 'node:test';
import assert from 'node:assert/strict';
import {offsetTransforms} from '../native-offsets.js';
import {matrix,multiply,identity,point} from '../math.js';
import {convert,evaluateCurve} from '../engine.js';
import * as s from '../schema.js';

test('nested native transforms retain a shear exactly, including the texture basis',()=>{
  for(const [kx,ky] of [[.2,0],[-.4,.7],[10,15]]){
    let world=identity();for(const transform of offsetTransforms(kx,ky,.02,-.03))world=multiply(world,matrix(transform));
    for(const p of [[0,0,0],[.01,.02,.3],[-.03,.04,-.1]]){
      const expected=[p[0]+kx*p[2]+.02,p[1]+ky*p[2]-.03,p[2]],actual=point(world,p);
      assert.ok(actual.every((v,i)=>Math.abs(v-expected[i])<1e-10));
    }
  }
});

test('offset inward caps and negative interior colors stay in native tubes',()=>{
  const raw={...s.vainPart('Any inward preset'),GeometryMode:1,Length:1,Inverted:true,Rings:[
    {Position:0,Radius:.0001,OffsetX:.008,Color:[-1,-1,-1],CustomWeight:0,Glow:0,Opacity:1,Inverted:true},
    {Position:.01,Radius:.01,OffsetX:0,Color:[-1,-1,-1],CustomWeight:0,Glow:0,Opacity:1,Inverted:true},
    {Position:.23,Radius:.01,OffsetX:0,Color:[-1,-1,-1],CustomWeight:0,Glow:0,Opacity:1,Inverted:true},
  ]};
  const result=convert({data:{Parts:[raw],UseCustomTrails:true},assets:new Map()},'Unrelated filename','ree'),parts=[];
  function visit(ms){for(const m of ms){if(m.ModuleId==='reezonate.blur-saber')parts.push(m);assert.notEqual(m.ModuleId,'reezonate.custom-model');visit(m.Children||[]);}}visit(result.data.Modules);
  assert.equal(parts.length,2);
  for(const part of parts){const material=part.Config.MaterialSettings;assert.equal(material.cullMode,1);assert.ok(material.blurFrames>0);const color=evaluateCurve(material.maskSettings.bladeMappings.colorOverValue,.5);assert.deepEqual([color.r,color.g,color.b],[-1,-1,-1]);}
  assert.equal(result.report.statistics.parts,1);
});

test('a flat cap remains a native surface with less than two micrometres of extrusion',()=>{
  const raw={...s.vainPart('Flat cap'),GeometryMode:1,Rings:[{Position:0,Radius:.0001,Color:[0,0,0],CustomWeight:1},{Position:0,Radius:.01,Color:[0,0,0],CustomWeight:1}]};
  const result=convert({data:{Parts:[raw],UseCustomTrails:true},assets:new Map()},'Flat','ree'),native=result.data.Modules[0].Children[0];assert.equal(native.ModuleId,'reezonate.blur-saber');assert.ok(native.Config.MeshSettings.zOffsetTo-native.Config.MeshSettings.zOffsetFrom<2e-6);
});

test('softness is independent of history time and trails',()=>{
  const module=s.module('blur-saber',2,{...s.common('Blur'),MeshSettings:{radius:.01,saberProfile:s.constant(1)},MaterialSettings:{...s.material(),blurFrames:1,blurSensitivity:3}});
  const source={data:{Modules:[module]},assets:new Map()},normal=convert(source,'Normal','vain'),soft=convert(source,'Soft','vain',new Map(),{softness:.3});
  assert.equal(normal.data.Parts[0].BlurFade,3);assert.equal(soft.data.Parts[0].BlurFade,.3);assert.equal(normal.data.Parts[0].Blur,soft.data.Parts[0].Blur);assert.throws(()=>convert(source,'Bad','vain',new Map(),{softness:NaN}),/softness/);
});
