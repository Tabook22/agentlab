import { createContext,useContext,useEffect,useRef,useState,type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen,CircleHelp,X } from 'lucide-react';
import { useLanguage } from './i18n';
import { helpTopics,type HelpTopic } from './helpContent';
import { planFrom,type LabEvent } from './events';
import './help.css';

type HelpRequest={topic:HelpTopic|'guide';detail?:string};
const HelpContext=createContext<(request:HelpRequest)=>void>(()=>{});
export function HelpButton({topic,detail,label}:{topic:HelpTopic|'guide';detail?:string;label?:string}){
 const open=useContext(HelpContext);const {language}=useLanguage();
 const title=topic==='guide'?(language==='ar'?'دليل المستخدم':'User guide'):language==='ar'?helpTopics[topic].arTitle:helpTopics[topic].title;
 return <button type="button" className={`help-trigger ${label?'help-with-label':''}`} title={title} aria-label={label??`${language==='ar'?'مساعدة':'Help'}: ${title}`} onClick={e=>{e.preventDefault();e.stopPropagation();open({topic,detail});}}><CircleHelp size={15} aria-hidden="true" focusable="false"/>{label&&<span>{label}</span>}</button>;
}
function HelpDialog({request,onClose,onOpen}:{request:HelpRequest;onClose:()=>void;onOpen:(r:HelpRequest)=>void}){
 const ref=useRef<HTMLDialogElement>(null);const {language}=useLanguage();const ar=language==='ar';
 useEffect(()=>{const node=ref.current;node?.showModal();return ()=>node?.close();},[]);
 const item=request.topic==='guide'?null:helpTopics[request.topic];
 return <dialog ref={ref} className="help-dialog" dir={ar?'rtl':'ltr'} aria-label={ar?'مساعدة ودليل المستخدم':'Help and user guide'} onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget)onClose();}}><header><CircleHelp size={24}/><h2>{item?(ar?item.arTitle:item.title):ar?'دليل المستخدم':'User guide'}</h2><button type="button" aria-label={ar?'إغلاق المساعدة':'Close help'} onClick={onClose} autoFocus><X size={20}/></button></header><div className="help-dialog-body">{item?<><p>{ar?item.ar:item.body}</p>{'example' in item&&!ar&&<aside>{item.example}</aside>}{request.detail&&<section className="help-current"><h3>{ar?'في هذا الموضع':'What you are looking at'}</h3><p translate="no" dir="auto">{request.detail}</p></section>}<button className="help-guide-link" onClick={()=>onOpen({topic:'guide'})}><BookOpen size={17}/>{ar?'فتح دليل المستخدم الكامل':'Open the full user guide'}</button></>:<UserGuide/>}</div></dialog>;
}
export function HelpProvider({children}:{children:ReactNode}){
 const [request,setRequest]=useState<HelpRequest|null>(null);
 return <HelpContext.Provider value={setRequest}>{children}{request&&createPortal(<HelpDialog request={request} onClose={()=>setRequest(null)} onOpen={setRequest}/>,document.body)}</HelpContext.Provider>;
}
export function UserGuide({events=[]}:{events?:LabEvent[]}){
 const [query,setQuery]=useState('');const {language}=useLanguage();const ar=language==='ar';
 const plan=planFrom(events);
 const topics=Object.entries(helpTopics).filter(([,item])=>`${item.title} ${item.body} ${item.arTitle} ${item.ar}`.toLowerCase().includes(query.toLowerCase()));
 return <section className="user-guide" aria-label={ar?'دليل استخدام مختبر الوكلاء':'Agent Lab user guide'}><span className="guide-kicker">{ar?'افهم فريقك خطوة بخطوة':'UNDERSTAND YOUR TEAM, STEP BY STEP'}</span><h2>{ar?'أعطِ هدفاً، وتابع العمل، وافهم الإجابة.':'Give a goal. Follow the work. Understand the answer.'}</h2><p>{ar?helpTopics.purpose.ar:helpTopics.purpose.body}</p><ol className="guide-steps">{(ar?['اكتب هدفك أو سجله','راجع خطة الفريق والأسماء والتكلفة','وافق لبدء العمل','افتح الوكلاء والخطوط لمتابعة التقدم','استلم الإجابة بعد اعتماد القائد']:['Write or speak your goal','Review the team, names and estimates','Approve the plan to start work','Inspect agents and click lines to follow progress','Receive the answer after master approval']).map((text,i)=><li key={text}><span>{i+1}</span>{text}</li>)}</ol><p className="guide-help-hint">{ar?'اضغط علامة ؟ بجانب أي عملية لمعرفة معناها وسبب تنفيذها.':'Select a ? help button beside an operation to learn what it means and why it happens.'}</p>{plan&&<section className="guide-team"><h3>{ar?'فريق مهمتك الحالية':'Your current mission team'}</h3><p>{plan.count_reason}</p>{plan.assignments.map(worker=><article key={worker.agent_id}><strong><bdi translate="no" dir="auto">{worker.name}</bdi> · {worker.role}</strong><p>{worker.task}</p><HelpButton topic="worker" detail={`${worker.task}\n${worker.performs??''}`}/></article>)}</section>}<label className="guide-search">{ar?'ابحث في الدليل':'Find a topic'}<input value={query} onChange={e=>setQuery(e.target.value)} placeholder={ar?'مثلاً: دورة أو تكلفة أو مراجعة':'Try cycle, review, packets or cost'}/></label><div className="guide-topics">{topics.map(([key,item])=><article key={key}><h3>{ar?item.arTitle:item.title}</h3><p>{ar?item.ar:item.body}</p>{'example' in item&&!ar&&<small>{item.example}</small>}<HelpButton topic={key as HelpTopic}/></article>)}</div>{!topics.length&&<p>{ar?'لا توجد مواضيع مطابقة. جرب كلمة أخرى.':'No matching topics. Try another word.'}</p>}</section>;
}
