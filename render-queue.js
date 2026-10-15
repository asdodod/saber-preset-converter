// Vain parts, ribbon trails and tip trails all use the same runtime base.
// Rebase the complete preset together so relative queues (including ties)
// survive conversion. Never infer an extra queue from culling/inversion.
export const VAIN_QUEUE_BASE=3600;
export const REE_QUEUE_BASE=3001;
export const toReeQueue=offset=>REE_QUEUE_BASE+Number(offset??0);
export const toVainQueue=queue=>Number(queue??REE_QUEUE_BASE)-REE_QUEUE_BASE;

export function previewOrders(parts,trails){
  return new Map([...parts,...trails].sort((a,b)=>a.queue-b.queue).map((surface,i)=>[surface,i*3]));
}
