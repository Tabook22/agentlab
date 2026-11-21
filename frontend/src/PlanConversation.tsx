import {ArrowRight, Bot, CheckCircle2, Target} from 'lucide-react';
import {useLanguage} from './i18n';
import type {LabEvent} from './events';
import './planConversation.css';

export function PlanConversation({request,events}:{request:LabEvent;events:LabEvent[]}) {
 const {language}=useLanguage(),ar=language==='ar';
 const plan=request.payload.worker_plan,report=request.payload.report;
 const tasks=plan.tasks;
 const changes=events.filter(e=>e.type==='mission.plan_revision_requested'&&e.sequence<request.sequence);
 return <section className="plan-conversation" aria-label={ar?'شرح القائد قبل التنفيذ':'Master’s proposed approach'}>
  <header><span className="plan-conversation-avatar"><Bot size={24}/></span><div><span>{ar?'نفهم · نخطط · نراجع معاً':'UNDERSTAND · PLAN · REVIEW TOGETHER'}</span><h3>{ar?'هذه طريقتي المقترحة. ما رأيك؟':'Here is my proposed approach. What do you think?'}</h3></div></header>
  {changes.length>0&&<details className="plan-change-history"><summary>{ar?'تعديلاتك على الخطة':'Your requested changes'} · {changes.length}</summary>{changes.map(e=><p key={e.id} dir="auto">{e.payload.instruction}</p>)}</details>}
  <article className="plan-master-message"><h4><Target size={16}/>{ar?'كيف فهمت طلبك':'How I understand your request'}</h4><p dir="auto">{report?.requested_objective??events.find(e=>e.type==='mission.created')?.payload.prompt}</p><h4>{ar?'كيف أقترح حلّه':'How I propose to solve it'}</h4><p dir="auto">{plan.scope}</p></article>
  <article className="plan-master-message"><h4>{ar?'الفريق الذي أقترحه ولماذا':'The team I propose, and why'}</h4><p dir="auto">{plan.count_reason}</p><div className="plan-team-total">{ar?`قائد واحد + ${tasks.length} وكلاء مقترحين`:`1 master + ${tasks.length} proposed workers`}</div></article>
  <div className="plan-handoff-heading"><ArrowRight size={17}/><h4>{ar?'ما الذي سيحدث، خطوة بخطوة':'What will happen, step by step'}</h4></div>
  <ol className="plan-proposed-route">{tasks.map((task:any,index:number)=>{
   const dependencies:number[]=task.dependencies??[];
   const recipients=tasks.filter((next:any)=>(next.dependencies??[]).includes(index));
   return <li key={index}><span className="plan-route-number">{index+1}</span><article className="plan-master-message"><h4><bdi dir="auto">{task.name??`Worker ${index+1}`}</bdi><span>{task.role}</span></h4><p dir="auto">{task.title}</p><dl>
    <dt>{ar?'يبدأ بعد':'Starts after'}</dt><dd>{dependencies.length?dependencies.map(i=>tasks[i]?.name??`Worker ${i+1}`).join(' + '):(ar?'موافقتك؛ لا ينتظر وكيلاً آخر':'Your approval; no worker dependency')}</dd>
    <dt>{ar?'يستلم':'Receives'}</dt><dd dir="auto">{task.input_description}</dd>
    <dt>{ar?'ينفّذ':'Will do'}</dt><dd dir="auto">{task.instructions}</dd>
    <dt>{ar?'يسلّم':'Delivers'}</dt><dd dir="auto">{task.expected_output}</dd>
    <dt>{ar?'الخطوة التالية':'Next handoff'}</dt><dd>{recipients.length?recipients.map((next:any)=>next.name).join(' + '):(ar?'القائد لدمج النتيجة ومراجعتها':'Master Agent for assembly and review')}</dd>
   </dl>{task.acceptance_criteria?.length>0&&<div className="plan-task-checks"><strong>{ar?'أقبل عمله عندما':'I will accept this work when'}</strong><ul>{task.acceptance_criteria.map((criterion:string)=><li key={criterion} dir="auto">{criterion}</li>)}</ul></div>}</article></li>;
  })}</ol>
  <article className="plan-master-message plan-final-check"><h4><CheckCircle2 size={17}/>{ar?'ثم أراجع الإجابة كاملة':'Then I review the complete answer'}</h4><p dir="auto">{plan.success_criteria}</p><p>{ar?'سأجمع المخرجات وأراجعها، وأطلب التعديلات اللازمة قبل اعتماد الإجابة النهائية.':'I will combine the outputs, review the complete answer, and request corrections where needed before final approval.'}</p></article>
  <p className="plan-proposal-note">{ar?'هذا شرح للخطة المقترحة، وليس إجابة مكتملة. لن أنشئ الوكلاء أو أرسل لهم المهام حتى توافق على هذه النسخة.':'This is a proposed approach, rather than a completed answer. I will create workers and send assignments only after you approve this version.'}</p>
 </section>;
}
