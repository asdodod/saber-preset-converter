import {lower,fromBase64,evaluateCurve,lerp,clamp} from './engine.js?v=20261013-4';
import {matrix,multiply,identity} from './math.js?v=20261013-4';
import * as s from './schema.js?v=20261013-4';

export function previewAssets(parsed,resources=new Map()){
  const assets=new Map(parsed.assets);for(const [name,bytes] of resources)assets.set(name,bytes);
  const add=p=>{for(const [key,folder] of [['ColorTexture','textures'],['GlowTexture','textures'],['ObjFile','geometry']]){const encoded=p[key==='ObjFile'?'ObjBase64':key+'Base64'];if(encoded)assets.set(folder+'/'+(p[key]||'embedded'),fromBase64(encoded));}};
  for(const p of [...(parsed.data.Parts||parsed.data.parts||[]),...(parsed.data.TipTrails||parsed.data.tipTrails||[]),...(parsed.data.BladeTrails||parsed.data.bladeTrails||[])])add(Object.fromEntries(Object.entries(p).map(([k,v])=>[Object.keys(s.vainPart('')).find(x=>x.toLowerCase()===k.toLowerCase())||k,v])));
  return assets;
}
export function assetBytes(assets,name,folder='textures'){if(!name||name.toLowerCase()==='none')return null;return assets.get(folder+'/'+name)||assets.get(name)||assets.get(name.replaceAll('\\','/').split('/').pop())||null;}
export function gradient(list,t,def){const points=(list||[]).map(lower).sort((a,b)=>a.time-b.time);if(!points.length)return def;if(t<=points[0].time)return points[0].value;for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];if(t<=b.time){let u=b.time>a.time?(t-a.time)/(b.time-a.time):1;if(a.easing===1)u*=u;if(a.easing===2)u*=2-u;if(a.easing===3)u=u<.5?2*u*u:-1+(4-2*u)*u;return lerp(a.value,b.value,u);}}return points.at(-1).value;}
export function vainRings(p){
  if(p.geometrymode===1&&p.rings?.length)return p.rings.map(lower);
  const a=Array.from({length:65},(_,i)=>{const t=i/64;return {position:t,radius:lerp(p.startradius??.008,p.endradius??.003,t)*(1+4*t*(1-t)*(p.bulgeamount||0)),color:lerp(p.startcolor||[1,1,1],p.endcolor||[1,1,1],t),customweight:lerp(p.startcustomweight??1,p.endcustomweight??1,t),glow:lerp(p.startglow??1,p.endglow??1,t),opacity:lerp(p.startopacity??1,p.endopacity??1,t),inverted:!!p.inverted};});
  if(p.enableendcaps&&(p.length||0)>0){a.unshift({...a[0],radius:0,position:-(p.startradius||0)*.25*(p.endcapextension??.25)/p.length});a.push({...a.at(-1),radius:0,position:1+(p.endradius||0)*.25*(p.endcapextension??.25)/p.length});}return a;
}
export function buildPreview(parsed,resources){
  const assets=previewAssets(parsed,resources),parts=[],trails=[],warnings=[];
  if(Array.isArray(parsed.data.Parts||parsed.data.parts)){
    const data=lower(parsed.data),raw=data.parts.map(lower);
    function resolve(i,seen=new Set()){const p=raw[i],link=p.linkedpartindex;if(Number.isInteger(link)&&link>=0&&link<raw.length&&link!==i&&!seen.has(link))return {...resolve(link,new Set([...seen,link])),name:p.name,position:p.position,rotation:p.rotation};return p;}
    raw.forEach((_,i)=>{const p=resolve(i);if(p.geometrymode===2){warnings.push((p.name||'Sprite')+': sprite geometry is not rendered.');return;}parts.push({kind:'vain',name:p.name,rings:vainRings(p),length:p.length??1,world:matrix(s.transform(p.position,p.rotation)),p,texture:p.colortexture,glowTexture:p.glowtexture,model:p.geometrymode===3?p.objfile:null,modelScale:p.objscale??1,blur:p.blur??1,queue:3001+(p.renderqueueoffset||0),depth:!p.disabledepthprepass,side:0});});
    if(data.usecustomtrails){for(const [list,blade] of [[data.tiptrails||[],false],[data.bladetrails?.length?data.bladetrails:data.bladetrail?[data.bladetrail]:[],true]])for(const raw of list){const p=lower(raw);if(p.noiseenabled&&blade){warnings.push('Vertex Noise is excluded from preview.');continue;}trails.push({kind:'vain',p,blade});}}
  }else{
    function visit(ms,parent=identity(),override=null){for(const m of ms){const c=m.Config||{};if(c.Enabled===false)continue;const world=multiply(parent,matrix(c.LocalTransform)),colorOverride=c.ForceColorOverride?c.ColorOverride:override;
      if(m.ModuleId==='reezonate.blur-saber'){const mesh=m.Version===1?c.SaberSettings:c.MeshSettings,mat=m.Version===1?mesh:c.MaterialSettings,mask=mat?.maskSettings||{},mapped=mask.bladeMappings||{},from=mesh.zOffsetFrom??0,to=mesh.zOffsetTo??1,radius=mesh.radius??((mesh.thickness??1)*.0112),times=[...new Set([0,1,...Array.from({length:129},(_,i)=>i/128),...(mesh.saberProfile?.controlPoints||[]).map(p=>clamp(p.time))])].sort((a,b)=>a-b),rings=times.map(t=>{const col=evaluateCurve(mapped.colorOverValue,t,s.color([1,0,0])),h=m.Version===1?clamp(evaluateCurve(mask.handleMask,t,0)):0,color=lerp(col,mat.handleColor||s.color([.1,.1,.1],0),h);return {position:from+(to-from)*t,uvPosition:t,radius:radius*evaluateCurve(mesh.saberProfile,t,1)*evaluateCurve(mapped.scaleOverValue,t,1),color:[color.r,color.g,color.b],customweight:0,glow:color.a*(mat.glowMultiplier??1),opacity:evaluateCurve(mapped.alphaOverValue,t,1),inverted:false};});if(mesh.startCap)rings.unshift({...rings[0],radius:0});if(mesh.endCap)rings.push({...rings.at(-1),radius:0});parts.push({kind:'ree',name:c.Name,rings,length:1,world,p:mat,texture:c.TexturesSettings?.mainTextureId,glowTexture:c.TexturesSettings?.glowMapTextureId,opacityTexture:c.TexturesSettings?.opacityTextureId,tiling:c.TexturesSettings?.tilingLayout,blur:mat.blurFrames??2,queue:mat.renderQueue??3001,depth:!!mat.depthWrite,side:mat.cullMode??0,colorOverride});}
      else if(m.ModuleId==='reezonate.custom-model'){const mat=c.MaterialSettings||{},col=mat.color||s.color([1,0,0]);parts.push({kind:'ree',name:c.Name,world,p:mat,model:c.MeshSettings?.modelId,modelScale:c.MeshSettings?.scale??1,rings:[{color:[col.r,col.g,col.b],glow:col.a,opacity:mat.opacity??1,customweight:0}],texture:c.TexturesSettings?.mainTextureId,glowTexture:c.TexturesSettings?.glowMapTextureId,opacityTexture:c.TexturesSettings?.opacityTextureId,queue:mat.renderQueue??3001,depth:!!mat.depthWrite,side:mat.cullMode??0,colorOverride});}
      else if(m.ModuleId==='reezonate.simple-trail')trails.push({kind:'ree',p:c,world,blade:c.MaterialSettings?.trailType===1,colorOverride});
      else if(m.ModuleId!=='reezonate.empty')warnings.push((c.Name||m.ModuleId)+' is not rendered.');
      visit(m.Children||[],world,colorOverride);
    }}visit(parsed.data.Modules||[],matrix(parsed.data.LocalTransform));
  }
  return {parts:parts.sort((a,b)=>a.queue-b.queue),trails,assets,warnings:[...new Set(warnings)]};
}

export function tubeBuffers(rings,length=1,count=32){const positions=[],colors=[],values=[],uvs=[],indices=[];
  rings.forEach((r,j)=>{for(let i=0;i<=count;i++){const a=i/count*2*Math.PI,sign=r.inverted?-1:1,rad=Math.abs(r.radius)<.0002?0:Math.abs(r.radius);positions.push((r.offsetx||0)+Math.sin(a)*rad,(r.offsety||0)+Math.cos(a)*rad*sign,r.position*length);colors.push(...r.color);values.push(r.glow??1,r.opacity??1,r.customweight??0);uvs.push(sign*i/count+.5*(1-sign),(r.uvPosition??r.position)+(r.uvoffset||0));}if(j)for(let i=0;i<count;i++){const a=(j-1)*(count+1)+i,b=a+1,c=a+count+2,d=a+count+1;indices.push(a,d,b,b,d,c);}});
  return {positions,colors,values,uvs,indices};
}
