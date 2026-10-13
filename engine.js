import {unzipSync,zipSync,strToU8,strFromU8,zlibSync} from './vendor/fflate.js?v=20261013-5';
import * as s from './schema.js?v=20261013-5';
import {identity,matrix,multiply,point,decompose,vector} from './math.js?v=20261013-5';
import {decodeImage,imageSample} from './textures.js?v=20261013-5';
export {zipSync,strToU8};
export const MAX_BYTES=128*1024*1024;
export const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)));
const copy=v=>structuredClone(v);
export function lower(v){if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Expected a JSON object.');return Object.fromEntries(Object.entries(v).map(([k,x])=>[k.toLowerCase(),x]));}
export function detect(d){const q=lower(d);return Array.isArray(q.parts)?'vain':Array.isArray(q.modules)?'ree':'unknown';}
export const safeName=n=>(String(n).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/g,'').slice(0,150)||'preset');
const basename=n=>String(n).replaceAll('\\','/').split('/').pop();
export function fromBase64(value){const raw=value.startsWith('data:')?value.slice(value.indexOf(',')+1):value;const bin=atob(raw);if(bin.length>MAX_BYTES)throw Error('Embedded asset exceeds 128 MB.');return Uint8Array.from(bin,c=>c.charCodeAt(0));}
export function toBase64(bytes){let text='';for(let i=0;i<bytes.length;i+=16384)text+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(text);}
function finiteTree(v,depth=0){if(depth>100)throw Error('JSON nesting is too deep.');if(typeof v==='number'&&!Number.isFinite(v))throw Error('Invalid numeric value.');if(v&&typeof v==='object')for(const item of Object.values(v))finiteTree(item,depth+1);}
export function parsePreset(bytes){
  if(bytes.length>MAX_BYTES)throw Error('File exceeds 128 MB.');let assets=new Map(),data;
  if(bytes[0]===80&&bytes[1]===75){
    // The filter runs before inflation, limiting total uncompressed size and traversal paths.
    let total=0;const entries=unzipSync(bytes,{filter:f=>{total+=f.originalSize;if(total>MAX_BYTES||f.originalSize>MAX_BYTES)throw Error('Uncompressed ZIP exceeds 128 MB.');if(f.name.includes('..')||f.name.startsWith('/')||f.name.includes('\\'))throw Error('Unsafe ZIP path.');return f.name==='preset.json'||/^(textures|geometry)\/[^/]+$/.test(f.name);}});
    if(!entries['preset.json'])throw Error('ZIP does not contain preset.json.');data=JSON.parse(strFromU8(entries['preset.json']).replace(/^\uFEFF/,''));
    for(const [name,content] of Object.entries(entries))if(name!=='preset.json')assets.set(name,content);
  }else data=JSON.parse(strFromU8(bytes).replace(/^\uFEFF/,''));
  finiteTree(data);if(detect(data)==='unknown')throw Error('Not a VainSabers or ReeSabers preset.');
  const binary=data.BinaryAssets;if(binary){for(const [group,folder] of [['Textures','textures'],['Geometry','geometry']])for(const entry of binary[group]||[])assets.set(folder+'/'+basename(entry.AssetName),fromBase64(entry.Data));}
  return {data,assets};
}
export function lerp(a,b,t){if(Array.isArray(a))return a.map((v,i)=>lerp(v,b[i],t));if(a&&typeof a==='object')return Object.fromEntries(Object.keys(a).map(k=>[k,lerp(a[k],b[k]??a[k],t)]));return Number(a)+(Number(b)-Number(a))*t;}
export function sample(points,t,def=0){if(!points.length)return def;if(t<=points[0][0])return points[0][1];for(let i=1;i<points.length;i++){let [a,av]=points[i-1],[b,bv]=points[i];if(t<=b)return b>a?lerp(av,bv,(t-a)/(b-a)):bv;}return points.at(-1)[1];}
const keys=(list=[],def=0)=>list.map(lower).map(k=>[Number(k.time||0),k.value??def]).sort((a,b)=>a[0]-b[0]);
const curveKeys=(curve,def=1)=>curve?.controlPoints?.map(k=>[Number(k.time),k.value]).sort((a,b)=>a[0]-b[0])||[[0,def]];
function crc32(bytes){let crc=-1;for(let b of bytes){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^-1)>>>0;}
function concat(...arrays){let out=new Uint8Array(arrays.reduce((a,b)=>a+b.length,0)),i=0;for(let a of arrays){out.set(a,i);i+=a.length;}return out;}
function uint32(v){let b=new Uint8Array(4);new DataView(b.buffer).setUint32(0,v);return b;}
export function png(w,h,rgba){function chunk(type,bytes){const content=concat(strToU8(type),bytes);return concat(uint32(bytes.length),content,uint32(crc32(content)));}let header=concat(uint32(w),uint32(h),new Uint8Array([8,6,0,0,0])),raw=new Uint8Array(h*(w*4+1));for(let y=0;y<h;y++)raw.set(rgba.subarray(y*w*4,(y+1)*w*4),y*(w*4+1)+1);return concat(new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlibSync(raw)),chunk('IEND',new Uint8Array()));}
function rgbToHsv([r,g,b]){let max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min,h=0;if(d)h=max===r?((g-b)/d)%6:max===g?(b-r)/d+2:(r-g)/d+4;return [((h/6)%1+1)%1,max?d/max:0,max];}
function hsvToRgb(h,sat,v){h=((h%1+1)%1)*6;let f=h%1,p=v*(1-sat),q=v*(1-f*sat),t=v*(1-(1-f)*sat);return [[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]][Math.floor(h)%6];}
function blended(rgb,weight,glow,hue=0){weight=clamp(weight);const mixed=rgb.map((c,i)=>(1-weight)*c+weight*(i===0?.8:0));if(!hue)return s.color(mixed,Math.max(0,glow));let [h,sat,v]=rgbToHsv(mixed);return s.color(hsvToRgb(h+hue,sat,v),Math.max(0,glow));}

