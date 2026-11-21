import {PlanConversation} from './PlanConversation';
import { HelpButton } from './Help';
import {useEffect,useState} from 'react';
import {Translate,useLanguage} from './i18n';
import {agentsFrom,type LabEvent} from './events';
import {normalizeWorkerName,workerNamesError} from './workerNames';
import './workerNames.css';

export function PlanApprovalReport({request,events,canApprove,onDecision,onDiscuss,onRevise}:{request:LabEvent;events:LabEvent[];canApprove:boolean;onRevise?:(planId:string,instruction:string)=>Promise<void>;onDiscuss?:()=>void;onDecision?:(action:'approve'|'decline',planId:string,cap?:number,names?:Record<string,string>)=>Promise<void>}){
 const {language}=useLanguage(),ar=language==='ar';
 const [revision,setRevision]=useState('');
 const estimate=request.payload.estimate;
 const currentNames=new Map(agentsFrom(events).map(agent=>[agent.id,agent.config.name]));

 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const tasks=request.payload.worker_plan.tasks;
 const ids:string[]=request.payload.agent_ids??tasks.map((_:unknown,i:number)=>String(i));
 const suggested:string[]=tasks.map((task:any,i:number)=>task.name??`Worker ${i+1}`);
 const [names,setNames]=useState<string[]>(suggested);
 useEffect(()=>{setNames(suggested);setRevision('');},[request.id]);
 const approved=events.find(e=>e.type==='mission.plan_approved'&&e.payload.plan_id===request.id);
 const declined=events.find(e=>e.type==='mission.plan_declined'&&e.payload.plan_id===request.id);
 const value=estimate.current_total_limit_usd;
 const selectedNames=names;
 const nameError=workerNamesError(selectedNames);
 const editable=canApprove&&!approved&&!declined;
 async function decide(action:'approve'|'decline'){
  if(!onDecision||busy||!editable||action==='approve'&&(!!nameError||!!revision.trim()))return;setBusy(true);setError('');
  try{await onDecision(action,request.id,action==='approve'?value:undefined,action==='approve'?Object.fromEntries(ids.map((id,i)=>[id,normalizeWorkerName(selectedNames[i])])):undefined);}catch(e:any){setError(e.message);}finally{setBusy(false);}
 }
 async function revise(){
  if(!onRevise||!editable||busy||!revision.trim())return;
  setBusy(true);setError('');
  try{await onRevise(request.id,revision.trim());}catch(e:any){setError(e.message);}finally{setBusy(false);}
 }
 return <Translate><div className="plan-approval-report" aria-label="Commander approval report">
  <h2>Review the mission report before workers start<HelpButton topic="plan"/></h2>
  {onDiscuss&&<button type="button" className="plan-discuss-master" onClick={onDiscuss}>Discuss this plan with the Master Agent</button>}
  <p role="status">{approved?'Plan approved · execution authorized':declined?'Plan declined · workers were not started':'Waiting for your permission · no workers have been created or run'}</p>
  {approved&&!events.some(e=>e.type==='mission.execution_opened')&&typeof approved.payload.total_budget_usd==='number'&&<p>Approved total allowance: ${approved.payload.total_budget_usd.toFixed(2)}</p>}
  <PlanConversation request={request} events={events}/>
  <section className="worker-name-review" aria-label="Review worker names"><h3>{editable?'Do you approve these worker names?':'Worker names'}<HelpButton topic="names"/></h3><p>The master suggested this team. Keep the suggested names or give each worker a name of your choice.</p>
    <div className="worker-name-fields">{tasks.map((task:any,i:number)=><label key={ids[i]}><span>Worker {i+1} · {task.role}</span><input aria-label={`Name for worker ${i+1}`} dir="auto" value={currentNames.get(ids[i])??approved?.payload.worker_names?.[ids[i]]??names[i]} readOnly={!editable} disabled={busy} maxLength={60} onChange={e=>setNames(old=>old.map((name,index)=>index===i?e.target.value:name))}/><small>{task.title}</small></label>)}</div>
    {editable&&nameError&&<p role="alert" className="worker-name-error">{nameError}</p>}
    {editable&&<p className="worker-name-hint">Keep these names or edit them directly. Approving the plan confirms your chosen names.</p>}
    <small>Names can be Arabic or English. Roles, tasks and worker count stay the same. Changing names makes no AI request.</small>
  </section>
  <div className="plan-estimate-grid"><div><span>Proposed team</span><strong>1 commander + {request.payload.worker_plan.tasks.length} workers</strong></div><div><span>Estimated total API cost<HelpButton topic="cost"/></span><strong>${estimate.estimated_total_low_usd.toFixed(2)} – ${estimate.estimated_total_high_usd.toFixed(2)}</strong></div><div><span>Execution policy</span><strong>Open-ended · until master approval</strong></div><div><span>Estimated execution time</span><strong>{estimate.estimated_seconds_low} – {estimate.estimated_seconds_high} seconds</strong></div><div><span>Planning cost already incurred</span><strong>${estimate.planning_usage.estimated_cost_usd.toFixed(4)}</strong></div></div>
  {estimate.source_reading_cost_usd>0&&<p>Attachment reading already incurred: ${estimate.source_reading_cost_usd.toFixed(4)} · separate from the execution estimate.</p>}
  <p>The estimate includes planning usage. Actual cost and time can exceed this estimate. Execution continues until master approval; pause or cancel any time.</p>
  {estimate.related_resources_enabled&&<p className="plan-scope">{language==='ar'?'بعد تسليم الإجابة، سيبحث القائد عن موارد إضافية مرتبطة بها. يتضمن التقدير أربعة طلبات نموذج إضافية، منها عمليتا بحث محدودتان، ضمن مخصص المهمة. تبقى الإجابة متاحة إذا تعذر البحث.':'After delivery, the commander will discover related learning resources. The estimate includes four additional model requests, including two bounded web-research requests, within the mission allowance. The answer stays available if discovery cannot finish.'}</p>}
  <details><summary>Estimate assumptions and limits</summary><p>{estimate.estimate_basis}</p><p>{estimate.expected_additional_calls} expected additional model calls for the initial pass. Additional work increases cost; app resource caps are disabled.</p><p>Assumed input tokens per call: {estimate.assumptions.input_tokens_per_call}. Assumed output tokens per worker: {estimate.assumptions.output_tokens_per_worker}.</p><p>Configured rates per million tokens: input ${estimate.assumptions.input_usd_per_million}, output ${estimate.assumptions.output_usd_per_million}.</p></details>
  {editable&&onRevise&&<form className="plan-revision-form" aria-label={ar?'راجع الخطة مع القائد':'Revise the plan with the master'} onSubmit={e=>{e.preventDefault();void revise();}}>
   <h3>{ar?'ما الذي تريد تغييره؟':'What would you like to change?'}</h3>
   <p>{ar?'أضف مهمة أو احذفها، غيّر الأدوار أو ترتيب التسليم، أو حدّد معايير قبول مختلفة. سأعيد بناء الخطة وأعرضها عليك قبل بدء التنفيذ.':'Add or remove tasks, change roles or handoffs, or set different acceptance criteria. I will revise the proposal and bring it back for your review before execution.'}</p>
   <label htmlFor="plan-revision">{ar?'تعديلاتك على هذه الخطة':'Your changes to this plan'}</label>
   <textarea id="plan-revision" dir="auto" value={revision} maxLength={3000} disabled={busy} onChange={e=>setRevision(e.target.value)} placeholder={ar?'مثلاً: استخدم وكيلين، وأضف مقارنة للمصادر قبل كتابة الإجابة.':'For example: Use two workers, add a source comparison, and remove the quiz.'}/>
   <button type="submit" disabled={busy||!revision.trim()}>{busy?(ar?'جارٍ إعداد الخطة…':'Preparing the revised plan…'):(ar?'عدّل الخطة وأعد عرضها':'Revise this plan')}</button>
   <small>{ar?'تعديل الخطة يستخدم طلب AI مدفوعاً. ستتحدث تقديرات التكلفة والوقت، وستبقى موافقتك مطلوبة.':'Revising uses a paid AI planning request. Cost and time estimates will update, and the new version will still need your approval.'}</small>
   {revision.trim()&&<p role="status">{ar?'أرسل تعديلاتك أو امسحها قبل الموافقة على الخطة.':'Submit or clear your changes before approving the plan.'}</p>}
  </form>}
  {events.some(e=>e.type==='mission.plan_revision_requested'&&e.sequence>request.sequence)&&<p role="status">{ar?'يراجع القائد تعديلاتك. هذه النسخة لم تعد متاحة للموافقة.':'The master is reviewing your changes. This version is no longer available for approval.'}</p>}
  {error&&<p role="alert">{error}</p>}
  {editable&&<div className="plan-consent"><h3>{ar?'هل توافق على هذه الخطوات؟':'Do you approve this procedure?'}</h3><p>Approving authorizes open-ended paid execution of this plan. Cost estimates remain visible. You can pause or cancel at any time.</p><div className="plan-consent-buttons"><button disabled={busy||!!nameError||!!revision.trim()} onClick={()=>void decide('approve')}>{busy?'Processing…':'Approve this plan and start workers'}</button><button disabled={busy} onClick={()=>void decide('decline')}>Decline plan · return to mission input</button></div></div>}
 </div></Translate>;
}
