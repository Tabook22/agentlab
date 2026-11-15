import {useEffect,useMemo,useState} from 'react';
import {ArrowDown,ArrowLeft,ArrowRight,BookOpen,ChartColumn,Check,CheckCircle2,ChevronDown,Code2,Database,Download,Expand,FileText,GitBranch,Image,Layers,Pause,Play,ShieldCheck,Target,Timer,TriangleAlert} from 'lucide-react';
import type {LabEvent} from './events';
import {approvedAnswerGraphic,answerGraphicSvg,type GraphicTopic} from './answerGraphic';
import {AnswerText} from './AnswerText';
import {useLanguage} from './i18n';
import './answerInfographic.css';
const topicIcons={goal:Target,data:Database,build:Code2,review:ShieldCheck,launch:ArrowRight,time:Timer,insight:ChartColumn,document:BookOpen};
function TopicDrawing({topic}:{topic:GraphicTopic}){
 const Icon=topicIcons[topic];
 return <span className={`answer-topic-drawing topic-${topic}`} aria-hidden="true"><svg viewBox="0 0 140 90"><path className="topic-orbit" d="M14 45H126M70 8V82"/><rect x="12" y="31" width="25" height="28" rx="5"/><path d="M18 39h13m-13 7h9m-9 7h11"/><path d="M103 31h25v28h-25zM109 39h13m-13 7h9m-9 7h11"/><path d="m42 42 5 3-5 3m51-6 5 3-5 3"/><circle cx="70" cy="45" r="23"/></svg><Icon size={25}/></span>;
}
export function AnswerInfographic({events}:{events:LabEvent[]}){
 const {language}=useLanguage(),ar=language==='ar';
 const model=useMemo(()=>approvedAnswerGraphic(events,ar),[events,ar]);
 const [open,setOpen]=useState(true),[layout,setLayout]=useState<'path'|'map'>('map'),[selected,setSelected]=useState(0),[playing,setPlaying]=useState(false),[expanded,setExpanded]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 useEffect(()=>{if(!playing||!model)return;const timer=window.setTimeout(()=>{if(selected>=model.steps.length-1)setPlaying(false);else setSelected(selected+1);},4000);return()=>window.clearTimeout(timer);},[playing,selected,model]);
 if(!model)return null;
 const selectedIndex=Math.min(selected,model.steps.length-1),step=model.steps[selectedIndex],Icon=topicIcons[step.topic];
 const visible=expanded?model.steps:model.steps.slice(0,6);
 const choose=(i:number)=>{setSelected(i);setPlaying(false);};
 const save=(blob:Blob,extension:string)=>{const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`answer-infographic-${model.sequence}.${extension}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);};
 async function download(png=false){
  setBusy(true);setNotice('');
  try{
   const drawing=answerGraphicSvg(model!,ar),blob=new Blob([drawing.svg],{type:'image/svg+xml;charset=utf-8'});
   if(!png)save(blob,'svg');else{
    const url=URL.createObjectURL(blob);
    try{
     const image=new window.Image();image.src=url;await image.decode();
     const scale=Math.min(2,12000/drawing.height,Math.sqrt(16_000_000/(drawing.width*drawing.height))),canvas=document.createElement('canvas');canvas.width=Math.round(drawing.width*scale);canvas.height=Math.round(drawing.height*scale);
     const context=canvas.getContext('2d');if(!context)throw Error('Canvas unavailable');context.drawImage(image,0,0,canvas.width,canvas.height);
     const pngBlob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('PNG unavailable')),'image/png'));save(pngBlob,'png');
    }finally{URL.revokeObjectURL(url);}
   }
   setNotice(ar?'تم تنزيل الرسم، مع جميع الأقسام والقيود والمصادر المرفقة.':'Downloaded the infographic with all sections, limitations and attached sources.');
  }catch{setNotice(ar?'تعذر تجهيز الصورة. جرّب تنزيل SVG أو فتح الإجابة الأصلية.':'Could not prepare the image. Try SVG or read the original answer.');}finally{setBusy(false);}
 }
 return <section className="answer-infographic" aria-label={ar?'الرسم التوضيحي للإجابة':'Answer infographic'}>
  <header className="answer-graphic-heading"><div className="answer-graphic-symbol"><GitBranch size={27}/></div><div><span>{ar?'اقرأها. شاهدها. افهمها.':'READ IT. SEE IT. UNDERSTAND IT.'}</span><h3>{ar?'إجابتك، خطوة بخطوة في صورة':'Your answer, illustrated step by step'}</h3><p>{ar?'خريطة بصرية لمحتوى الإجابة المعتمدة. اختر جزءاً لقراءة شرحه الكامل.':'A visual companion to the approved answer. Choose a part to read its full explanation.'}</p></div><button type="button" aria-expanded={open} onClick={()=>{setOpen(!open);setPlaying(false);}}><ChevronDown size={18}/>{open?(ar?'طيّ الرسم':'Collapse visual'):(ar?'اعرض الرسم':'Show infographic')}</button></header>
  {open&&<>
   <div className="answer-graphic-toolbar"><div className="answer-graphic-layout" aria-label={ar?'طريقة عرض الرسم':'Infographic layout'}><button type="button" aria-pressed={layout==='path'} onClick={()=>setLayout('path')}><Layers size={15}/>{ar?'مسار القراءة':'Reading path'}</button><button type="button" aria-pressed={layout==='map'} onClick={()=>setLayout('map')}><GitBranch size={15}/>{ar?'خريطة الأفكار':'Overview map'}</button></div><div><button type="button" disabled={busy} onClick={()=>void download()}><Download size={15}/>SVG</button><button type="button" disabled={busy} onClick={()=>void download(true)}><Image size={15}/>{ar?'صورة PNG':'PNG image'}</button></div></div>
   <div className="answer-graphic-poster">
    <div className="answer-graphic-title"><span><ShieldCheck size={15}/>{ar?'من الإجابة المعتمدة':'FROM THE APPROVED ANSWER'} · #{model.sequence}</span>{model.simulation&&<small>{ar?'محاكاة تعليمية':'CLASSROOM SIMULATION'}</small>}<h4 dir="auto">{model.title}</h4>{model.goal&&<p dir="auto"><strong>{ar?'السؤال الأصلي: ':'Original question: '}</strong>{model.goal}</p>}</div>
    {model.metrics.length>0&&<div className="answer-graphic-metrics">{model.metrics.map((m,i)=><div key={i}><strong dir="auto">{m.value}</strong><span>{m.label}</span></div>)}</div>}
    <div className="answer-graphic-legend"><span><span/> {ar?'الأرقام تتبع ترتيب الإجابة؛ الأسهم لا تعني تنفيذ المقترحات فعلياً.':'Numbers follow the answer’s order; arrows do not mean proposed actions were performed.'}</span><small>{model.steps.length} {ar?'أجزاء في الإجابة':'answer parts'}</small></div>
    {layout==='map'&&<div className="answer-graphic-hub"><BookOpen size={21}/><strong>{ar?'الفكرة الكاملة':'The complete answer'}</strong><span>{ar?'أجزاء مترابطة للقراءة والاستكشاف':'Connected parts to read and explore'}</span><ArrowDown size={20}/></div>}
    <ol className={`answer-graphic-nodes answer-graphic-${layout}`} aria-label={ar?'أجزاء الإجابة المصورة':'Illustrated answer parts'}>{visible.map((part,i)=>{const Symbol=topicIcons[part.topic];return <li key={part.id} className={`${i===selectedIndex?'graphic-node-selected':''} graphic-node-${part.topic}`}><button type="button" aria-pressed={i===selectedIndex} onClick={()=>choose(i)}><span className="graphic-step-number">{String(i+1).padStart(2,'0')}</span><TopicDrawing topic={part.topic}/><div className="graphic-step-copy"><span><Symbol size={14}/>{ar?`الجزء ${i+1}`:`Part ${i+1}`}</span><h5 dir="auto">{part.title}</h5><p dir="auto">{part.excerpt}</p><small>{ar?'افتح الشرح الكامل':'Explore the full explanation'}<ArrowRight size={13}/></small></div></button>{i<visible.length-1&&layout==='path'&&<span className="graphic-step-connector" aria-hidden="true"><ArrowDown size={18}/></span>}</li>;})}</ol>
    {model.steps.length>6&&<button type="button" className="graphic-show-all" onClick={()=>setExpanded(!expanded)}><Expand size={15}/>{expanded?(ar?'اعرض أول ستة أجزاء':'Show first six parts'):(ar?`اعرض جميع الأجزاء (${model.steps.length})`:`Show all ${model.steps.length} parts`)}</button>}
    <div className="answer-graphic-read"><CheckCircle2 size={23}/><div><strong>{ar?'ارجع إلى الإجابة الكاملة لتطبيق التفاصيل':'Use the complete answer for the full details'}</strong><p>{ar?'البطاقات تعرض مقتطفات قصيرة. الشرح أدناه والنص الأصلي يحتفظان بالتفاصيل والسياق.':'Cards show short excerpts. The explanation below and the original answer retain the details and context.'}</p></div><a href="#answer-original-text">{ar?'اقرأ الأصل':'Read original'}<ArrowRight size={16}/></a></div>
   </div>
   <section className="answer-graphic-inspector" aria-label={ar?'شرح الجزء المختار':'Selected answer explanation'}><header><span><Icon size={21}/>{ar?`الجزء ${selectedIndex+1} من ${model.steps.length}`:`Part ${selectedIndex+1} of ${model.steps.length}`}</span><div><button type="button" disabled={selectedIndex===0} aria-label={ar?'الجزء السابق':'Previous answer part'} onClick={()=>choose(selectedIndex-1)}><ArrowLeft size={16}/></button><button type="button" onClick={()=>{if(playing){setPlaying(false);return;}if(selectedIndex===model.steps.length-1)setSelected(0);setExpanded(true);setPlaying(true);}}>{playing?<Pause size={15}/>:<Play size={15}/>} {playing?(ar?'أوقف الجولة':'Pause guide'):(ar?'جولة إرشادية':'Guided walkthrough')}</button><button type="button" disabled={selectedIndex===model.steps.length-1} aria-label={ar?'الجزء التالي':'Next answer part'} onClick={()=>{setExpanded(true);choose(selectedIndex+1);}}><ArrowRight size={16}/></button></div></header><h4 dir="auto">{step.title}</h4><AnswerText key={step.id} content={step.content} excerpt/><small>{ar?'هذا الجزء مبني على الإجابة المعتمدة. الملخصات الرقمية محسوبة محلياً من قيمها.':'This part is built from the approved answer. Numerical summaries are calculated locally from its values.'}</small></section>
   {model.limitations.length>0&&<aside className="answer-graphic-cautions"><h4><TriangleAlert size={18}/>{ar?'قيود وتفاصيل يجب تذكرها':'Limitations to keep in view'}</h4><ul>{model.limitations.map((v,i)=><li dir="auto" key={i}>{v}</li>)}</ul></aside>}
   {model.sources.length>0&&<details className="answer-graphic-sources"><summary><FileText size={16}/>{ar?'المصادر المرفقة بالإجابة':'Sources attached to the answer'} ({model.sources.length})</summary><ul>{model.sources.map((s,i)=><li key={i}><a href={s.url} target="_blank" rel="noopener noreferrer" dir="auto">{s.title}</a></li>)}</ul></details>}
   <p className="answer-graphic-disclosure">{ar?'الرسم مستخرج محلياً من النص المعتمد دون طلب AI إضافي. اعتماد الإجابة لا يعني تحققاً مستقلاً من كل معلومة.':'The infographic is extracted locally from the approved answer with no extra AI request. Approval does not mean every claim was independently verified.'}</p>
   {notice&&<p className="answer-graphic-notice" role="status"><Check size={16}/>{notice}</p>}
  </>}
 </section>;
}