class Context{
  constructor(name,inputAssets,resources,options){this.name=name;this.assets=new Map(inputAssets);this.resources=resources||new Map();this.warnings=[];this.stats={parts:0,trails:0,assets:0,skipped:0};this.options={fps:90,blurMs:25,strict:false,...options};const {fps,blurMs}=this.options;if(!Number.isFinite(fps)||fps<30||fps>240||!Number.isFinite(blurMs)||blurMs<0||blurMs>25)throw Error('VR refresh rate must be 30-240 Hz; blur must be 0-25 ms.');}
  warn(code,message,item=''){if(!this.warnings.some(w=>w.code===code&&w.message===message&&w.item===item))this.warnings.push({code,message,item});}
  add(name,bytes,folder='textures'){name=safeName(basename(name));let final=name,i=2;while(this.assets.has(folder+'/'+final)&&!equalBytes(this.assets.get(folder+'/'+final),bytes)){let dot=name.lastIndexOf('.');final=dot>0?name.slice(0,dot)+'_'+i+name.slice(dot):name+'_'+i;i++;}this.assets.set(folder+'/'+final,bytes);return final;}
  asset(name,encoded,folder='textures',item=''){if(encoded)return this.add(name||'embedded_'+this.assets.size+(folder==='geometry'?'.obj':'.png'),fromBase64(encoded),folder);if(!name||name.toLowerCase()==='none')return '';let leaf=basename(name),key=folder+'/'+leaf;if(this.assets.has(key))return leaf;let found=this.resources.get(name)||this.resources.get(leaf);if(found)return this.add(leaf,found,folder);if(folder==='textures'&&leaf.toLowerCase()==='whitepixel.png')return this.add(leaf,png(1,1,new Uint8Array([255,255,255,255])));let message='Missing asset: '+name+'. Add its texture/model file.';if(this.options.strict)throw Error(message);this.warn('missing_asset',message,item);return '';}
  embed(name,folder='textures',item=''){const actual=this.asset(name,null,folder,item);return actual?toBase64(this.assets.get(folder+'/'+actual)):null;}
}
function equalBytes(a,b){return a.length===b.length&&a.every((v,i)=>v===b[i]);}
function shadingWarnings(ctx,p,name){if(p.uselookdir)ctx.warn('look_direction','Fixed blur direction is not reproduced.',name);if(p.depthoffset)ctx.warn('depth_offset','Shader depth offset is not reproduced.',name);if(p.mirroronleft||![0,'Both',undefined].includes(p.side))ctx.warn('saber_side','Side restriction/mirroring is not reproduced; this part appears on both sabers.',name);if(p.rimfactor||p.rimperpendicular||(p.rimpowergradient||[]).some(k=>lower(k).value))ctx.warn('rim_shader','The VainSabers rim shader has no exact ReeSabers equivalent.',name);if(p.texturewrap!==undefined&&p.texturewrap!==1)ctx.warn('texture_wrap','Texture wrapping may differ.',name);for(let k of ['color','glow']){let a=p[k+'atlascount']||{},f=p[k+'atlasspeedflip']||{};if((a.x??1)!==1||(a.y??1)!==1||f.y||f.z)ctx.warn('texture_atlas','Animated texture atlases are kept as static textures.',name);}}
function ringsOf(p){
  if([1,'Advanced'].includes(p.geometrymode)&&p.rings?.length)return p.rings.map(lower);
  const rings=Array.from({length:33},(_,i)=>{let t=i/32;return {position:t,radius:lerp(p.startradius??.03,p.endradius??.03,t)*(1+4*(t-t*t)*(p.bulgeamount||0)),color:lerp(p.startcolor??[0,0,0],p.endcolor??[0,0,0],t),customweight:lerp(p.startcustomweight??1,p.endcustomweight??1,t),glow:lerp(p.startglow??1,p.endglow??1,t),opacity:lerp(p.startopacity??1,p.endopacity??1,t),inverted:!!p.inverted};});
  // Vain closes simple tubes at displaced zero-radius rings, not flat discs at an expanded full-width profile.
  if((p.enableendcaps??true)&&(p.length??.1)>1e-9){rings.unshift({...rings[0],position:-Math.abs(p.startradius??.03)*.25*(p.endcapextension??.25)/(p.length??.1),radius:0});rings.push({...rings.at(-1),position:1+Math.abs(p.endradius??.03)*.25*(p.endcapextension??.25)/(p.length??.1),radius:0});}
  return rings;
}
export function ringObj(rings,length=1,count=20){count=clamp(Math.round(count),3,128);let out=['# Saber converter ring geometry'];for(let r of rings)for(let i=0;i<=count;i++){let a=2*Math.PI*i/count,rad=Math.abs(r.radius),sign=r.inverted?-1:1;out.push(`v ${(r.offsetx||0)+rad*Math.sin(a)} ${(r.offsety||0)+sign*rad*Math.cos(a)} ${r.position*length}`);}for(let r of rings)for(let i=0;i<=count;i++){const sign=r.inverted?-1:1;out.push(`vt ${sign*i/count+.5*(1-sign)} ${r.position+(r.uvoffset||0)}`);}for(let j=0;j<rings.length-1;j++)for(let i=0;i<count;i++){let a=j*(count+1)+i+1,b=a+1,c=a+count+2,d=a+count+1;out.push(`f ${a}/${a} ${d}/${d} ${b}/${b}`,`f ${b}/${b} ${d}/${d} ${c}/${c}`);}return strToU8(out.join('\n')+'\n');}
function bakeRingModel(ctx,p,rings,index,tex){
  if(rings.length<2)return null;
  let main=null,glowImage=null;try{if(tex.mainTextureId)main=decodeImage(ctx.assets.get('textures/'+tex.mainTextureId));if(tex.glowMapTextureId)glowImage=decodeImage(ctx.assets.get('textures/'+tex.glowMapTextureId));}catch(error){ctx.warn('texture_bake',error.message+'; original texture retained without a baked ring gradient.',p.name);return null;}
  const count=clamp(Math.round(p.ringvertsmanual??20),3,128),width=256,tile=24,height=(rings.length-1)*tile;
  if(width*height>8e6)throw Error('Advanced ring texture atlas is too large.');
  const pixels=new Uint8Array(width*height*4),glowPixels=new Uint8Array(width*height*4),opacityPixels=new Uint8Array(width*height*4),glowAdd=keys(p.glowaddendgradient||[],0),opacityMult=keys(p.opacitymultipliergradient||[],1),maxGlow=Math.max(1e-6,...rings.map(r=>(p.disableglowpass?0:(r.glow??1)+sample(glowAdd,r.position,0))));
  let vertices=[],uvs=[],faces=[];
  for(let j=0;j<rings.length-1;j++){
    const pair=[rings[j],rings[j+1]],base=vertices.length;
    for(let k=0;k<2;k++){let r=pair[k],sign=r.inverted?-1:1;for(let i=0;i<=count;i++){const angle=2*Math.PI*i/count;vertices.push(`v ${(r.offsetx||0)+Math.abs(r.radius)*Math.sin(angle)} ${(r.offsety||0)+sign*Math.abs(r.radius)*Math.cos(angle)} ${r.position*(p.length??.1)}`);uvs.push(`vt ${i/count} ${1-(j*tile+(k?tile-.5:.5))/height}`);}}
    for(let i=0;i<count;i++){const a=base+i+1,b=a+1,c=a+count+2,d=a+count+1;faces.push(`f ${a}/${a} ${d}/${d} ${b}/${b}`,`f ${b}/${b} ${d}/${d} ${c}/${c}`);}
    for(let y=0;y<tile;y++){let t=y/(tile-1),r=lerp(pair[0],pair[1],t),rgb=blended(r.color||[0,0,0],r.customweight??1,0,p.hueshift||0),sign=r.inverted?-1:1,v=r.position+(r.uvoffset||0),opacity=clamp((r.opacity??1)*sample(opacityMult,r.position,1)),glow=p.disableglowpass?0:(r.glow??1)+sample(glowAdd,r.position,0);
      for(let x=0;x<width;x++){let u=sign*x/(width-1)+.5*(1-sign),albedo=imageSample(main,u,v,p.texturewrap??1),gtex=imageSample(glowImage,u,v,p.texturewrap??1),at=((j*tile+y)*width+x)*4;pixels.set([Math.floor(clamp(rgb.r*albedo[0])*255),Math.floor(clamp(rgb.g*albedo[1])*255),Math.floor(clamp(rgb.b*albedo[2])*255),255],at);const g=Math.floor(clamp(glow/maxGlow*gtex[0])*255);glowPixels.set([g,g,g,g],at);const alpha=Math.floor(clamp(opacity*albedo[3])*255);opacityPixels.fill(alpha,at,at+4);}
    }
  }
  tex.mainTextureId=ctx.add(`part_${index}_material.png`,png(width,height,pixels));tex.glowMapTextureId=ctx.add(`part_${index}_glow.png`,png(width,height,glowPixels));tex.opacityTextureId=ctx.add(`part_${index}_opacity.png`,png(width,height,opacityPixels));return {model:ctx.add(`part_${index}.obj`,strToU8([...vertices,...uvs,...faces].join('\n')+'\n'),'geometry'),maxGlow};
}
// Split only where the original surface doubles back. Each native tube keeps motion blur.
function ringRuns(rings){let runs=[],run=[rings[0]],direction=0;for(let i=1;i<rings.length;i++){let next=Math.sign(rings[i].position-rings[i-1].position);if(!next)return null;if(direction&&next!==direction){runs.push(run);run=[rings[i-1]];}run.push(rings[i]);direction=next;}runs.push(run);return runs;}
function remapTubeTextures(ctx,p,rings,index){
  const result={};if(!p.colortexture&&!p.glowtexture&&!p.colortexturebase64&&!p.glowtexturebase64)return result;
  const lo=rings[0].position,hi=rings.at(-1).position,uv= rings.map(r=>[r.position,r.position+(r.uvoffset||0)]),inverted=!!rings[0].inverted;
  for(const channel of ['color','glow']){const id=ctx.asset(p[channel+'texture'],p[channel+'texturebase64'],'textures',p.name);if(!id)continue;
    try{const image=decodeImage(ctx.assets.get('textures/'+id)),width=Math.min(1024,Math.max(128,image.width)),height=clamp(Math.ceil(Math.abs(hi-lo)*image.height),128,1024),pixels=new Uint8Array(width*height*4);
      for(let y=0;y<height;y++){const t=1-y/(height-1),v=sample(uv,lo+(hi-lo)*t);for(let x=0;x<width;x++){const u=inverted?1-x/(width-1):x/(width-1),color=imageSample(image,u,v,p.texturewrap??1);pixels.set(color.map(v=>Math.round(clamp(v)*255)),(y*width+x)*4);}}
      result[channel+'texture']=ctx.add('part_'+index+'_'+channel+'_uv.png',png(width,height,pixels));result[channel+'texturebase64']=null;
    }catch(error){return null;}
  }return result;
}
function advancedBlurPart(ctx,p,rings,index){
  if(rings.length<2||rings.some(r=>r.offsetx||r.offsety)||new Set(rings.map(r=>!!r.inverted)).size!==1)return null;
  const runs=ringRuns(rings);if(!runs||runs.length>64)return null;
  const children=[];for(let i=0;i<runs.length;i++){const reversed=runs[i][0].position>runs[i].at(-1).position,ordered=reversed?runs[i].toReversed():runs[i],textures=remapTubeTextures(ctx,p,ordered,index+'_'+i);if(textures===null)return null;
    const child=toReePart(ctx,{...p,...textures,name:runs.length>1?p.name+' '+(i+1):p.name,position:[0,0,0],rotation:[0,0,0],animators:[],_nativeRings:true,rings:ordered.map(r=>({...r,uvoffset:0,radius:Math.abs(r.radius)<.0002?0:r.radius}))},index+'_'+i);
    child.Config.MaterialSettings.cullMode=(!!ordered[0].inverted!==reversed)?1:0;children.push(child);
  }
  ctx.stats.parts-=children.length-1;const parent=s.empty(p.name||'Advanced Part');parent.Config.LocalTransform=s.transform(p.position,p.rotation);parent.Children=children;
  for(const raw of p.animators||[]){const a=lower(raw),type=String(a.$type||'').split(',')[0];if(type==='RotationAdder'){const axis={X:0,Y:1,Z:2}[a.axis]??a.axis??0;if(![0,1,2].includes(axis))throw Error('Invalid rotation axis.');parent.Config.RotationSpeed[['x','y','z'][axis]]+=a.speed??30;}else ctx.warn('animator',type+' is kept in its initial static state.',p.name);}
  return parent;
}
function toReePart(ctx,p,index){
  if(!p._nativeRings&&[1,'Advanced'].includes(p.geometrymode)){const native=advancedBlurPart(ctx,p,ringsOf(p),index);if(native)return native;}
  let name=p.name||'Part '+(index+1),config=s.common(name,p.position,p.rotation),rings=ringsOf(p),lo=Math.min(...rings.map(r=>r.position)),hi=Math.max(...rings.map(r=>r.position)),positions=rings.map(r=>hi>lo?(r.position-lo)/(hi-lo):0);
  for(let i=positions.length-2;i>=0;i--)if(positions[i]>=positions[i+1])positions[i]=Math.max(0,positions[i+1]-1e-6);for(let i=1;i<positions.length;i++)if(positions[i]<=positions[i-1])positions[i]=Math.min(1,positions[i-1]+1e-6);
  const ga=keys(p.glowaddendgradient||[],0),om=keys(p.opacitymultipliergradient||[],1),colors=[],opacity=[],radius=[];
  rings.forEach((r,i)=>{let t=positions[i];colors.push([t,blended(r.color||[0,0,0],r.customweight??1,p.disableglowpass?0:(r.glow??1),p.hueshift||0)]);opacity.push([t,clamp(r.opacity??1)]);radius.push([t,Math.abs(r.radius)]);});
  shadingWarnings(ctx,p,name);if(rings.some(r=>(r.customweight??1)!==1))ctx.warn('color_blend','Fixed/game color mixing is approximated using a red hue reference.',name);
  let mat=s.material(),tex=s.textures();Object.assign(mat,{renderQueue:3001+(p.renderqueueoffset||0),cullMode:p.inverted?1:0,metallic:clamp(p.metallic||0),roughness:1-clamp(p.smoothness||0),fresnelPower:Math.max(.01,p.fresnelpower??5),sceneLights:!!p.lit,sceneReflections:!!p.lit,envLightIntensity:p.lit?1:0,reflectionIntensity:p.lit?(p.cubemapstrength??.78):0});
  tex.mainTextureId=ctx.asset(p.colortexture,p.colortexturebase64,'textures',name);tex.glowMapTextureId=ctx.asset(p.glowtexture,p.glowtexturebase64,'textures',name);
  // Fresnel curves act across the visible surface, not along the length.
  if((p.rimpowergradient||[]).some(k=>lower(k).value)||p.rimfactor||(p.glowaddendgradient||[]).some(k=>lower(k).value)||(p.opacitymultipliergradient||[]).some(k=>lower(k).value!==1)){
    const glowRef=Math.max(1e-6,...colors.map(([,c])=>c.a)),allZero=colors.every(([,c])=>c.a===0),times=Array.from({length:129},(_,i)=>i/128),f=t=>1-Math.abs(Math.cos(t*Math.PI));
    if(allZero)for(const [,c] of colors)c.a=1;
    mat.maskSettings.surfaceAngleMappings.colorOverValue=s.curve(times.map(t=>{const rim=1+vainGradient(p.rimpowergradient,f(t),(p.rimfactor||0)*f(t)**(p.rimpower??3)),add=vainGradient(p.glowaddendgradient,f(t),0);return [t,s.color([rim,rim,rim],allZero?Math.max(0,add):Math.max(0,1+add/glowRef))];}));
    mat.maskSettings.surfaceAngleMappings.alphaOverValue=s.curve(times.map(t=>[t,clamp(vainGradient(p.opacitymultipliergradient,f(t),1))]));
    ctx.warn('surface_angle_transfer','Vain Fresnel material curves mapped using a normalized-angle approximation; perpendicular view dependence and additive glow can differ.',name);
  }
  mat.depthWrite=!p.disabledepthprepass;
  let mode=p.geometrymode??0,useObj=!p._nativeRings&&([2,3,'Sprite','Obj'].includes(mode)||rings.some((r,i)=>r.offsetx||r.offsety||r.uvoffset||(i&&r.position<rings[i-1].position))),model;
  if(useObj){if([3,'Obj'].includes(mode)){model=ctx.asset(p.objfile,p.objbase64,'geometry',name);if(!model){ctx.warn('missing_model','Missing OBJ replaced with a cylinder placeholder.',name);useObj=false;}}else if([2,'Sprite'].includes(mode)){let x=(p.spritesizex??.2)/2,y=(p.spritesizey??.2)/2;model=ctx.add(`part_${index}.obj`,strToU8(`v ${-x} ${-y} 0\nv ${x} ${-y} 0\nv ${x} ${y} 0\nv ${-x} ${y} 0\nvt 0 0\nvt 1 0\nvt 1 1\nvt 0 1\nf 1/1 2/2 3/3\nf 1/1 3/3 4/4\n`),'geometry');}else model=ctx.add(`part_${index}.obj`,ringObj(rings,p.length??.1,p.ringvertsmanual??20),'geometry');}
  let result;
  if(useObj){mat.maskSettings=s.mask('model');Object.assign(mat,{color:colors[0][1],opacity:opacity[0][1]});config.MeshSettings={modelId:model,scale:[3,'Obj'].includes(mode)?p.objscale??1:1,flipNormals:false,mirrorX:false,mirrorY:false,mirrorZ:false};
    if(![2,3,'Sprite','Obj'].includes(mode)){const baked=bakeRingModel(ctx,p,rings,index,tex);if(baked){config.MeshSettings.modelId=baked.model;mat.color=s.color([1,1,1],baked.maxGlow);mat.opacity=1;}else{mat.color=s.color([1,1,1],Math.max(...colors.map(([,c])=>c.a)));mat.opacity=1;}}
    result=s.module('custom-model',1,config);ctx.warn('model_blur','Complex geometry is preserved as a Custom Model; its VainSabers blur is not reproduced.',name);
  }else{let max=Math.max(1e-6,...radius.map(([,r])=>r)),length=Number(p.length??.1);if(length<0||!Number.isFinite(length))throw Error('Invalid part length: '+name);let inverted=new Set(rings.map(r=>!!r.inverted));if(inverted.size===1)mat.cullMode=inverted.has(true)?1:0;else ctx.warn('mixed_inversion','Per-ring inversion is approximated by a single material culling mode.',name);
    Object.assign(mat,{blurFrames:(p.blur??1)*ctx.options.blurMs*ctx.options.fps/1000,blurSensitivity:Math.max(0,p.blurfade??1)});Object.assign(mat.maskSettings.bladeMappings,{colorOverValue:s.curve(colors),alphaOverValue:s.curve(opacity)});
    config.MeshSettings={zOffsetFrom:lo*length,zOffsetTo:hi*length,radius:max,stretchBias:4,saberProfile:s.curve(radius.map(([t,r])=>[t,r/max])),startCap:false,endCap:false,verticalResolution:clamp(rings.length*2,20,256),horizontalResolution:clamp(p.manualringverts?(p.ringvertsmanual??20):20,3,128)};result=s.module('blur-saber',2,config);
  }
  Object.assign(config,{MaterialSettings:mat,TexturesSettings:tex});let rotation=[0,0,0];for(let raw of p.animators||[]){let a=lower(raw),type=String(a.$type||'').split(',')[0];if(type==='RotationAdder'){let axis={X:0,Y:1,Z:2}[a.axis]??a.axis??0;if(![0,1,2].includes(axis))throw Error('Invalid rotation axis.');rotation[axis]+=a.speed??30;}else ctx.warn('animator',type+' is kept in its initial static state.',name);}
  if(rotation.some(Boolean)){let wrapper=s.empty(name+' / Rotation');wrapper.Config.LocalTransform=copy(config.LocalTransform);wrapper.Config.RotationSpeed=s.vec(rotation);config.LocalTransform=s.transform();wrapper.Children=[result];result=wrapper;ctx.warn('rotation_order','Rotation is mapped through an Empty; Euler rotation order can differ.',name);}ctx.stats.parts++;return result;
}
function vainGradient(list,t,def,valueKey='value'){let pts=(list||[]).map(lower).sort((a,b)=>a.time-b.time);if(!pts.length)return def;if(t<=pts[0].time)return pts[0][valueKey];for(let i=1;i<pts.length;i++){let a=pts[i-1],b=pts[i];if(t<=b.time){let u=b.time>a.time?(t-a.time)/(b.time-a.time):1,e=a.easing??0;if(e===1)u*=u;else if(e===2)u*=2-u;else if(e===3)u=u<.5?2*u*u:-1+(4-2*u)*u;return lerp(a[valueKey],b[valueKey],u);}}return pts.at(-1)[valueKey];}
function toReeTrail(ctx,p,blade,index){let name=(blade?'Blade':'Tip')+' Trail '+(index+1),pos=p.position||[0,0,1],config=s.common(name,[pos[0],pos[1],0]),masks=s.mask('trail'),cols=(p.colorgradient||[]).map(lower).map(k=>[k.time,k.color]).sort((a,b)=>a[0]-b[0]),blend=keys(p.customblendgradient||[],p.customblend??1),times=[...new Set([0,1,...Array.from({length:33},(_,i)=>i/32),...cols.map(k=>clamp(k[0])),...blend.map(k=>clamp(k[0]))])].sort((a,b)=>a-b);
  masks.lengthMappings.colorOverValue=s.curve(times.map(t=>[t,blended(vainGradient(p.colorgradient,t,p.color||[1,1,1],'color'),vainGradient(p.customblendgradient,t,p.customblend??1),p.glow??1)]));masks.lengthMappings.alphaOverValue=s.curve(times.map(t=>[t,clamp(p.opacity??1)*(blade?Math.pow(.9*(1-t*clamp(p.fade??1))*Math.pow(t,.02),2):.9*(1-t*clamp(p.fade??1)))]));
  if(blade)masks.widthMappings.alphaOverValue=s.curve([[0,0],[1,1]]);else masks.lengthMappings.scaleOverValue={interpolationType:0,controlPoints:[{time:0,value:0},{time:.3,value:1},{time:1,value:0}]};
  let width=p.width??.008,offset=pos[2];if(blade){let b=clamp(width);width=Math.abs(pos[2])*(1-b);offset=pos[2];if(pos[0]||pos[1])ctx.warn('trail_direction','Tilted ribbon is approximated along local Z.',name);}
  let texture=ctx.asset(p.colortexture,p.colortexturebase64,'textures',name),glowtex=ctx.asset(p.glowtexture,p.glowtexturebase64,'textures',name);if(glowtex)ctx.warn('trail_glow_texture','Separate trail glow texture is included but cannot be connected independently.',name);
  let general={customTextureId:texture,opacityTextureId:'',animationLayout:{totalFrames:1,framesPerRow:1,framesPerColumn:1,frameDuration:1},blendingMode:0,alwaysOnTop:false,renderQueue:3000+(p.queueoffset||0)};for(let k of ['tilingLayout','uvScroll','opacityTilingLayout','opacityUvScroll'])general[k]=s.textures()[k];
  Object.assign(config,{MeshSettings:{TrailLength:Math.max(0,(p.length??140)/1000),HorizontalResolution:4,VerticalResolution:60},MaterialSettings:{trailType:blade?1:0,materialType:0,mappingType:0,offset,width:Math.max(0,width),distortionMultiplier:1,generalSettings:general,maskSettings:masks},Space:0,SpaceReference:null});if(texture){try{const image=decodeImage(ctx.assets.get('textures/'+texture));let alpha=new Uint8Array(image.width*image.height*4);for(let i=0;i<alpha.length;i+=4)alpha.fill(image.data[i+3],i,i+4);general.opacityTextureId=ctx.add('trail_'+index+'_'+(blade?'blade':'tip')+'_opacity.png',png(image.width,image.height,alpha));}catch(error){ctx.warn('texture_opacity','Could not extract trail opacity: '+error.message,name);}}if(p.noiseenabled||p.motionactivation||p.motionfadepower)ctx.warn('trail_motion','Trail noise and motion activation are not reproduced.',name);shadingWarnings(ctx,p,name);ctx.stats.trails++;return s.module('simple-trail',1,config);
}
function toRee(ctx,data){let q=lower(data),out=s.preset(ctx.name),parts=q.parts.map(lower);ctx.warn('shader_difference','Color, glow and motion blur differ between the two mods; compare the result in-game.');
  function resolve(i,seen){let p=parts[i],link=p.linkedpartindex;if(Number.isInteger(link)&&link>=0&&link<parts.length&&link!==i){if(seen.has(link))throw Error('Cyclic LinkedPartIndex.');let base=copy(resolve(link,new Set([...seen,link])));for(let k of ['name','position','rotation','linkedpartindex','mirroronleft'])if(k in p)base[k]=p[k];return base;}return p;}
  for(let i=0;i<parts.length;i++)out.Modules.push(toReePart(ctx,resolve(i,new Set([i])),i));if(q.usecustomtrails){(q.tiptrails||[]).forEach((p,i)=>out.Modules.push(toReeTrail(ctx,lower(p),false,i)));(q.bladetrails?.length?q.bladetrails:q.bladetrail?[q.bladetrail]:[]).forEach((raw,i)=>{const p=lower(raw);if(p.noiseenabled){ctx.stats.skipped++;ctx.warn('vertex_noise_omitted','Blade effect with Vertex Noise omitted; its displaced geometry cannot be reproduced by Simple Trail.', 'Blade Trail '+(i+1));}else out.Modules.push(toReeTrail(ctx,p,true,i));});}else{out.Modules.push(toReeTrail(ctx,{position:[0,0,1],width:0,length:160},true,0));ctx.warn('vanilla_trail','The game trail is approximated by a 160 ms Simple Trail.');}return out;
}

