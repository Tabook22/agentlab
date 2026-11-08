import {useState} from 'react';
import {ArrowRight,CheckCircle2,MessageCircle,Send} from 'lucide-react';
import {Robot} from './Robot';
import {useLanguage} from './i18n';
import type {LabEvent} from './events';
import './clarification.css';

export function pendingClarification(events:LabEvent[]){
 const question=events.findLast(e=>e.type==='mission.clarification_requested');
 return question&&!events.some(e=>e.type==='mission.clarification_answered'&&e.payload.question_id===question.id)?question:undefined;
}

export function MissionClarification({events,status,canAnswer=false,onAnswer}:{events:LabEvent[];status:string;canAnswer?:boolean;onAnswer?:(questionId:string,answer:string)=>Promise<void>}){
 const {language}=useLanguage(),ar=language==='ar';
 const [draft,setDraft]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const question=pendingClarification(events),answers=events.filter(e=>e.type==='mission.clarification_answered');
 const understood=events.findLast(e=>e.type==='master.mission_understood');
 if(!question&&!understood&&!answers.length)return null;
 const editable=!!question&&canAnswer&&status==='AWAITING_CLARIFICATION'&&!!onAnswer;
 async function send(){
  if(!question||!editable||busy||!draft.trim())return;
  setBusy(true);setError('');
  try{await onAnswer!(question.id,draft.trim());setDraft('');}catch(cause){setError(cause instanceof Error?cause.message:'Could not send your answer.');}finally{setBusy(false);}
 }
 return <section id="mission-clarification" className={`mission-clarification ${question?'needs-clarification':'mission-understood'}`} aria-label={ar?'فهم المهمة وتوضيحها':'Mission understanding and clarification'}>
  <header><Robot leader small/><div><span className="clarification-kicker">{ar?'قبل توزيع المهام':'BEFORE DELEGATION'}</span><h2>{question?(ar?'دعني أتأكد من فهم مهمتك':'Let me make sure I understand your mission'):(understood?(ar?'المهمة واضحة — جاهزة للتخطيط':'Mission understood — ready for the team plan'):(ar?'يراجع القائد توضيحك':'The master is checking your clarification'))}</h2><p>{question?(ar?'لم أُنشئ أو أُكلّف أي وكيل عامل بعد. أحتاج إلى إجابتك أولاً.':'I have not created or assigned any workers. I need your answer first.'):(ar?'توجّه مهمتك وتوضيحاتك توزيع العمل ومراجعة النتيجة.':'Your mission and clarifications guide the assignments and final review.')}</p></div>{!question&&understood&&<CheckCircle2 size={23}/>}</header>
  {(question?.payload.understanding||understood)&&<div className="clarification-understanding"><strong>{ar?'ما أفهمه حتى الآن':'What I understand so far'}</strong><p dir="auto">{question?.payload.understanding??understood?.payload.understanding}</p></div>}
  {question&&<div className="clarification-question"><MessageCircle size={20}/><div><strong>{ar?'سؤالي لك':'My question for you'}</strong><p dir="auto">{question.payload.question??question.payload.summary}</p><small>{ar?'سؤال محفوظ':'Saved question'} · #{question.sequence}</small></div></div>}
  {editable?<form onSubmit={e=>{e.preventDefault();void send();}}><label htmlFor="mission-clarification-answer">{ar?'إجابتك أو توضيحك':'Your answer or clarification'}</label><textarea id="mission-clarification-answer" dir="auto" value={draft} onChange={e=>setDraft(e.target.value)} maxLength={4000} rows={4} disabled={busy} required placeholder={ar?'اذكر التفاصيل المطلوبة لتحديد المهمة بوضوح.':'Give the details needed to make the mission clear.'}/><div className="clarification-submit"><p>{ar?'إرسال الإجابة يجيز طلب AI مدفوعاً آخر لمراجعة المهمة. يبدأ العمال بعد موافقتك على الخطة فقط.':'Sending your answer authorizes another paid AI planning request. Workers start only after you approve the team plan.'}</p><button type="submit" disabled={busy||!draft.trim()}><Send size={15}/>{busy?(ar?'جارٍ الإرسال…':'Sending…'):(ar?'أرسل الإجابة وتابع التخطيط':'Send answer & continue planning')}<ArrowRight size={15}/></button></div>{error&&<p role="alert" className="clarification-error">{error}</p>}</form>:question&&<p className="clarification-readonly">{ar?'هذا السؤال للقراءة فقط هنا. افتح آخر حالة للمهمة للإجابة إن كانت لا تزال بانتظار التوضيح.':'This question is read-only here. Open the latest mission state to answer if clarification is still pending.'}</p>}
  {answers.length>0&&<details className="clarification-history"><summary>{ar?'التوضيحات المحفوظة':'Saved clarifications'} · {answers.length}</summary>{answers.map(e=><article key={e.id}><strong>{ar?'القائد':'Master'}</strong><p dir="auto">{e.payload.question}</p><strong>{ar?'أنت':'You'}</strong><p dir="auto">{e.payload.answer}</p></article>)}</details>}
 </section>;
}
