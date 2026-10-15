// Color mode fields come from preset data, independently of material rendering.
export function reeColorPolicy(override,hand){
  const type=override?.type??3,source=override?.colorSource??0;
  const note=source===1?1-hand:source===2?0:source===3?1:hand;
  return {type,note,hue:type===1||type===2?(override.hue||0)*Math.PI*2:0,
    saturation:type===1||type===2?override.saturation??1:1,
    value:type===1||type===2?override.value??1:1,
    glow:override?.fakeGlowMultiplier??1};
}