function textureWarnings(ctx,tex,name){for(let k of ['normalMapTextureId','colorMapTextureId','metallicMapTextureId','roughnessMapTextureId','opacityTextureId'])if(tex[k]&&tex[k].toLowerCase()!=='none')ctx.warn('material_texture',k+' has no direct VainSabers equivalent.',name);if((tex.animationLayout?.totalFrames??1)>1)ctx.warn('texture_atlas','Texture animation is exported as a static atlas.',name);if(tex.uvScroll?.x||tex.uvScroll?.y||tex.mappingType)ctx.warn('texture_mapping','UV scrolling/mapping is not reproduced.',name);}
function applyTextures(ctx,p,tex,name){p.ColorTexture=ctx.asset(tex.mainTextureId,null,'textures',name)||null;p.ColorTextureBase64=p.ColorTexture?ctx.embed(p.ColorTexture,'textures',name):null;p.GlowTexture=ctx.asset(tex.glowMapTextureId,null,'textures',name)||null;p.GlowTextureBase64=p.GlowTexture?ctx.embed(p.GlowTexture,'textures',name):null;textureWarnings(ctx,tex,name);}
function curveWarnings(ctx,curve,name){if(curve?.interpolationType===3)ctx.warn('curve_interpolation','Smooth curves use sampled cubic interpolation; compare fine details in-game.',name);}
function maskWarnings(ctx,mask,name){if(mask?.drivers?.length)ctx.warn('drivers','Input/motion drivers are not reproduced.',name);for(let k of ['viewingAngleMappings','surfaceAngleMappings']){let v=mask?.[k];if(v&&JSON.stringify(v)!==JSON.stringify(s.mappings()))ctx.warn('angle_mask','Viewing/surface-angle material masks may differ.',name);}}
function transformObj(bytes,m,{flip=false,mirrors=[1,1,1],scale=1}={}){let lines=strFromU8(bytes).split(/\r?\n/),out=[];for(let line of lines){let a=line.trim().split(/\s+/);if(a[0]==='v'){let p=point(m,a.slice(1,4).map((n,i)=>Number(n)*mirrors[i]*scale));out.push('v '+p.join(' '));}else if(a[0]==='vn')continue;else if(a[0]==='f'){let face=a.slice(1).map(v=>{let [vi,ti]=v.split('/');return ti?vi+'/'+ti:vi;});if(flip)face.reverse();out.push('f '+face.join(' '));}else out.push(line);}return strToU8(out.join('\n'));}
function rotationAnimators(speed){return speed.flatMap((v,i)=>Math.abs(v)>1e-9?[{$type:'RotationAdder, VainSabers',Axis:i,Speed:v}]:[]);}
function pureGameColor(col){return (col.r??0)>0&&Math.abs(col.g??0)<1e-6&&Math.abs(col.b??0)<1e-6;}
// Vain uses lerp(neutral RGB, live note RGB, weight), never a baked red RGB.
export function inverseColor(ctx,col,name){col=col||s.color([1,0,0]);const rgb=[col.r??1,col.g??1,col.b??1],lo=Math.min(...rgb),hi=Math.max(...rgb),chroma=Math.max(0,hi-lo),weight=clamp(chroma);let neutral=weight<1-1e-8?lo/(1-weight):0;let glow=col.a??1;if(chroma>1){glow*=chroma;ctx?.warn('hdr_color','HDR color gain is approximated through glow; note color remains dynamic.',name);}return {Color:[neutral,neutral,neutral],CustomWeight:weight,Glow:glow};}
function mixNoteMaterial(a,b,t){const weight=lerp(a.CustomWeight,b.CustomWeight,t),base=a.Color.map((v,i)=>lerp(v*(1-a.CustomWeight),b.Color[i]*(1-b.CustomWeight),t));return {Color:base.map(v=>weight<1-1e-8?v/(1-weight):0),CustomWeight:weight,Glow:lerp(a.Glow,b.Glow,t)};}
function angleTransferToVain(ctx,p,mat,name){
  p.DisableDepthPrepass=mat.depthWrite===false;const map=mat.maskSettings?.surfaceAngleMappings;if(!map)return;
  const times=Array.from({length:129},(_,i)=>i/128),glowRef=Math.max(0,...(p.Rings||[]).map(r=>r.Glow));
  const sample=f=>{const a=Math.acos(clamp(1-f))/Math.PI,t=mat.cullMode===1?1-a:a;return {c:evaluateCurve(map.colorOverValue,t,s.color()),alpha:evaluateCurve(map.alphaOverValue,t,1)};};
  const samples=times.map(f=>sample(f));if(samples.every(v=>Math.abs(v.c.r-1)<1e-8&&Math.abs(v.c.g-1)<1e-8&&Math.abs(v.c.b-1)<1e-8&&Math.abs(v.c.a-1)<1e-8&&Math.abs(v.alpha-1)<1e-8))return;
  p.RimPerpendicular=0;p.RimPowerGradient=times.map((Time,i)=>({Time,Value:(samples[i].c.r+samples[i].c.g+samples[i].c.b)/3-1,Easing:0}));p.OpacityMultiplierGradient=times.map((Time,i)=>({Time,Value:clamp(samples[i].alpha),Easing:0}));p.GlowAddendGradient=times.map((Time,i)=>({Time,Value:glowRef*(samples[i].c.a-1),Easing:0}));
  ctx.warn('surface_angle_transfer','Surface RGB/opacity/glow mapped to Vain Fresnel gradients using a normalized-angle approximation. RGB hue, additive glow, and the closed-source angle coordinate can differ.',name);
}
export function evaluateCurve(curve,t,def=1){const pts=curveKeys(curve,def);if(t<pts[0][0])return pts[0][1];let i=0;while(i+1<pts.length&&t>=pts[i+1][0])i++;if(i===pts.length-1)return pts[i][1];const [a,av]=pts[i],[b,bv]=pts[i+1],u=b>a?clamp((t-a)/(b-a)):1,type=curve?.interpolationType??1;if(type===2)return av;if(type===0)return lerp(av,bv,u*u*(3-2*u));if(type===3){const prev=pts[Math.max(0,i-1)],next=pts[Math.min(pts.length-1,i+2)],hermite=(v0,v1,vp,vn)=>{const m0=b>prev[0]?(v1-vp)/(b-prev[0])*(b-a):0,m1=next[0]>a?(vn-v0)/(next[0]-a)*(b-a):0;return (2*u**3-3*u**2+1)*v0+(u**3-2*u**2+u)*m0+(-2*u**3+3*u**2)*v1+(u**3-u**2)*m1;};if(av&&typeof av==='object')return Object.fromEntries(Object.keys(av).map(k=>[k,hermite(av[k],bv[k],prev[1][k],next[1][k])]));return hermite(av,bv,prev[1],next[1]);}return lerp(av,bv,u);}
function reverseBlade(ctx,module,world,speed){
  const c=module.Config||{},name=c.Name||'Blur Saber',v1=module.Version===1,mesh=v1?c.SaberSettings||{}:c.MeshSettings||{},mat=v1?mesh:c.MaterialSettings||{},tex=c.TexturesSettings||{},mask=mat.maskSettings||{},mapped=mask.bladeMappings||s.mappings();
  let p=s.vainPart(name),decomp=decompose(world),from=Number(mesh.zOffsetFrom??0),to=Number(mesh.zOffsetTo??1),rad=Number(mesh.radius??((mesh.thickness??1)*.0112));
  // 11.2 mm verified against 30 matched v1 JSON / v2 archive module pairs.
  const profile=curveKeys(mesh.saberProfile,1),colors=curveKeys(mapped.colorOverValue,s.color([1,0,0])),opacities=curveKeys(mapped.alphaOverValue,1),scales=curveKeys(mapped.scaleOverValue,1);
  for(let cv of [mesh.saberProfile,mapped.colorOverValue,mapped.alphaOverValue,mapped.scaleOverValue])curveWarnings(ctx,cv,name);maskWarnings(ctx,mask,name);
  const allCurves=[mesh.saberProfile,mapped.colorOverValue,mapped.alphaOverValue,mapped.scaleOverValue,mask.handleMask];const times=[...new Set([0,1,...Array.from({length:129},(_,i)=>i/128),...allCurves.flatMap(cv=>(cv?.controlPoints||[]).flatMap(k=>[clamp(k.time-1e-6),clamp(k.time),clamp(k.time+1e-6)]))])].sort((a,b)=>a-b);
  p.GeometryMode=1;p.Length=Math.abs(to-from)*decomp.scale[2];p.Position=point(world,[0,0,from]);p.Rotation=decomp.rotation;
  const glowMultiplier=mat.glowMultiplier??1;p.Rings=times.map(t=>{const col=evaluateCurve(mapped.colorOverValue,t,s.color([1,0,0])),blade=inverseColor(ctx,col,name),handle=inverseColor(ctx,mat.handleColor||s.color([.1,.1,.1],0),name),h=clamp(evaluateCurve(mask.handleMask,t,0)),inv=v1?mixNoteMaterial(blade,handle,h):blade;return {Position:t,Radius:Math.abs(rad*Number(evaluateCurve(mesh.saberProfile,t,1))*Number(evaluateCurve(mapped.scaleOverValue,t,1))*decomp.scale[0]),...inv,Glow:inv.Glow*glowMultiplier,Opacity:clamp(evaluateCurve(mapped.alphaOverValue,t,1)),Inverted:mat.cullMode===1,OffsetX:0,OffsetY:0,UvOffset:0};});
  if(to<from){p.Rotation=decompose(multiply(world,matrix({Rotation:{x:0,y:180,z:0}}))).rotation;ctx.warn('reverse_axis','A reversed Z range is represented by a 180 degree turn.',name);}
  p.Inverted=mat.cullMode===1;p.Blur=ctx.options.blurMs?Number(mat.blurFrames??2)*1000/(ctx.options.fps*ctx.options.blurMs):0;p.BlurFade=Number(mat.blurSensitivity??1);p.RenderQueueOffset=Number(mat.renderQueue??3001)-3001;p.Lit=!!(mat.sceneLights||mat.sceneReflections);p.Metallic=clamp(mat.metallic||0);p.Smoothness=1-clamp(mat.roughness??1);p.FresnelPower=mat.fresnelPower??5;p.Animators=rotationAnimators(speed);if(!p.Animators.length)p.Animators=null;
  applyTextures(ctx,p,tex,name);
  if(Math.abs(decomp.scale[0]-decomp.scale[1])>1e-6||decomp.distorted){let rings=times.map(t=>({position:t,radius:rad*Number(sample(profile,t))*Number(sample(scales,t)),inverted:mat.cullMode===1})),local=matrix({Position:{z:from},Scale:{x:1,y:1,z:1}}),bytes=ringObj(rings,to-from,mesh.horizontalResolution??20);bytes=transformObj(bytes,multiply(world,local));p.GeometryMode=3;p.ObjFile=safeName(name)+'.obj';p.ObjBase64=toBase64(bytes);p.ObjScale=1;p.Position=[0,0,0];p.Rotation=[0,0,0];p.Rings=null;ctx.warn('baked_scale','Non-uniform/reflected transform is baked into an OBJ; per-ring gradients are reduced to the first sample.',name);let inv=inverseColor(ctx,sample(colors,0),name);Object.assign(p,{StartColor:inv.Color,EndColor:inv.Color,StartCustomWeight:inv.CustomWeight,EndCustomWeight:inv.CustomWeight,StartGlow:inv.Glow,EndGlow:inv.Glow,StartOpacity:clamp(sample(opacities,0)),EndOpacity:clamp(sample(opacities,0))});}
  const first=p.Rings?.[0],last=p.Rings?.at(-1);if(first){for(const [side,r] of [['Start',first],['End',last]]){p[side+'Radius']=r.Radius;p[side+'Color']=r.Color;p[side+'CustomWeight']=r.CustomWeight;p[side+'Glow']=r.Glow;p[side+'Opacity']=r.Opacity;}if(mesh.startCap&&first.Radius>1e-8)p.Rings.unshift({...first,Radius:0});if(mesh.endCap&&last.Radius>1e-8)p.Rings.push({...last,Radius:0});}
  angleTransferToVain(ctx,p,mat,name);
  if(mesh.startCap||mesh.endCap)ctx.warn('end_caps','End caps are closed with zero-radius rings; normals may differ.',name);if(!v1&&(mask.handleMask?.controlPoints||[]).some(k=>k.value!==0))ctx.warn('handle_mask','PBR handle mask is approximated separately from the sampled color.',name);
  ctx.stats.parts++;return p;
}
function reverseModel(ctx,module,world,speed){let c=module.Config||{},name=c.Name||'Custom Model',mesh=c.MeshSettings||{},mat=c.MaterialSettings||{},tex=c.TexturesSettings||{},p=s.vainPart(name),model=ctx.asset(mesh.modelId,null,'geometry',name);if(!model){ctx.stats.skipped++;ctx.warn('skipped_model','Custom Model skipped because its geometry is missing.',name);return null;}if(!model.toLowerCase().endsWith('.obj')){ctx.stats.skipped++;ctx.warn('unsupported_geometry','GLB models / dynamic bones cannot be loaded by VainSabers OBJ loader.',name);return null;}
  let d=decompose(world),mirrors=['X','Y','Z'].map(k=>mesh['mirror'+k]?-1:1),bytes=ctx.assets.get('geometry/'+model),baked=d.distorted||d.scale.some(v=>Math.abs(v-d.scale[0])>1e-6)||mirrors.some(v=>v<0)||mesh.flipNormals;
  p.GeometryMode=3;p.ObjFile=model;p.ObjScale=(mesh.scale??1)*d.scale[0];p.Position=d.position;p.Rotation=d.rotation;if(baked){bytes=transformObj(bytes,world,{flip:!!mesh.flipNormals,mirrors,scale:mesh.scale??1});p.ObjScale=1;p.Position=[0,0,0];p.Rotation=[0,0,0];ctx.warn('baked_scale','Model transform/mirroring is baked into its OBJ.',name);}p.ObjBase64=toBase64(bytes);const col=inverseColor(ctx,mat.color||s.color([1,0,0]),name);Object.assign(p,{StartColor:col.Color,EndColor:col.Color,StartCustomWeight:col.CustomWeight,EndCustomWeight:col.CustomWeight,StartGlow:col.Glow,EndGlow:col.Glow,StartOpacity:mat.opacity??1,EndOpacity:mat.opacity??1,Lit:!!mat.sceneLights,Metallic:mat.metallic??0,Smoothness:1-clamp(mat.roughness??1),RenderQueueOffset:(mat.renderQueue??3001)-3001,Inverted:mat.cullMode===1,Animators:rotationAnimators(speed)});if(!p.Animators.length)p.Animators=null;applyTextures(ctx,p,tex,name);maskWarnings(ctx,mat.maskSettings,name);ctx.stats.parts++;return p;
}
function trailSamples(mask){const curves=Object.values(mask||{}).filter(v=>v?.controlPoints);return [...new Set([0,1,...Array.from({length:129},(_,i)=>i/128),...curves.flatMap(cv=>cv.controlPoints.flatMap(k=>[clamp(k.time-1e-6),clamp(k.time),clamp(k.time+1e-6)]))])].sort((a,b)=>a-b);}
function fitTipTrail(ctx,trail,mask,name){
  const length=mask.lengthMappings||{},width=mask.widthMappings||{},visible=[];let widthAlpha=0,widthGlow=0;
  for(let i=0;i<=1024;i++){const u=i/1024,a=clamp(evaluateCurve(width.alphaOverValue,u,1));if(a>1/255)visible.push(u);widthAlpha+=a;widthGlow+=a*Math.max(0,evaluateCurve(width.colorOverValue,u,s.color()).a);}
  if(!visible.length){trail.Opacity=0;return;}
  // Vain's LineRenderer ignores texture IDs and always uses a 0 -> 1 -> 0 width curve.
  // Fit the visible central band and truncate history once Ree's taper/alpha reaches zero.
  const from=visible[0],to=visible.at(-1),center=(from+to)/2,band=to-from;
  const zeroTail=cv=>{const pts=curveKeys(cv,1);let last=pts.findLastIndex(([,v])=>v!==0);return last<0?0:last===pts.length-1?1:clamp(pts[last+1][0]);};let end=Math.min(zeroTail(length.alphaOverValue),zeroTail(length.scaleOverValue));
  const times=trailSamples(length),originalLength=trail.Length;trail.Length=Math.round(originalLength*end);
  const scale=Math.max(...times.map(t=>Math.max(0,evaluateCurve(length.scaleOverValue,t,1))));trail.Width*=band*scale;trail.Opacity=clamp(Math.max(...times.map(t=>evaluateCurve(length.alphaOverValue,t,1)))*(widthAlpha/1025)/(Math.max(band,1e-9)*.9));trail.Fade=1;
  trail.Glow=Math.max(0,evaluateCurve(length.colorOverValue,end*.2,s.color()).a)*(widthAlpha?widthGlow/widthAlpha:0);
  const colors=times.filter(t=>t<=end).map(t=>[end?t/end:0,inverseColor(ctx,evaluateCurve(length.colorOverValue,t,s.color([1,0,0])),name)]);trail.ColorGradient=colors.map(([Time,c])=>({Time,Color:c.Color,Easing:0}));trail.CustomBlendGradient=colors.map(([Time,c])=>({Time,Value:c.CustomWeight,Easing:0}));
  trail.ColorTexture=null;trail.ColorTextureBase64=null;
  ctx.warn('tip_profile_fit','Tip width/opacity masks fitted to Vain fixed LineRenderer profile; arbitrary taper, glow and cross-width detail remain approximate.',name);
}
function bakeBladeTrail(ctx,trail,mask,general,name){
  const lm=mask.lengthMappings||{},wm=mask.widthMappings||{};let main=null,opacity=null;
  try{if(trail.ColorTexture)main=decodeImage(ctx.assets.get('textures/'+trail.ColorTexture));const id=ctx.asset(general.opacityTextureId,null,'textures',name);if(id)opacity=decodeImage(ctx.assets.get('textures/'+id));}catch(error){ctx.warn('trail_mask_bake',error.message+'; trail texture masks could not be baked.',name);return;}
  const width=512,height=256,pixels=new Uint8Array(width*height*4),glowPixels=new Uint8Array(width*height*4),ts=trailSamples(lm),ws=trailSamples(wm),maxGlow=Math.max(0,...ts.map(t=>evaluateCurve(lm.colorOverValue,t,s.color()).a))*Math.max(0,...ws.map(t=>evaluateCurve(wm.colorOverValue,t,s.color()).a));
  trail.Glow=maxGlow;trail.Opacity=1;trail.Fade=0;
  for(let x=0;x<width;x++){const age=x/(width-1),scale=Math.max(0,evaluateCurve(lm.scaleOverValue,age,1)),nativeFade=.81*Math.pow(Math.max(age,1e-6),.04),a=clamp(evaluateCurve(lm.alphaOverValue,age,1)),lc=evaluateCurve(lm.colorOverValue,age,s.color());
    for(let y=0;y<height;y++){const v=1-y/(height-1),cross=scale>1e-6?(v-.5)/scale+.5:-1,inside=cross>=0&&cross<=1,wc=evaluateCurve(wm.colorOverValue,cross,s.color()),wa=inside?clamp(evaluateCurve(wm.alphaOverValue,cross,1)):0,tex=imageSample(main,age,cross),op=imageSample(opacity,age,cross),desired=a*wa*tex[3]*op[0],gain=clamp(Math.max(wc.r,wc.g,wc.b)),at=(y*width+x)*4;
      pixels.set([Math.round(gain*tex[0]*255),Math.round(gain*tex[1]*255),Math.round(gain*tex[2]*255),Math.round(clamp(desired/(nativeFade*Math.max(v,1e-6)))*255)],at);
      const glow=Math.round(clamp(desired*Math.max(0,lc.a*wc.a)/(Math.max(1e-9,maxGlow*nativeFade*v)))*255);glowPixels.set([glow,glow,glow,255],at);
    }
  }
  trail.ColorTexture=ctx.add(safeName(name)+'_mask.png',png(width,height,pixels));trail.ColorTextureBase64=ctx.embed(trail.ColorTexture,'textures',name);trail.GlowTexture=ctx.add(safeName(name)+'_glow.png',png(width,height,glowPixels));trail.GlowTextureBase64=ctx.embed(trail.GlowTexture,'textures',name);
  ctx.warn('trail_mask_bake','Trail length/width opacity, taper and glow baked into textures. The moving mesh and Vain transparent ribbon base remain approximate.',name);
}
function reverseTrail(ctx,module,world){
  const c=module.Config||{},name=c.Name||'Simple Trail',mesh=c.MeshSettings||{},mat=c.MaterialSettings||{},general=mat.generalSettings||{},mask=mat.maskSettings||{},mapped=mask.lengthMappings||s.mappings();if(mat.materialType)ctx.warn('trail_material','Distortion / special trail materials become a standard VainSabers trail.',name);if(c.Space||c.SpaceReference)ctx.warn('trail_space','Trail space references are flattened into saber-local coordinates.',name);
  const colors=trailSamples(mapped).map(t=>[t,evaluateCurve(mapped.colorOverValue,t,s.color([1,0,0]))]),col=inverseColor(ctx,colors[0][1],name),offset=Number(mat.offset??1),width=Number(mat.width??.02),d=decompose(world);
  const blade=mat.trailType===1,trail={Position:point(world,[0,0,offset]),Color:col.Color,CustomBlend:col.CustomWeight,Glow:col.Glow,Opacity:clamp(evaluateCurve(mapped.alphaOverValue,0,1)),Width:blade?clamp((offset-width)/(offset||1)):Math.abs(width*d.scale[0]),Length:Math.max(0,Math.round((mesh.TrailLength??.16)*1000)),QueueOffset:Number(general.renderQueue??3000)-3600,DepthOffset:0,Fade:1,TextureWrap:1,MotionActivation:0,NoiseEnabled:false,MotionFadePower:0,ColorAtlasCount:{x:1,y:1},ColorAtlasSpeedFlip:{x:1,y:0,z:0},GlowAtlasCount:{x:1,y:1},GlowAtlasSpeedFlip:{x:1,y:0,z:0}};
  trail.ColorTexture=ctx.asset(general.customTextureId,null,'textures',name)||null;trail.ColorTextureBase64=trail.ColorTexture?ctx.embed(trail.ColorTexture,'textures',name):null;trail.GlowTexture=null;trail.GlowTextureBase64=null;
  trail.ColorGradient=colors.map(([Time,color])=>({Time,Color:inverseColor(ctx,color,name).Color,Easing:0}));trail.CustomBlendGradient=colors.map(([Time,color])=>({Time,Value:inverseColor(ctx,color,name).CustomWeight,Easing:0}));
  if(blade)bakeBladeTrail(ctx,trail,mask,general,name);else fitTipTrail(ctx,trail,mask,name);
  if(d.rotation.some(v=>Math.abs(v)>1e-6)||d.distorted||Math.abs(d.scale[0]-d.scale[1])>1e-6)ctx.warn('trail_transform','Rotated/scaled trail width is approximate; sweep axis may differ.',name);maskWarnings(ctx,mask,name);textureWarnings(ctx,general,name);ctx.stats.trails++;return {blade,trail};
}
function toVain(ctx,data){let out={Version:2,Parts:[],UseCustomTrails:true,TipTrails:[],BladeTrails:[]};ctx.warn('shader_difference','ReeSabers color, glow and blur are approximated for VainSabers. Unsupported modules are listed explicitly.');
  function visit(module,parent,speed=[0,0,0],depth=0){if(depth>60)throw Error('Module tree is too deep.');let c=module.Config||{},name=c.Name||module.ModuleId;if(c.Enabled===false){ctx.stats.skipped++;ctx.warn('disabled_module','Disabled module and its children are omitted.',name);return;}let world=multiply(parent,matrix(c.LocalTransform||{})),localSpeed=vector(c.RotationSpeed),inherited=speed.map((v,i)=>v+localSpeed[i]),id=module.ModuleId;if(c.ForceColorOverride)ctx.warn('color_override','Module color override is not reproduced exactly.',name);
    if(id==='reezonate.blur-saber')out.Parts.push(reverseBlade(ctx,module,world,inherited));else if(id==='reezonate.custom-model'){let p=reverseModel(ctx,module,world,inherited);if(p)out.Parts.push(p);}else if(id==='reezonate.simple-trail'){let {blade,trail}=reverseTrail(ctx,module,world);out[blade?'BladeTrails':'TipTrails'].push(trail);}else if(id!=='reezonate.empty'){ctx.stats.skipped++;ctx.warn('unsupported_module',id+' has no direct VainSabers equivalent and is omitted.',name);}else if(c.Drivers?.length)ctx.warn('drivers','Empty input drivers are omitted.',name);
    if(localSpeed.some(Boolean))ctx.warn('rotation_order','Group rotation is mapped to per-part Euler animators; orbit motion and axis order can differ.',name);for(let child of module.Children||[])visit(child,world,inherited,depth+1);
  }
  for(let module of data.Modules||[])visit(module,matrix(data.LocalTransform||{}));if(!out.Parts.length&&!out.TipTrails.length&&!out.BladeTrails.length)throw Error('No supported visible modules in this preset.');return out;
}
export function convert(parsed,name,direction='auto',resources=new Map(),options={}){
  let source=detect(parsed.data),target=direction==='auto'?(source==='vain'?'ree':'vain'):direction;if(!['ree','vain'].includes(target))throw Error('Unknown conversion direction.');if(source===target)throw Error('This preset is already in the selected target format.');
  let ctx=new Context(name,parsed.assets,resources,options),data=target==='ree'?toRee(ctx,parsed.data):toVain(ctx,parsed.data);finiteTree(data);
  let total=[...ctx.assets.values()].reduce((sum,a)=>sum+a.length,0);if(total>MAX_BYTES)throw Error('Resources exceed 128 MB.');ctx.stats.assets=ctx.assets.size;
  const report={name,source,target,statistics:ctx.stats,options:ctx.options,warnings:ctx.warnings},bytes=target==='ree'?zipSync(Object.fromEntries([['preset.json',strToU8(JSON.stringify(data,null,2))],...[...ctx.assets]]),{level:6}):strToU8(JSON.stringify(data,null,2));
  if(bytes.length>MAX_BYTES)throw Error('Converted preset exceeds 128 MB.');return {data,assets:ctx.assets,bytes,filename:safeName(name)+(target==='ree'?'.reesaber':'.vainsaber'),report};
}
export const demo=()=>({data:{Version:2,Parts:[{...s.vainPart('Blade'),Length:1,StartRadius:.012,EndRadius:.003,EnableEndCaps:false},{...s.vainPart('Handle'),Position:[0,0,-.15],Length:.15,StartRadius:.014,EndRadius:.012,StartCustomWeight:0,EndCustomWeight:0,StartColor:[.14,.15,.18],EndColor:[.05,.06,.08],StartGlow:0,EndGlow:0,EnableEndCaps:false}],UseCustomTrails:true,TipTrails:[{Position:[0,0,1],Width:.02,Length:180,Color:[1,1,1],CustomBlend:1,Glow:.6,Opacity:.65,Fade:1}]},assets:new Map()});
