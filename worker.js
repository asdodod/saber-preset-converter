import {convert} from './engine.js?v=20261013-3';
self.onmessage=event=>{
  const {id,parsed,name,direction,resources,options}=event.data;
  try{const result=convert(parsed,name,direction,resources,options);self.postMessage({id,result});}
  catch(error){self.postMessage({id,error:error.message||String(error)});}
};
