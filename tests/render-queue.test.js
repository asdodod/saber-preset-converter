import test from 'node:test';
import assert from 'node:assert/strict';
import {convert} from '../engine.js';
import {buildPreview} from '../preview-data.js';
import {previewOrders,VAIN_QUEUE_BASE,toVainQueue,toReeQueue} from '../render-queue.js';
import * as s from '../schema.js';

const parsed=data=>({data,assets:new Map()});
function source(){return parsed({Parts:[
  {...s.vainPart('Shell'),RenderQueueOffset:0},
  {...s.vainPart('Inner'),RenderQueueOffset:1,Inverted:true},
],UseCustomTrails:true,BladeTrails:[{Position:[0,0,1],Width:0,Length:50,QueueOffset:-2}],TipTrails:[{Position:[0,0,1],Width:.01,Length:50,QueueOffset:2}]});}

test('part and trail queues share one rebase, preserving inverted inner +1',()=>{
  const input=source(),ree=convert(input,'Any preset','ree');
  const queues=ree.data.Modules.map(m=>m.Config.MaterialSettings.renderQueue??m.Config.MaterialSettings.generalSettings.renderQueue);
  assert.deepEqual(queues,[3001,3002,3003,2999]);
  const back=convert(parsed(ree.data),'Round trip','vain').data;
  assert.deepEqual(back.Parts.map(p=>p.RenderQueueOffset),[0,1]);
  assert.equal(back.Parts[1].Inverted,true);
  assert.ok(back.Parts[1].Rings.every(r=>r.Inverted));
  assert.equal(back.BladeTrails[0].QueueOffset,-2);
  assert.equal(back.TipTrails[0].QueueOffset,2);
});

test('queue ties and explicit inner-before-shell order do not gain inferred offsets',()=>{
  const input=source();input.data.Parts[1].RenderQueueOffset=-3;
  input.data.TipTrails[0].QueueOffset=0;
  const output=convert(input,'Different name','ree');
  assert.equal(output.data.Modules[1].Config.MaterialSettings.renderQueue,2998);
  assert.equal(output.data.Modules[0].Config.MaterialSettings.renderQueue,output.data.Modules[2].Config.MaterialSettings.generalSettings.renderQueue);
  for(const q of [0,2450,2990,3001,4100])assert.equal(toReeQueue(toVainQueue(q)),q);
});

test('preview merges animated trails and part passes in queue order',()=>{
  const preview=buildPreview(source()),orders=previewOrders(preview.parts,preview.trails);
  assert.deepEqual(preview.parts.map(p=>p.queue),[VAIN_QUEUE_BASE,VAIN_QUEUE_BASE+1]);
  const blade=preview.trails.find(t=>t.blade),tip=preview.trails.find(t=>!t.blade);
  assert.ok(orders.get(blade)<orders.get(preview.parts[0]));
  assert.ok(orders.get(preview.parts[1])<orders.get(tip));
  assert.equal(orders.get(preview.parts[1])-orders.get(preview.parts[0]),3);
});
