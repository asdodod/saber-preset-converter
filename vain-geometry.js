// Static geometry from VainSabers BlurSaberPart / GpuBlurMeshBuilder.
// Input fields are case-normalized; this module has no conversion or filename rules.
const limit=(v,a,b)=>Math.max(a,Math.min(b,v));
const mix=(a,b,t)=>Array.isArray(a)?a.map((x,i)=>mix(x,b[i],t)):a+(b-a)*t;
const normalize=r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k.toLowerCase(),v]));
export function vainRingVertices(p){
  if(p.manualringverts)return limit(Math.round(p.ringvertsmanual??20),4,20);
  const radius=[1,'Advanced'].includes(p.geometrymode)?Math.max(.05,...(p.rings||[]).map(r=>Math.abs(normalize(r).radius))):Math.max(p.startradius??.03,p.endradius??.03);
  return limit(Math.round(6+30*limit(radius/.02,0,1)),6,36);
}
export function vainRings(p){
  const length=p.length??.1;
  if([1,'Advanced'].includes(p.geometrymode)&&p.rings?.length){
    const rings=p.rings.map(normalize);
    return rings.map((r,i)=>{const prev=rings[(i-1+rings.length)%rings.length],next=rings[(i+1)%rings.length],signed=x=>(x.inverted?-1:1)*x.radius;let a=r.position-prev.position,b=next.position-r.position;if(a<=0)a++;if(b<=0)b++;return {...r,slope:Math.abs(r.radius)<.0002||length<.0001||a+b<=.0001?0:(signed(next)-signed(prev))/((a+b)*length)};});
  }
  const count=Math.max(2,Math.trunc(length*8),p.minimumrings??4);
  if(count>2048)throw Error('Too many profile rings.');
  const start=p.startradius??.03,end=p.endradius??.03,bulge=p.bulgeamount||0;
  const rings=Array.from({length:count},(_,i)=>{const t=i/(count-1),rad=mix(start,end,t),gain=1+4*t*(1-t)*bulge;return {position:t,uvPosition:t,radius:rad*gain,slope:length>.0001?((end-start)*gain+rad*4*(1-2*t)*bulge)*(p.inverted?-1:1)/length:0,color:mix(p.startcolor??[0,0,0],p.endcolor??[0,0,0],t),customweight:mix(p.startcustomweight??1,p.endcustomweight??1,t),glow:mix(p.startglow??1,p.endglow??1,t),opacity:mix(p.startopacity??1,p.endopacity??1,t),inverted:!!p.inverted};});
  if((p.enableendcaps??true)&&length>1e-9){rings.unshift({...rings[0],radius:0,slope:0,position:-start*.25*(p.endcapextension??.25)/length});rings.push({...rings.at(-1),radius:0,slope:0,position:1+end*.25*(p.endcapextension??.25)/length});}
  return rings;
}
export function spriteBuffers(p){
  const nx=limit(Math.trunc(p.spritedivisionsx??1),1,128),ny=limit(Math.trunc(p.spritedivisionsy??1),1,128),w=p.spritesizex??.2,h=p.spritesizey??.2;
  const out={positions:[],normals:[],colors:[],values:[],uvs:[],indices:[]};
  for(let side=0;side<(p.doublesided?2:1);side++){
    const base=out.positions.length/3;
    for(let y=0;y<=ny;y++)for(let x=0;x<=nx;x++){out.positions.push((x/nx-.5)*w,(.5-y/ny)*h,0);out.normals.push(0,0,side?-1:1);out.colors.push(...(p.startcolor||[0,0,0]));out.values.push(p.startglow??1,p.startopacity??1,p.startcustomweight??1);out.uvs.push(x/nx,y/ny);}
    for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const a=base+y*(nx+1)+x,b=a+1,c=a+nx+1,d=c+1;out.indices.push(...(side?[a,b,c,b,d,c]:[a,c,b,b,c,d]));}
  }
  return out;
}
export function spriteObj(p){const b=spriteBuffers(p),lines=[];for(let i=0;i<b.positions.length;i+=3)lines.push('v '+b.positions.slice(i,i+3).join(' '));for(let i=0;i<b.uvs.length;i+=2)lines.push('vt '+b.uvs.slice(i,i+2).join(' '));for(let i=0;i<b.normals.length;i+=3)lines.push('vn '+b.normals.slice(i,i+3).join(' '));for(let i=0;i<b.indices.length;i+=3)lines.push('f '+b.indices.slice(i,i+3).map(x=>`${x+1}/${x+1}/${x+1}`).join(' '));return lines.join('\n')+'\n';}
