import test from 'node:test';
import assert from 'node:assert/strict';
import {reeColorPolicy} from '../preview-color.js';
import {convert} from '../engine.js';
import {buildPreview} from '../preview-data.js';
import * as s from '../schema.js';

test('explicit Original keeps fixed colors, while default and NotesColor follow the hand',()=>{
  assert.equal(reeColorPolicy({type:0},1).type,0);
  assert.equal(reeColorPolicy(null,1).type,3);
  assert.equal(reeColorPolicy({type:3,colorSource:1},1).note,0);
  assert.equal(reeColorPolicy({type:3,colorSource:2},1).note,0);
  assert.equal(reeColorPolicy({type:3,colorSource:3},0).note,1);
});

test('fixed Advanced colors export as Original without freezing live-color siblings',()=>{
  const fixed={...s.vainPart('Fixed color'),GeometryMode:1,Rings:[{Position:0,Radius:.01,Color:[.8,0,.6],CustomWeight:0,Glow:1},{Position:1,Radius:.01,Color:[.8,0,.6],CustomWeight:0,Glow:1}]};
  const live={...s.vainPart('Live color')};
  const output=convert({data:{Parts:[fixed,live],UseCustomTrails:true},assets:new Map()},'Not a named preset','ree');
  const parts=buildPreview({data:output.data,assets:output.assets}).parts;
  assert.equal(parts[0].colorOverride.type,0);
  assert.equal(parts[1].colorOverride,null);
  for(const hand of [0,1])assert.equal(reeColorPolicy(parts[0].colorOverride,hand).type,0);
  assert.deepEqual(parts[0].rings[0].color,[.8,0,.6]);
});

test('neutral and negative fixed colors survive nested offset groups',()=>{
  const part={...s.vainPart('Interior'),GeometryMode:1,Rings:[{Position:0,Radius:.01,OffsetX:0,Color:[-1,-1,-1],CustomWeight:0},{Position:1,Radius:.01,OffsetX:.01,Color:[-1,-1,-1],CustomWeight:0}]};
  const output=convert({data:{Parts:[part],UseCustomTrails:true},assets:new Map()},'Interior','ree');
  const p=buildPreview({data:output.data,assets:output.assets}).parts[0];
  assert.equal(p.colorOverride.type,0);assert.deepEqual(p.rings[0].color,[-1,-1,-1]);
});

test('OBJ and Sprite use the start color rather than unused end-color settings',()=>{
  for(const mode of [2,3]){
    const part={...s.vainPart('Fixed object'),GeometryMode:mode,StartColor:[1,1,0],StartCustomWeight:0,EndCustomWeight:1,ObjFile:'triangle.obj'};
    const assets=new Map([['geometry/triangle.obj',new TextEncoder().encode('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n')]]);
    const o=convert({data:{Parts:[part],UseCustomTrails:true},assets},'Fixed object','ree');
    const p=buildPreview({data:o.data,assets:o.assets}).parts[0];assert.equal(p.colorOverride.type,0);assert.deepEqual(p.rings[0].color,[1,1,0]);
  }
});

test('a red surface-angle mask on a white blade remains note-colored after export',()=>{
  const mat=s.material();mat.maskSettings.bladeMappings.colorOverValue=s.constant(s.color([1,1,1],.5));mat.maskSettings.surfaceAngleMappings.colorOverValue=s.curve([[0,s.color([1,.05,.05],1)],[1,s.color([1,0,0],.6)]]);
  const module=s.module('blur-saber',2,{...s.common('Angular color'),MeshSettings:{radius:.01,zOffsetFrom:0,zOffsetTo:1,saberProfile:s.constant(1)},MaterialSettings:mat});
  const result=convert({data:{Modules:[module]},assets:new Map()},'Another preset','vain');
  assert.ok(result.data.Parts[0].Rings.every(r=>r.CustomWeight>.95));
  const p=result.data.Parts[0],r=p.Rings[30],gain=1+p.RimPowerGradient[30].Value;
  assert.ok(Math.abs(gain*(r.Color[0]*(1-r.CustomWeight)+.8*r.CustomWeight)-1)<1e-8);
});
