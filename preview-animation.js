import {matrix,multiply,identity,vector,point} from './math.js?v=20261015-1';
const axis=a=>typeof a==='string'?{X:0,Y:1,Z:2}[a]:a??0;
const type=a=>String(a.$type||'').split(',')[0];
export const animationTypes=new Set(['RotationAdder','RotationOscillator','PositionOscillator','HueShiftAdder','HueShiftOscillator']);
export function animatedWorld(part,time){
  if(part.kind==='vain'){
    const p=part.p,position=[...(p.position||[0,0,0])],rotation=[...(p.rotation||[0,0,0])];
    for(const a of p.animators||[]){const kind=type(a),i=axis(a.Axis??a.axis),speed=a.Speed??a.speed??30,amplitude=a.Amplitude??a.amplitude??.5,frequency=a.Frequency??a.frequency??.5;if(i<0||i>2)continue;if(kind==='RotationAdder')rotation[i]+=speed*time;if(kind==='RotationOscillator')rotation[i]+=amplitude*Math.sin(2*Math.PI*frequency*time);if(kind==='PositionOscillator')position[i]+=amplitude*Math.sin(2*Math.PI*frequency*time);}
    return matrix({Position:{x:position[0],y:position[1],z:position[2]},Rotation:{x:rotation[0],y:rotation[1],z:rotation[2]}});
  }
  if(!part.transforms)return part.world||identity();
  let world=identity();for(const node of part.transforms){const base=matrix(node.transform),speed=vector(node.speed),spin=matrix({Rotation:{x:speed[0]*time,y:speed[1]*time,z:speed[2]*time}});world=multiply(world,multiply(base,spin));}return world;
}
export function animatedHue(part,time){
  if(part.kind==='ree')return (part.colorOverride?.hueShiftPerSecond||0)*time*2*Math.PI;
  let delta=0;for(const a of part.p.animators||[]){if(type(a)==='HueShiftAdder')delta+=(a.Speed??a.speed??.5)*time;if(type(a)==='HueShiftOscillator')delta+=(a.Amplitude??a.amplitude??.5)*Math.sin(2*Math.PI*(a.Frequency??a.frequency??.5)*time);}return delta*2*Math.PI;
}
export function animatedTrailCenters(trail,time,count=48){
  const length=trail.p.MeshSettings?.TrailLength??.14,offset=trail.p.MaterialSettings?.offset??0;
  return Array.from({length:count},(_,i)=>point(animatedWorld(trail,time-length*i/(count-1)),[0,0,offset]));
}
