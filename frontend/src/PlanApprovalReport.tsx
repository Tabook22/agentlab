import { HelpButton } from './Help';
import {useEffect,useState} from 'react';
import {Translate} from './i18n';
import {agentsFrom,type LabEvent} from './events';
import {normalizeWorkerName,workerNamesError} from './workerNames';
import './workerNames.css';

export function PlanApprovalReport({request,events,canApprove,onDecision,onDiscuss}:{request:LabEvent;events:LabEvent[];canApprove:boolean;onDiscuss?:()=>void;onDecision?:(action:'approve'|'decline',planId:string,cap?:number,names?:Record<string,string>)=>Promise<void>}){
 const estimate=request.payload.estimate;
 const currentNames=new Map(agentsFrom(events).map(agent=>[agent.id,agent.config.name]));

 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const tasks=request.payload.worker_plan.tasks;
 const ids:string[]=request.payload.agent_ids??tasks.map((_:unknown,i:number)=>String(i));
 const suggested:string[]=tasks.map((task:any,i:number)=>task.name??`Worker ${i+1}`);
 const [names,setNames]=useState<string[]>(suggested);
 useEffect(()=>{setNames(suggested);},[request.id]);
 const approved=events.find(e=>e.type==='mission.plan_approved'&&e.payload.plan_id===request.id);
 const declined=events.find(e=>e.type==='mission.plan_declined'&&e.payload.plan_id===request.id);
 const value=estimate.current_total_limit_usd;
 const selectedNames=names;
 const nameError=workerNamesError(selectedNames);
 const editable=canApprove&&!approved&&!declined;
 async function decide(action:'approve'|'decline'){
  if(!onDecision||action==='approve'&&!!nameError)return;setBusy(true);setError('');
  try{await onDecision(action,request.id,action==='approve'?value:undefined,action==='approve'?Object.fromEntries(ids.map((id,i)=>[id,normalizeWorkerName(selectedNames[i])])):undefined);}catch(e:any){setError(e.message);}finally{setBusy(false);}
 }
 return <Translate><div className="plan-approval-report" aria-label="Commander approval report">
  <h2>Review the mission report before workers start<HelpButton topic="plan"/></h2>
  {onDiscuss&&<button type="button" className="plan-discuss-master" onClick={onDiscuss}>Discuss this plan with the Master Agent</button>}
  <p role="status">{approved?'Plan approved · execution authorized':declined?'Plan declined · workers were not started':'Waiting for your permission · no workers have been created or run'}</p>
  {approved&&!events.some(e=>e.type==='mission.execution_opened')&&typeof approved.payload.total_budget_usd==='number'&&<p>Approved total allowance: ${approved.payload.total_budget_usd.toFixed(2)}</p>}
  <section className="worker-name-review" aria-label="Review worker names"><h3>{editable?'Do you approve these worker names?':'Worker names'}<HelpButton topic="names"/></h3><p>The master suggested this team. Keep the suggested names or give each worker a name of your choice.</p>
    <div className="worker-name-fields">{tasks.map((task:any,i:number)=><label key={ids[i]}><span>Worker {i+1} · {task.role}</span><input aria-label={`Name for worker ${i+1}`} dir="auto" value={currentNames.get(ids[i])??approved?.payload.worker_names?.[ids[i]]??names[i]} readOnly={!editable} disabled={busy} maxLength={60} onChange={e=>setNames(old=>old.map((name,index)=>index===i?e.target.value:name))}/><small>{task.title}</small></label>)}</div>
    {editable&&nameError&&<p role="alert" className="worker-name-error">{nameError}</p>}
    {editable&&<p className="worker-name-hint">Keep these names or edit them directly. Approving the plan confirms your chosen names.</p>}
    <small>Names can be Arabic or English. Roles, tasks and worker count stay the same. Changing names makes no AI request.</small>
  </section>
  <div className="plan-estimate-grid"><div><span>Proposed team</span><strong>1 commander + {request.payload.worker_plan.tasks.length} workers</strong></div><div><span>Estimated total API cost<HelpButton topic="cost"/></span><strong>${estimate.estimated_total_low_usd.toFixed(2)} – ${estimate.estimated_total_high_usd.toFixed(2)}</strong></div><div><span>Execution policy</span><strong>Open-ended · until master approval</strong></div><div><span>Estimated execution time</span><strong>{estimate.estimated_seconds_low} – {estimate.estimated_seconds_high} seconds</strong></div><div><span>Planning cost already incurred</span><strong>${estimate.planning_usage.estimated_cost_usd.toFixed(4)}</strong></div></div>
  {estimate.source_reading_cost_usd>0&&<p>Attachment reading already incurred: ${estimate.source_reading_cost_usd.toFixed(4)} · separate from the execution estimate.</p>}
  <p>The estimate includes planning usage. Actual cost and time can exceed this estimate. Execution continues until master approval; pause or cancel any time.</p>
  <details><summary>Estimate assumptions and limits</summary><p>{estimate.estimate_basis}</p><p>{estimate.expected_additional_calls} expected additional model calls for the initial pass. Additional work increases cost; app resource caps are disabled.</p><p>Assumed input tokens per call: {estimate.assumptions.input_tokens_per_call}. Assumed output tokens per worker: {estimate.assumptions.output_tokens_per_worker}.</p><p>Configured rates per million tokens: input ${estimate.assumptions.input_usd_per_million}, output ${estimate.assumptions.output_usd_per_million}.</p></details>
  {error&&<p role="alert">{error}</p>}
  {canApprove&&!approved&&!declined&&<div className="plan-consent"><p>Approving authorizes open-ended paid execution of this plan. Cost estimates remain visible. You can pause or cancel at any time.</p><div className="plan-consent-buttons"><button disabled={busy||!!nameError} onClick={()=>void decide('approve')}>{busy?'Processing…':'Approve this plan and start workers'}</button><button disabled={busy} onClick={()=>void decide('decline')}>Decline plan · return to mission input</button></div></div>}
 </div></Translate>;
}
