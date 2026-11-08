import { apiBase } from './apiBase';
import {useEffect,useId,useState,type CSSProperties} from 'react';
import {ArrowRight,CheckCircle2,ChevronLeft,ChevronRight,FileText,MessageSquare,Pause,Play,RotateCcw,Send,Users} from 'lucide-react';
import type {LabEvent} from './events';
import {Robot,avatarCharacter} from './Robot';
import {DataPreview} from './WorkView';
import {AnswerText} from './AnswerText';
import {useLanguage,translateText} from './i18n';
import {ResearchSources} from './ResearchText';
import {keyMoments,openQuestions,sharedResult,workspaceAgents,workspaceExchanges} from './workspace';
import './workspace.css';

type Props={events:LabEvent[];status:string;replay:boolean;onInspect:(id:string)=>void;onRecover?:()=>void;onAnswered?:()=>Promise<void>;onResult?:()=>void};
function AnswerQuestion({question,onAnswered}:{question:LabEvent;onAnswered?:()=>Promise<void>}) {
 const [answer,setAnswer]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[saved,setSaved]=useState(false);
 const {language}=useLanguage(),ar=language==='ar';const id=useId();
 async function send(){
  setBusy(true);setMessage('');
  try{
   const response=await fetch(`${apiBase}/missions/${question.mission_id}/questions/${question.id}/answer`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({instruction:answer})});
   const body=await response.json();if(!response.ok)throw Error(typeof body.detail==='string'?body.detail:'Could not save your answer.');
   setSaved(true);setMessage(ar?'حُفظت الإجابة. تابع المهمة من أدوات المتابعة.':'Answer saved. Use recovery controls to continue the mission.');
   await onAnswered?.();
  }catch(error){setMessage(error instanceof Error?error.message:'Could not save your answer.');}finally{setBusy(false);}
 }
 return <form onSubmit={e=>{e.preventDefault();void send();}} className="workspace-answer"><label htmlFor={id}>{ar?'إجابتك للوكيل':'Your answer to the agent'}</label><textarea id={id} dir="auto" maxLength={1500} value={answer} disabled={busy||saved} onChange={e=>setAnswer(e.target.value)} placeholder={ar?'قدّم المعلومات أو القرار المطلوب':'Provide the missing information or decision'}/><button disabled={busy||saved||answer.trim().length<1}><Send size={14}/>{saved?(ar?'حُفظت':'Saved'):busy?(ar?'جارٍ الحفظ…':'Saving…'):(ar?'احفظ الإجابة':'Save answer')}</button><small>{ar?'الحفظ لا يستأنف طلبات AI المدفوعة.':'Saving an answer does not restart paid AI requests.'}</small>{message&&<p role="status">{message}</p>}</form>;
}

