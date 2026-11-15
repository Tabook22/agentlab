import {useEffect,useState} from 'react';
import {BookOpen,Check,Compass,ExternalLink,FileSearch,Globe,GraduationCap,Headphones,LoaderCircle,Play,RefreshCw,Search,Square,Video,Wrench} from 'lucide-react';
import type {LabEvent} from './events';
import {apiBase} from './apiBase';
import {useLanguage} from './i18n';
import {recordedResources,resourceKinds,safeResources,type ResourceKind,type ResourceState} from './resourceGuide';
import './relatedResources.css';
const icons={video:Video,paper:FileSearch,book:BookOpen,article:Globe,podcast:Headphones,tool:Wrench,course:GraduationCap};
type Props={missionId:string;events:LabEvent[];historical?:boolean;live:boolean;available:boolean;onResourceChange?:(version:string)=>void};
export function RelatedResources({missionId,events,historical=false,live,available,onResourceChange}:Props){
 const {language}=useLanguage(),ar=language==='ar';
 const [data,setData]=useState<ResourceState>(()=>recordedResources(events)),[filter,setFilter]=useState('all'),[error,setError]=useState(''),[busy,setBusy]=useState(false),[viewed,setViewed]=useState<string[]>([]),[reload,setReload]=useState(0);
 const delivered=events.findLast(e=>e.type==='mission.completed');
 const approved=!!delivered&&events.some(e=>e.type==='master.final_approved'&&e.sequence<delivered.sequence);
 useEffect(()=>{
  if(historical){setData(recordedResources(events));return;}
  if(!approved)return;
  let alive=true,timer:ReturnType<typeof setTimeout>;
  async function read(){try{
   const response=await fetch(`${apiBase}/missions/${missionId}/answer/resources`);const body=await response.json();if(!response.ok)throw Error(body.detail||'Could not load learning resources.');
   if(!alive)return;setData(safeResources(body));setError('');if(body.status==='searching')timer=setTimeout(()=>void read(),2000);
  }catch(cause){if(alive)setError(cause instanceof Error?cause.message:'Could not load learning resources.');}}
  void read();return()=>{alive=false;clearTimeout(timer);};
 },[missionId,historical,approved,reload,historical?events:null]);
 useEffect(()=>{if(!historical)onResourceChange?.(`${missionId}:${data.status}:${data.checked_at??''}`);},[missionId,historical,data.status,data.checked_at,onResourceChange]);
 if(!approved)return null;
 async function act(stop=false){setBusy(true);setError('');try{
  const response=await fetch(`${apiBase}/missions/${missionId}/answer/resources/${stop?'stop':'search'}`,{method:'POST'});const body=await response.json();if(!response.ok)throw Error(body.detail||'Could not start resource discovery.');
  setData(old=>({...old,status:stop?'interrupted':'searching'}));setReload(value=>value+1);
 }catch(cause){setError(cause instanceof Error?cause.message:'Resource request failed.');}finally{setBusy(false);}}
 const starts=(data.start_here_urls??[]).flatMap(url=>{const item=data.items.find(i=>i.url===url);return item?[item]:[];});
 const items=data.items.filter(item=>filter==='all'||item.kind===filter),searching=data.status==='searching';
 const labels:Record<string,string>=ar?{beginner:'مبتدئ',intermediate:'متوسط',advanced:'متقدم',all:'كل المستويات',free:'مجاني حسب نتائج البحث',paid:'مدفوع حسب نتائج البحث',mixed:'وصول مختلط',unknown:'الوصول غير مؤكد'}:{beginner:'Beginner',intermediate:'Intermediate',advanced:'Advanced',all:'All levels',free:'Free per search evidence',paid:'Paid per search evidence',mixed:'Mixed access',unknown:'Access not confirmed'};
 return <section className="related-resources" aria-label={ar?'موارد للتعلم والتطبيق':'Resources for learning and application'}>
  <header className="resources-heading"><span className="resources-compass"><Compass size={27}/></span><div><span>{ar?'حوّل الإجابة إلى رحلة تعلم':'TAKE THE ANSWER FURTHER'}</span><h3>{ar?'تعلّم أكثر وطبّق ما فهمته':'Learn more and put it into practice'}</h3><p>{ar?'موارد مرتبطة بإجابتك، مع سبب اختيارها وكيف تستفيد منها.':'Resources connected to your answer, with a reason to explore each one and a practical way to use it.'}</p></div>{data.checked_at&&<small>{ar?'تاريخ البحث':'Searched'}: {new Date(data.checked_at).toLocaleDateString(ar?'ar-OM':'en-GB')}</small>}</header>
  <div className="resources-actions"><span><Globe size={15}/>{ar?'اكتشاف عبر البحث على الويب':'Discovered through web search'}</span>{!historical&&live&&<button type="button" disabled={busy||(!available&&!searching)} onClick={()=>void act(searching)}>{searching?<Square size={14}/>:<Search size={14}/>} {searching?(ar?'أوقف البحث':'Stop search'):data.items.length?(ar?'ابحث من جديد':'Search again'):(ar?'ابحث عن موارد مرتبطة':'Find related resources')}</button>}</div>
  {historical&&<p className="resources-status">{ar?'عرض الموارد المسجلة حتى هذه الخطوة فقط. لا يُجرى بحث جديد أثناء إعادة العرض.':'Showing only resources recorded by this step. Replay never starts a new search.'}</p>}
  {searching&&<div className="resources-progress" role="status"><LoaderCircle size={23}/><div><strong>{ar?'نبحث عن شروح وأبحاث وأدوات مفيدة…':'Finding useful explanations, research, and tools…'}</strong><p>{ar?'إجابتك المعتمدة جاهزة للقراءة. ستظهر الموارد هنا عند انتهاء البحث.':'Your approved answer is ready to read. Resources will appear here when the search finishes.'}</p></div></div>}
  {searching&&<ol className="resources-phases">{[['topics',ar?'حدد الموضوعات':'Choose topics'],['explanations',ar?'ابحث عن شروح':'Find explanations'],['research',ar?'ابحث عن أبحاث':'Find research'],['curation',ar?'نظّم الموارد':'Curate resources']].map(([phase,label])=><li key={phase} className={data.phase===phase?'resources-phase-current':''}>{label}</li>)}</ol>}
  {data.introduction&&<p className="resources-introduction" dir="auto">{data.introduction}</p>}
  {starts.length>0&&<section className="resources-start" aria-label={ar?'من أين أبدأ؟':'Where should I start?'}><h4><Play size={17}/>{ar?'ابدأ من هنا':'Start here'}</h4><p>{ar?'مسار مقترح للانتقال من الفهم إلى التطبيق.':'A suggested route from understanding to practical use.'}</p><ol>{starts.map((item,index)=><li key={item.url}><a href={item.url} target="_blank" rel="noopener noreferrer"><span>{index+1}</span><strong dir="auto">{item.title}</strong><ExternalLink size={14}/></a><p dir="auto">{item.how_to_use}</p></li>)}</ol></section>}
  {data.items.length>0&&<><div className="resources-filters" aria-label={ar?'نوع المورد':'Resource type'}><button type="button" aria-pressed={filter==='all'} onClick={()=>setFilter('all')}>{ar?'الكل':'All'} ({data.items.length})</button>{(Object.keys(resourceKinds) as ResourceKind[]).filter(kind=>data.items.some(item=>item.kind===kind)).map(kind=>{const Icon=icons[kind];return <button type="button" key={kind} aria-pressed={filter===kind} onClick={()=>setFilter(kind)}><Icon size={14}/>{ar?resourceKinds[kind].ar:resourceKinds[kind].en} ({data.items.filter(i=>i.kind===kind).length})</button>;})}</div>
  <div className="resources-grid">{items.map(item=>{const Icon=icons[item.kind],done=viewed.includes(item.url);return <article key={item.url}><header><Icon size={23}/><span>{ar?resourceKinds[item.kind].ar:resourceKinds[item.kind].en}</span>{done&&<Check size={17}/>}</header><h4 dir="auto"><a href={item.url} target="_blank" rel="noopener noreferrer">{item.title}<ExternalLink size={14}/></a></h4><div className="resources-metadata"><span>{labels[item.level]??item.level}</span><span>{labels[item.access]??item.access}</span>{item.creator&&<span dir="auto">{item.creator}</span>}{item.year&&<span>{item.year}</span>}</div><dl><dt>{ar?'لماذا يرتبط بإجابتك؟':'Why it helps'}</dt><dd dir="auto">{item.why}</dd><dt>{ar?'كيف تستخدمه؟':'How to use it'}</dt><dd dir="auto">{item.how_to_use}</dd></dl><footer><small dir="ltr">{new URL(item.url).hostname}</small><button type="button" aria-pressed={done} onClick={()=>setViewed(old=>done?old.filter(url=>url!==item.url):[...old,item.url])}><Check size={14}/>{done?(ar?'استكشفته':'Explored'):(ar?'علّمه كمستكشف':'Mark explored')}</button></footer></article>;})}</div></>}
  {!searching&&!data.items.length&&<div className="resources-empty"><BookOpen size={25}/><p>{ar?data.status==='empty'?'لم يُعثر على موارد مناسبة مدعومة بنتائج البحث. لم تُختلق روابط.':live?'لم تُجهّز موارد مرتبطة لهذه الإجابة بعد.':'المحاكاة لا تبحث في الإنترنت. استخدم مهمة مباشرة للحصول على موارد بحثية مرتبطة.':data.message||(!live?'Simulation does not search the internet. Use a live mission for related web resources.':'No related resources have been prepared for this answer yet.')}</p></div>}
  {!searching&&!['ready','not_searched','empty'].includes(data.status)&&data.message&&<p className="resources-status" dir="auto">{data.message}</p>}
  {data.missing_types&&data.missing_types.length>0&&<p className="resources-missing">{ar?'لم يُعثر على موارد مناسبة في الفئات التالية: ':'No suitable grounded match was found for: '}{data.missing_types.map(kind=>ar?resourceKinds[kind]?.ar:resourceKinds[kind]?.en).join(' · ')}</p>}
  {!!data.limitations?.length&&<details><summary>{ar?'حدود هذا البحث':'Search limitations'}</summary><ul>{data.limitations.map((item,i)=><li dir="auto" key={i}>{item}</li>)}</ul></details>}
  {error&&<p role="alert" className="resources-error">{error}<button type="button" onClick={()=>setReload(value=>value+1)}><RefreshCw size={14}/>{ar?'أعد تحميل الحالة':'Reload status'}</button></p>}
  {!historical&&live&&!available&&<p className="resources-status">{ar?'البحث المباشر يحتاج مفتاح API معداً على الخادم. تبقى الإجابة والموارد المحفوظة متاحة.':'Live discovery needs a configured backend API key. The answer and any saved resources remain available.'}</p>}
  <p className="resources-disclosure">{ar?'الموارد توصيات إضافية منتقاة من نتائج البحث، وليست جزءاً من اعتماد الإجابة أو تدقيقاً مستقلاً. تحقق من الملاءمة والمصداقية والوصول قبل الاستخدام. فتح الروابط خارجي؛ علامة «استكشفته» محلية لهذه الجلسة. البحث الجديد يستخدم API ويُحتسب ضمن مخصص المهمة الحالي، ولا يرفع حد الإنفاق تلقائياً.':'These are additional search-grounded recommendations, separate from answer approval and independent fact checking. Check relevance, credibility and access before use. Links open externally; explored marks last for this session. New searches use the API and the mission’s existing allowance; they never raise its spending limit automatically.'}</p>
 </section>;
}
