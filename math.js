// Unity's Quaternion.Euler applies Z, X, Y. Row-major affine matrices.
export const identity = () => [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
export const vector = (v, fallback=[0,0,0]) => Array.isArray(v) ? v.slice(0,3).map(Number) : ['x','y','z'].map((k,i)=>Number(v?.[k] ?? fallback[i]));
export function multiply(a,b) { return Array.from({length:16},(_,i)=>{let n=0;for(let k=0;k<4;k++)n+=a[Math.floor(i/4)*4+k]*b[k*4+i%4];return n;}); }
export function matrix(t={}) {
  const p=vector(t.Position),r=vector(t.Rotation).map(v=>v*Math.PI/180),s=vector(t.Scale,[1,1,1]);
  const [x,y,z]=r,cx=Math.cos(x),sx=Math.sin(x),cy=Math.cos(y),sy=Math.sin(y),cz=Math.cos(z),sz=Math.sin(z);
  const rx=[1,0,0,0,0,cx,-sx,0,0,sx,cx,0,0,0,0,1],ry=[cy,0,sy,0,0,1,0,0,-sy,0,cy,0,0,0,0,1],rz=[cz,-sz,0,0,sz,cz,0,0,0,0,1,0,0,0,0,1];
  const m=multiply(multiply(ry,rx),rz);for(let i=0;i<3;i++)for(let j=0;j<3;j++)m[i*4+j]*=s[j];
  m[3]=p[0];m[7]=p[1];m[11]=p[2];return m;
}
export function point(m,p) {return [0,1,2].map(i=>m[i*4]*p[0]+m[i*4+1]*p[1]+m[i*4+2]*p[2]+m[i*4+3]);}
export function decompose(m) {
  const scale=[0,1,2].map(j=>Math.hypot(m[j],m[4+j],m[8+j]));
  if(scale.some(v=>v<1e-10))return {position:point(m,[0,0,0]),rotation:[0,0,0],scale,distorted:true};
  const r=m.map((v,i)=>i<12&&i%4<3?v/scale[i%4]:v);
  let x=Math.asin(Math.max(-1,Math.min(1,-r[6]))),y,z;
  if(Math.abs(Math.cos(x))>1e-6){y=Math.atan2(r[2],r[10]);z=Math.atan2(r[4],r[5]);}else{y=Math.atan2(-r[8],r[0]);z=0;}
  const determinant=r[0]*(r[5]*r[10]-r[6]*r[9])-r[1]*(r[4]*r[10]-r[6]*r[8])+r[2]*(r[4]*r[9]-r[5]*r[8]);
  const dot=(a,b)=>r[a]*r[b]+r[4+a]*r[4+b]+r[8+a]*r[8+b];
  return {position:point(m,[0,0,0]),rotation:[x,y,z].map(v=>v*180/Math.PI),scale,distorted:determinant<0||Math.max(Math.abs(dot(0,1)),Math.abs(dot(0,2)),Math.abs(dot(1,2)))>1e-6};
}
