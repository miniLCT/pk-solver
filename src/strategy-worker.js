import { analyze } from './strategy.js';
self.onmessage=({data})=>{
  try{const start=performance.now();const result=analyze(data,(done,total)=>self.postMessage({type:'progress',done,total}));self.postMessage({type:'result',result:{...result,elapsed:performance.now()-start}});}
  catch(error){self.postMessage({type:'error',message:error.message});}
};
