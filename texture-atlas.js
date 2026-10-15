// Independent flipbook address calculation. Flips reverse frame order on an
// atlas axis; they do not mirror the pixels inside each animation frame.
export function atlasLayout(count={},speed={},time=0){
  const columns=Math.max(1,Math.min(16,Math.round(count.x??1))),rows=Math.max(1,Math.min(16,Math.round(count.y??1)));
  if(columns===1&&rows===1)return {x:1,y:1,z:0,w:0,columns,rows};
  const total=columns*rows,frame=((Math.floor(time*Math.max(0,speed.x??1))%total)+total)%total;
  let column=frame%columns,row=Math.floor(frame/columns);
  if(speed.y>.5)column=columns-1-column;
  if(speed.z>.5)row=rows-1-row;
  return {x:1/columns,y:1/rows,z:column/columns,w:row/rows,columns,rows};
}

export function atlasUV(u,v,count,speed,time=0){const a=atlasLayout(count,speed,time);return [u*a.x+a.z,v*a.y+a.w];}