function Workbench({worker,index,onInspect,active:isWorking=false}:{worker:ReturnType<typeof workspaceAgents>[number];index:number;onInspect?:(id:string)=>void;active?:boolean}) {
 const [tab,setTab]=useState('Plan'),[expanded,setExpanded]=useState(false);const uid=useId();
 const {language}=useLanguage(),ar=language==='ar';const w=worker;
 const character=avatarCharacter({role:w.role,identity:w.agent_id});
 const tabs=[['Context','السياق'],['Plan','الخطة'],['Work','العمل'],['Check','الفحص']];
 const active=tab==='Context'?w.observe:tab==='Plan'?w.plan:tab==='Work'?w.act??w.draft:w.test??w.review;
 return <article className={`agent-workbench accent-${index%4} ${w.question?'needs-answer':''}`} style={{'--agent-accent':character.dark,'--agent-tint':character.light} as CSSProperties}>
  <header><Robot small identity={w.agent_id} role={w.role} active={isWorking}/><div><h4><bdi translate="no" dir="auto">{w.name}</bdi></h4><p>{w.role}</p><span className="avatar-personality">{ar?character.ar:character.title}</span></div><span className={`workspace-status ${w.accepted?'accepted':''}`}>{translateText(w.status,language)}</span></header>
  <div className="workbench-assignment"><small>{ar?'المهمة':'ASSIGNMENT'}</small><p dir="auto">{w.task}</p></div>
  <div className="workbench-now"><span className="workbench-dot"/><div><strong>{ar?'آخر نشاط':'Latest activity'}</strong><p dir="auto">{w.last?.payload.summary??(ar?'لم يبدأ العمل بعد.':'Work has not started yet.')}</p>{w.last&&<small>{ar?'السجل':'Record'} #{w.last.sequence}</small>}</div></div>
  {w.plan&&<div className="workbench-approach"><strong>{ar?'النهج المقترح':'Approach'}</strong><p dir="auto">{w.plan.payload.public_plan?.[0]??w.plan.payload.summary}</p></div>}
  {w.question?<p className="workbench-blocker"><MessageSquare size={14}/>{w.question.payload.data?.question??w.question.payload.summary}</p>:!w.observe&&w.waits_for.length>0?<p className="workbench-dependency">{ar?'بانتظار':'Waiting for'} {w.waits_for.join(', ')}</p>:null}
  <div className="workbench-desk"><FileText size={16}/><div><strong>{w.draft?.payload.output?.label??(w.draft?(ar?'مسودة محفوظة':'Saved draft'):(ar?'على المكتب':'On the desk'))}</strong><small>{w.draft?`${ar?'محاولة':'Attempt'} ${w.draft.payload.cycle??1} · ${w.accepted?(ar?'مقبولة':'Accepted'):(ar?'مسودة':'Draft')}`:(ar?'ستظهر المخرجات هنا.':'The deliverable will appear here.')}</small></div></div>
  <button type="button" className="workbench-open" aria-expanded={expanded} aria-controls={`${uid}-details`} onClick={()=>setExpanded(!expanded)}>{expanded?(ar?'أغلق المكتب':'Close workbench'):(ar?'افتح المكتب':'Open workbench')}<ArrowRight size={14}/></button>
  {expanded&&<div id={`${uid}-details`} className="workbench-details"><div role="tablist" aria-label={`${w.name} workbench`}>{tabs.map(([key,label])=><button type="button" role="tab" id={`${uid}-${key}`} aria-selected={tab===key} tabIndex={tab===key?0:-1} onKeyDown={e=>{const current=tabs.findIndex(([k])=>k===key);const next=e.key==='Home'?0:e.key==='End'?3:e.key==='ArrowRight'?(current+1)%4:e.key==='ArrowLeft'?(current+3)%4:-1;if(next>=0){e.preventDefault();setTab(tabs[next][0]);document.getElementById(`${uid}-${tabs[next][0]}`)?.focus();}}} aria-controls={`${uid}-panel`} key={key} onClick={()=>setTab(key)}>{ar?label:key}</button>)}</div><div role="tabpanel" id={`${uid}-panel`} aria-labelledby={`${uid}-${tab}`}>
   {active?<><small>{ar?'السجل':'Record'} #{active.sequence}</small><p dir="auto">{active.payload.summary}</p>{tab==='Plan'&&<><ol>{(active.payload.public_plan??[]).map((line:string,i:number)=><li key={i} dir="auto">{line}</li>)}</ol>{active.payload.observations&&<p>{active.payload.observations}</p>}{active.payload.known_limitations?.length>0&&<ul>{active.payload.known_limitations.map((line:string,i:number)=><li key={i}>{line}</li>)}</ul>}</>}{tab==='Context'&&<DataPreview data={active.payload.world??active.payload.input??{}}/>}{tab==='Work'&&<DataPreview data={active.payload.artifact??active.payload.output??{}}/>}{tab==='Check'&&<><p>{active.payload.feedback??active.payload.data?.feedback}</p><ul>{(active.payload.checks??active.payload.data?.checks??[]).map((c:any,i:number)=><li key={i}>{c.passed?'✓':'↻'} {c.criterion??c.check}{c.evidence?`: ${c.evidence}`:''}</li>)}</ul></>}</>:<p>{ar?'لم يُسجّل هذا الجزء بعد.':'This step has not been recorded yet.'}</p>}
  </div>{onInspect&&<button type="button" onClick={()=>onInspect(w.agent_id)}>{ar?'تفاصيل الوكيل':'Agent details'}<ArrowRight size={13}/></button>}</div>}
 </article>;
}

export function AgentWorkspace({events,status,replay,onInspect,onRecover,onAnswered,onResult}:Props){
 const {language}=useLanguage(),ar=language==='ar';
 const [cursor,setCursor]=useState<number|null>(null),[playing,setPlaying]=useState(false),[filter,setFilter]=useState('All'),[limit,setLimit]=useState(8),[contribution,setContribution]=useState<string|null>(null);
 const moments=keyMoments(events),historical=cursor!==null;
 const visible=historical?events.filter(e=>e.sequence<=cursor):events;
 const workers=workspaceAgents(visible),exchanges=workspaceExchanges(visible),questions=openQuestions(visible),result=sharedResult(visible);
 const names=new Map<string,string>([['master',ar?'الوكيل القائد':'Master Agent'],['you',ar?'أنت':'You'],['team',ar?'الفريق':'Team'],...workers.map(w=>[w.agent_id,w.name] as [string,string])]);
 const name=(id:string)=>names.get(id)??id;
 const index=cursor===null?moments.length-1:moments.findLastIndex(e=>e.sequence<=cursor);
 useEffect(()=>{if(!playing)return;const timer=window.setInterval(()=>setCursor(current=>{const next=moments.find(e=>e.sequence>(current??0));if(!next){setPlaying(false);return current;}return next.sequence;}),1800);return ()=>window.clearInterval(timer);},[playing,moments.map(e=>e.sequence).join(',')]);
 const chosen=workers.find(w=>w.agent_id===contribution&&w.draft);
 const output=chosen?.draft?.payload.output??result.output;
 const filtered=exchanges.filter(e=>filter==='All'||e.kind===filter);
 const canAnswer=!replay&&!historical&&status==='FAILED'&&events.find(e=>e.type==='mission.created')?.payload.mode==='live';
 return <section className="agent-workspace" aria-label={ar?'مساحة عمل الفريق':'Team workspace'}>
  <div className="workspace-toolbar"><div><Users size={18}/><strong>{ar?'مساحة عمل الفريق':'Team workspace'}</strong><span>{replay||historical?(ar?'إعادة عرض مسجلة':'Recorded replay'):(ar?'من سجل المهمة':'From the mission record')}</span></div><button type="button" disabled={!moments.length} onClick={()=>{setPlaying(false);setCursor(historical?null:moments[0]?.sequence??null);}}><RotateCcw size={14}/>{historical?(ar?'العودة إلى أحدث نشاط':'Return to latest'):(ar?'أعد عرض اللحظات المهمة':'Replay key moments')}</button></div>
  {historical&&<div className="workspace-replay" aria-label="Key moment playback"><button type="button" aria-label="Previous key moment" disabled={index<=0} onClick={()=>{setPlaying(false);setCursor(moments[index-1].sequence);}}><ChevronLeft size={17}/></button><button type="button" aria-label={playing?'Pause key moments':'Play key moments'} disabled={index>=moments.length-1} onClick={()=>setPlaying(!playing)}>{playing?<Pause size={16}/>:<Play size={16}/>}</button><button type="button" aria-label="Next key moment" disabled={index>=moments.length-1} onClick={()=>{setPlaying(false);setCursor(moments[index+1].sequence);}}><ChevronRight size={17}/></button><span>{index+1} / {moments.length} · {ar?'السجل':'Record'} #{cursor}</span><p>{ar?'عرض تاريخي. لا تُرسل طلبات AI جديدة.':'Historical view. No new AI calls.'}</p></div>}
  <div className="workspace-columns"><section className="workspace-agents"><div className="workspace-section-title"><span>01</span><h3>{ar?'الوكلاء يعملون':'Agents working'}</h3><small>{workers.length}</small>{!historical&&<button type="button" onClick={()=>onInspect('master')}>{ar?'قابل القائد':'Meet the coordinator'}<ArrowRight size={13}/></button>}</div>
   <p className="workspace-caption">{ar?'سياق وخطط موجزة وأعمال وفحوص مسجّلة.':'Recorded context, public plans, work, and checks.'}</p>
   <div className="workspace-coordinator"><Robot leader small/><div><small>{ar?'الوكيل القائد':'MASTER AGENT'}</small><strong>{ar?'القائد الحكيم':'Thoughtful guide'}</strong><p>{ar?'هادئ · حاسم · مشجّع':'Calm · decisive · encouraging'}</p></div></div>
   {workers.length?<div className="workbench-list">{workers.map((w,i)=><Workbench key={w.agent_id} worker={w} index={i} active={!replay&&!historical&&status==='RUNNING'&&w.agent?.state==='RUNNING'} onInspect={historical?undefined:onInspect}/>)}</div>:<div className="workspace-empty"><Robot leader small color="purple"/><h4>{ar?'المكاتب جاهزة للفريق':'Desks ready for your team'}</h4><p>{ar?'ستظهر الأدوار هنا عندما يجهّز القائد الخطة.':'Roles and assignments appear when the coordinator prepares the plan.'}</p></div>}
  </section>
  <section className="workspace-result"><div className="workspace-section-title"><span>02</span><h3>{ar?'النتيجة المشتركة':'Shared result'}</h3></div><p className="workspace-caption">{ar?'شاهد المساهمات تتحول إلى مخرجات مفيدة.':'Follow each contribution into the deliverable.'}</p>
   <div className="result-contributions" role="group" aria-label="Choose a contribution"><button type="button" aria-pressed={!chosen} onClick={()=>setContribution(null)}>{ar?'إجابة الفريق':'Team answer'}</button>{workers.filter(w=>w.draft).map(w=><button type="button" key={w.agent_id} aria-pressed={chosen?.agent_id===w.agent_id} onClick={()=>setContribution(w.agent_id)}><bdi translate="no">{w.name}</bdi>{w.accepted&&<CheckCircle2 size={12}/>}</button>)}</div>
   <div className="workspace-paper"><div className="workspace-paper-meta"><FileText size={16}/><strong>{chosen?(chosen.accepted?(ar?'مهمة مقبولة':'Task accepted'):(ar?'مسودة وكيل':'Worker draft')):result.approved?(ar?'اعتماد نهائي مسجّل':'Final approval recorded'):(ar?'مسودة الفريق':'Team draft')}</strong>{(chosen?.draft??result.event)&&<small>#{(chosen?.draft??result.event)!.sequence}</small>}</div>
    <h4 dir="auto">{output?.label??(ar?'من المهمة إلى النتيجة':'From assignment to answer')}</h4>{output?<div className="workspace-result-content" dir="auto">{typeof output.content==='string'?<><AnswerText content={output.content}/><ResearchSources sources={output.sources}/>{output.limitations?.length>0&&<ul>{output.limitations.map((line:string,i:number)=><li key={i}>{line}</li>)}</ul>}</>:<DataPreview data={output}/>}</div>:<div className="workspace-empty"><FileText size={32}/><p>{ar?'لم تُجمع إجابة الفريق بعد. افتح مساهمة وكيل عندما تظهر أعلاه.':'The team answer has not been assembled yet. Open a worker contribution when it appears above.'}</p></div>}
    {!chosen&&result.event?.type==='mission.completed'&&onResult&&!historical&&<button className="workspace-result-link" type="button" onClick={onResult}>{ar?'افتح النتيجة وأدوات التصدير':'Open result and export tools'}<ArrowRight size={14}/></button>}
   </div>
   <div className="workspace-changes"><h4>{ar?'ما الذي تغيّر؟':'What changed?'}</h4>{visible.filter(e=>['agent.review_requested','master.review_completed','master.improved','master.final_approved'].includes(e.type)).slice(-4).reverse().map(e=><p key={e.id}><span>#{e.sequence}</span><strong>{name(e.agent_id??'master')}</strong> {e.payload.summary}</p>)}{!visible.some(e=>e.type==='agent.review_requested'||e.type==='master.improved')&&<p>{ar?'ستظهر عمليات التسليم والمراجعات هنا.':'Draft handoffs and revisions will appear here.'}</p>}</div>
  </section>
  <section className="workspace-discussion"><div className="workspace-section-title"><span>03</span><h3>{ar?'الأسئلة والقرارات':'Questions & decisions'}</h3></div><p className="workspace-caption">{ar?'رسائل وتسليمات فعلية. ينفّذ العمال المهام بالتتابع.':'Actual messages and handoffs. Workers execute in sequence.'}</p>
   {questions.length>0&&<div className="workspace-questions"><h4><MessageSquare size={16}/>{ar?'تحتاج إلى إجابتك':'Needs your answer'} · {questions.length}</h4>{questions.map(q=><article key={q.id}><strong><bdi translate="no">{name(q.agent_id??q.payload.sender)}</bdi></strong><p dir="auto">{q.payload.data?.question??q.payload.summary}</p><small>#{q.sequence}</small>{canAnswer&&q.mission_id?<AnswerQuestion question={q} onAnswered={onAnswered}/>:<p className="workspace-caption">{replay||historical?(ar?'الأسئلة في الإعادة للقراءة فقط.':'Questions in replay are read-only.'):(['COMPLETED','CANCELLED'].includes(status)?(ar?'هذا السجل للقراءة فقط.':'This run is read-only.'):(ar?'انتظر توقف العامل قبل الإجابة.':'Wait for the worker to stop before answering.'))}</p>}</article>)}</div>}
   {canAnswer&&events.some(e=>e.type==='workspace.question_answered')&&onRecover&&<button type="button" className="workspace-recover" onClick={onRecover}>{ar?'افتح أدوات متابعة العمل المحفوظ':'Open controls to continue saved work'}<ArrowRight size={14}/></button>}
   <div className="workspace-filters" role="group" aria-label="Filter exchanges">{[['All','الكل'],['Question','سؤال'],['Idea','فكرة'],['Feedback','ملاحظات'],['Decision','قرار'],['Handoff','تسليم']].map(([key,label])=><button type="button" key={key} aria-pressed={filter===key} onClick={()=>{setFilter(key);setLimit(8);}}>{ar?label:key}</button>)}</div>
   <div className="workspace-messages">{filtered.slice(-limit).reverse().map(({event,kind,from,to,text})=><article key={event.id} className={`exchange-${kind.toLowerCase()}`}><header><span>{({Question:ar?'سؤال':'Question',Idea:ar?'فكرة':'Idea',Feedback:ar?'ملاحظات':'Feedback',Decision:ar?'قرار':'Decision',Handoff:ar?'تسليم':'Handoff'})[kind]}</span><small>#{event.sequence}</small></header><strong><bdi translate="no">{name(from)}</bdi> → <bdi translate="no">{name(to)}</bdi></strong><p dir="auto">{text}</p><details><summary>{ar?'افتح السجل':'Open record'}</summary><>{event.payload.data?.public_plan&&<ol>{event.payload.data.public_plan.map((line:string,i:number)=><li key={i}>{line}</li>)}</ol>}{event.payload.data?.observations&&<p>{event.payload.data.observations}</p>}<DataPreview data={event.payload.data??event.payload.basis??{summary:text}}/></></details></article>)}{!filtered.length&&<div className="workspace-empty"><MessageSquare size={28}/><p>{ar?'لا توجد رسائل من هذا النوع حتى الآن.':'No exchanges of this type recorded yet.'}</p></div>}{filtered.length>limit&&<button type="button" onClick={()=>setLimit(n=>n+8)}>{ar?'اعرض رسائل أقدم':'Show older exchanges'}</button>}</div>
  </section></div>
  <p className="workspace-footnote">{ar?'الخطط والتفسيرات ملخصات عامة مسجّلة، وليست تفكير النموذج الداخلي.':'Plans and explanations are recorded public summaries, not private model reasoning.'}</p>
 </section>;
}
