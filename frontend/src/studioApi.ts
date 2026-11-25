import {accountFetch as fetch} from './accountFetch';
import {useEffect,useRef,useState} from 'react';
import {apiBase} from './apiBase';
export type StudioKind='participation'|'experiment'|'project';
export type StudioSummary={id:string;kind:StudioKind;title:string;status:string;revision:number;created_at:string};
export type StudioRun=StudioSummary&{data:Record<string,any>};
export async function studioApi(path:string,body?:unknown):Promise<any>{
 const response=await fetch(`${apiBase}/studio${path}`,body===undefined?undefined:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(typeof data.detail==='string'?data.detail:`Could not complete this activity (${response.status}).`);
 return data;
}
export function useStudioRun(kind:StudioKind){
 const [runs,setRuns]=useState<StudioSummary[]>([]),[run,setRun]=useState<StudioRun|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState('');
 const generation=useRef(0);
 useEffect(()=>{let current=true;
  void studioApi(`/runs?kind=${kind}`).then(async rows=>{if(!current)return;setRuns(rows);if(rows.length){const saved=await studioApi(`/runs/${rows[0].id}`);if(current)setRun(saved);}}).catch(e=>{if(current)setError(e.message);}).finally(()=>{if(current)setBusy(false);});
  return()=>{current=false;generation.current++;};
 },[kind]);
 async function perform(work:()=>Promise<StudioRun>){
  const current=++generation.current;setBusy(true);setError('');
  try{const saved=await work();if(current!==generation.current)return;setRun(saved);setRuns(old=>[saved,...old.filter(r=>r.id!==saved.id)].slice(0,50));}
  catch(cause){if(current===generation.current)setError(cause instanceof Error?cause.message:'Could not complete this activity.');}
  finally{if(current===generation.current)setBusy(false);}
 }
 return {runs,run,busy,error,perform,open:(id:string)=>perform(()=>studioApi(`/runs/${id}`))};
}
