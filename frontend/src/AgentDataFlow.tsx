import {useState} from 'react';
import {ArrowDown,ArrowRight,Database,GitBranch,RotateCcw,Send,Settings2} from 'lucide-react';
import type {LabEvent} from './events';
import {dataFlow,flowPayload} from './dataFlow';
import {DataPreview} from './WorkView';
import {Robot} from './Robot';
import {useLanguage} from './i18n';
import './dataFlow.css';

function PayloadPeek({event}:{event:LabEvent}) {
 const p=flowPayload(event);
 const values=p.scores??p.temperatures;
 if(Array.isArray(values))return <div className="flow-value-chips">{values.slice(0,12).map((v,i)=><span key={i}>{String(v)}</span>)}{values.length>12&&<span>+{values.length-12}</span>}</div>;
 const value=p.mean??p.result??p.content??p.assigned_task??p.mission??p.feedback??p.public_plan?.[0]??p.prompt;
 return typeof value==='string'||typeof value==='number'?<blockquote className="flow-peek" dir="auto">{String(value).slice(0,180)}{String(value).length>180?'…':''}</blockquote>:null;
}

export function AgentDataFlow({events,onInspect}:{events:LabEvent[];onInspect?:(id:string)=>void}) {
 const {language}=useLanguage(),ar=language==='ar';
 const [selected,setSelected]=useState<string|null>(null);
 const {rows,transfers}=dataFlow(events);
 const names=new Map([...rows.map(r=>[r.agent_id,r.name] as const),['result',ar?'النتيجة النهائية':'Final answer']]);
 const name=(id:string)=>id==='master'?(ar?'الوكيل القائد':'Master Agent'):names.get(id)??id;
 const exchange=transfers.find(t=>t.id===selected)??transfers.at(-1);
 const latest=events.at(-1);
 const stage=(event:LabEvent|undefined,empty:string)=>event?<><p dir="auto">{event.payload.summary??event.payload.prompt??event.payload.action??event.type}</p><PayloadPeek event={event}/><details><summary>{ar?'افتح البيانات':'Open data'} · #{event.sequence}</summary><DataPreview data={flowPayload(event)}/></details></>:<p className="flow-waiting">{empty}</p>;
 return <section className="agent-data-flow" aria-label={ar?'تدفق البيانات بين الوكلاء':'Agent data flow'}>
  <header className="flow-heading"><div><span><GitBranch size={16}/>{ar?'اتبع البيانات':'FOLLOW THE DATA'}</span><h3>{ar?'كل وكيل: مدخلات ← معالجة ← مخرجات':'Every agent: input → processing → output'}</h3><p>{ar?'مخرجات وكيل تصبح مدخلات لآخر. الملاحظات تعود لبدء محاولة جديدة.':'One agent’s output becomes another agent’s input. Feedback travels back for another attempt.'}</p></div><small>{ar?'حتى السجل':'Through record'} #{latest?.sequence??0}</small></header>
  <div className="flow-legend"><span className="flow-input"><Database size={14}/>{ar?'١ · ماذا استلم؟':'1 · What came in?'}</span><ArrowRight size={14}/><span className="flow-process"><Settings2 size={14}/>{ar?'٢ · ماذا فعل؟':'2 · What did it do?'}</span><ArrowRight size={14}/><span className="flow-output"><Send size={14}/>{ar?'٣ · ماذا أرسل؟':'3 · What went out?'}</span><span><RotateCcw size={14}/>{ar?'عودة للمراجعة':'Return for revision'}</span></div>
  <div className="flow-exchanges"><h4><ArrowDown size={17}/>{ar?'انتقال البيانات · ترتيب مسجل':'Data transfers · recorded order'}</h4><p>{ar?'اختر انتقالاً لتمييز المرسل والمستلم وقراءة البيانات الفعلية.':'Select a transfer to highlight its sender and receiver and read the actual payload.'}</p><div className="flow-transfer-strip" role="group" aria-label={ar?'انتقالات مسجلة':'Recorded transfers'}>{transfers.map(t=><button key={t.id} type="button" className={t.revision?'flow-revision':''} aria-pressed={exchange?.id===t.id} onClick={()=>setSelected(t.id)}><small>#{t.sequence} · {t.label}</small><span><bdi>{name(t.source)}</bdi>{t.revision?<RotateCcw size={15}/>:<ArrowRight size={15}/>}<bdi>{name(t.target)}</bdi></span></button>)}</div>{exchange?<div className="flow-payload"><strong>{name(exchange.source)} → {name(exchange.target)} · #{exchange.sequence}</strong><p dir="auto">{exchange.event.payload.summary??exchange.label}</p><details key={exchange.id}><summary>{ar?'اقرأ البيانات المنقولة':'Read transferred data'}</summary><DataPreview data={exchange.data}/></details></div>:<p className="flow-waiting">{ar?'لم يحدث انتقال مسجل بعد.':'No recorded transfers yet.'}</p>}</div>
  <div className="flow-agent-list">{rows.map(row=>{
   const involved=exchange&&(exchange.source===row.agent_id||exchange.target===row.agent_id);
   return <article key={row.agent_id} className={`flow-agent ${row.agent_id==='master'?'flow-master':''} ${involved?'flow-involved':''}`}>
    <header><Robot small leader={row.agent_id==='master'} identity={row.agent_id} role={row.role}/><div><strong dir="auto">{name(row.agent_id)}</strong><small dir="auto">{row.role}{row.cycle?` · ${ar?'محاولة':'Attempt'} ${row.cycle}`:''}</small></div>{onInspect&&<button type="button" onClick={()=>onInspect(row.agent_id)}>{ar?'استكشف':'Inspect'}</button>}</header>
    <div className="flow-stages"><section className={`flow-input ${row.input?'flow-recorded':''}`}><h4><Database size={15}/>{ar?'المدخلات':'Input'}</h4>{row.inputSources.length>0&&<small>{ar?'من':'From'} {row.inputSources.map(name).join(', ')}</small>}{stage(row.input,ar?'بانتظار مدخلات مسجلة':'Waiting for recorded input')}</section><ArrowRight className="flow-stage-arrow" size={18}/><section className={`flow-process ${row.process.length?'flow-recorded':''}`}><h4><Settings2 size={15}/>{ar?'المعالجة':'Processing'}</h4>{stage(row.process.at(-1),ar?'لم تُسجل معالجة بعد':'No processing recorded yet')}{row.process.length>1&&<details><summary>{ar?'كل خطوات هذه المحاولة':'All steps in this attempt'} ({row.process.length})</summary><ol>{row.process.map(e=><li key={e.id}><small>#{e.sequence} · {e.type}</small><p dir="auto">{e.payload.summary??e.payload.action}</p><details><summary>{ar?'البيانات':'Data'}</summary><DataPreview data={flowPayload(e)}/></details></li>)}</ol></details>}</section><ArrowRight className="flow-stage-arrow" size={18}/><section className={`flow-output ${row.output?'flow-recorded':''}`}><h4><Send size={15}/>{ar?'المخرجات':'Output'}</h4>{row.agent_id!=='master'&&row.output&&<small className={row.accepted?'flow-accepted':'flow-draft'}>{row.accepted?(ar?'مقبول من القائد':'Accepted by master'):(ar?'مسودة · لم تُقبل بعد':'Draft · acceptance pending')}</small>}{stage(row.output,ar?'لم تُسجل مخرجات بعد':'No output recorded yet')}{row.outgoing.length>0&&<small>{ar?'أُرسل إلى':'Sent to'} {Array.from(new Set(row.outgoing.map(t=>name(t.target)))).join(', ')}</small>}</section></div>
    {exchange&&involved&&<div className={`flow-route ${exchange.revision?'flow-revision':''}`}><span>#{exchange.sequence}</span><strong dir="auto">{name(exchange.source)}</strong>{exchange.revision?<RotateCcw size={16}/>:<ArrowRight size={16}/>}<strong dir="auto">{name(exchange.target)}</strong><span>{exchange.label}</span></div>}
   </article>;
  })}</div>
  <p className="flow-note">{ar?'الأسهم تمثل انتقالات مسجلة، وليس تسلسل السلطة. المعالجة تعرض خططاً عامة وأدوات وفحوصاً مسجلة. استخدم إعادة العرض أعلاه لمتابعة الخطوات.':'Arrows show recorded transfers, not an agent hierarchy. Processing shows public plans, tool actions and checks. Use Replay key moments above to follow the steps.'}</p>
 </section>;
}
