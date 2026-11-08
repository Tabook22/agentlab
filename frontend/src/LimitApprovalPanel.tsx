import {useEffect,useState} from 'react';
import {Play,RefreshCw} from 'lucide-react';
import {Translate} from './i18n';
import './limits.css';
type State={mission_status:string;open_ended:boolean;usage:{estimated_cost_usd?:number;calls?:number;reported_tokens?:number}};
export function LimitApprovalPanel({missionId,onChange}:{missionId:string;onChange:(result:any)=>Promise<void>}){
 const [data,setData]=useState<State|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function load(){const response=await fetch(`/api/missions/${missionId}/limits`);const body=await response.json();if(!response.ok)throw new Error(body.detail||'Could not load mission status.');setData(body);return body as State;}
 useEffect(()=>{void load().catch(cause=>setError(cause.message));},[missionId]);
 async function continueMission(){
  setBusy(true);setError('');
  try{const current=await load();if(!['FAILED','AWAITING_LIMIT_APPROVAL','PAUSED'].includes(current.mission_status)){await onChange({resumed:false});return;}
   const response=await fetch(`/api/missions/${missionId}/execution/open`,{method:'POST'});const result=await response.json();if(!response.ok)throw new Error(result.detail||'Could not continue the mission.');await onChange(result);
  }catch(cause){setError(cause instanceof Error?cause.message:'Could not continue the mission.');}finally{setBusy(false);}
 }
 return <Translate><section id="mission-limit-approval" className="limit-approval open-execution" aria-label="Continue saved mission">
  <div className="limit-critical"><Play size={24}/><div><h3>{data?.mission_status==='FAILED'?'Continue saved mission':'Continue without app limits'}</h3><p>Keep the saved work and continue until the master approves the final answer. Cost estimates and accumulated usage stay visible. Pause and cancel are always available.</p></div></div>
  {data?.mission_status==='FAILED'&&<p>Resolve the reported error before continuing. Retrying does not increase OpenAI account quota or credits.</p>}<p className="limit-keep">No app spending, call, token, cycle or total-time caps. Actual API charges continue to accumulate as work proceeds.</p>
  {error&&<p role="alert" className="limit-error">{error}</p>}
  <div className="limit-actions"><button disabled={busy||!data} onClick={()=>void continueMission()}><Play size={16}/>{busy?'Continuing…':data?.mission_status==='FAILED'?'Continue saved mission':'Continue until finished'}</button><button disabled={busy} onClick={()=>{setError('');void load().then(()=>onChange({resumed:false})).catch(cause=>setError(cause.message));}}><RefreshCw size={14}/>Refresh status</button></div>
  {data&&<p className="limit-usage">Estimated cost so far: ${Number(data.usage.estimated_cost_usd??0).toFixed(4)} · {data.usage.calls??0} model calls · {data.usage.reported_tokens??0} reported tokens</p>}
 </section></Translate>;
}
