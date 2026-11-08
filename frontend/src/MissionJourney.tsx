import {ArrowRight,BookOpen,Check,ChevronDown,FileCheck2,GitBranch,MessageCircle,Pause,Play,Radio,Settings2,Sparkles,Target,Users,Workflow} from 'lucide-react';
import {HelpButton} from './Help';
import {useLanguage} from './i18n';
import {Robot} from './Robot';
import type {LabEvent} from './events';
import './journey.css';
export type JourneyView='goal'|'plan'|'theater'|'answer';
export function suggestedJourneyView(status:string,hasAnswer:boolean):JourneyView{return status==='AWAITING_APPROVAL'?'plan':status==='COMPLETED'&&hasAnswer?'answer':'theater';}
export function MissionJourney({exists,status,view,events,replay,onNavigate,onDiscuss,onPause,onCancel,onAdvanced}:{exists:boolean;status:string;view:string;events:LabEvent[];replay:boolean;onNavigate:(view:JourneyView)=>void;onDiscuss:()=>void;onPause:()=>void;onCancel:()=>void;onAdvanced:(view:string)=>void}){
 const {language}=useLanguage(),ar=language==='ar';
 const hasPlan=events.some(e=>e.type==='mission.plan_ready'),hasAnswer=events.some(e=>e.type==='mission.completed');
 const usage=events.findLast(e=>e.payload.usage)?.payload.usage;
 const current=status==='AWAITING_CLARIFICATION'?0:view==='goal'?0:view==='plan'?1:view==='answer'?3:2;
 const canPause=exists&&!replay&&!['AWAITING_APPROVAL','AWAITING_LIMIT_APPROVAL','AWAITING_CLARIFICATION','COMPLETED','FAILED','CANCELLED'].includes(status);
 const canCancel=exists&&!replay&&!['COMPLETED','FAILED','CANCELLED'].includes(status);
 const stages=[{id:'goal',icon:Target,label:ar?'الهدف':'Goal',hint:ar?'اكتب أو تحدّث':'Write or speak',enabled:true},{id:'plan',icon:GitBranch,label:ar?'الخطة':'Plan',hint:ar?'راجع وناقش':'Review & discuss',enabled:hasPlan},{id:'theater',icon:Users,label:ar?'الفريق':'Team',hint:ar?'شاهد التعاون':'See the teamwork',enabled:exists},{id:'answer',icon:FileCheck2,label:ar?'الإجابة':'Answer',hint:ar?'اقرأ وتعلّم':'Read & learn',enabled:hasAnswer}];
 const next=journeyNextAction(status,hasPlan,hasAnswer,replay);
 const titles:Record<string,[string,string]>={
  clarify:[ar?'لنجعل المهمة أوضح.':'A clear mission starts with understanding.',ar?'أجب عن سؤال القائد قبل تقسيم المهمة وتكليف العمال.':'Answer the master’s question before it divides the work or assigns agents.'],
  plan:[ar?'فريقك جاهز للمناقشة.':'A clear plan. Your decision.',ar?'راجع الأدوار والتكلفة. اسأل القائد قبل أن توافق.':'Explore the roles and cost. Ask the master before approving.'],
  answer:[ar?'إجابتك جاهزة للاستكشاف.':'The work is ready to explore.',ar?'افتح الإجابة ومصادرها، أو شاهد كيف تعاون الفريق.':'Open the answer and its sources, or explore how the team worked.'],
  resume:[ar?'كل عملك محفوظ.':'Your progress is safe.',ar?'استأنف عندما تكون مستعداً، أو ناقش القائد أولاً.':'Resume when you are ready, or discuss the work with the master.'],
  attention:[ar?'لنراجع الخطوة التالية.':'Let’s find the next step.',ar?'راجع ما حدث والتعليمات المتاحة للمتابعة.':'Inspect what happened and the available recovery options.'],
  team:[ar?'شاهد فريقك في العمل.':'Follow the idea as it takes shape.',ar?'انقر على وكيل لاستكشاف عمله، أو خط لقراءة الرسائل.':'Select an agent to see its work. Select a line to read the exchange.'],
  discuss:[ar?'القائد يحضّر خطتك.':'Your mission is taking shape.',ar?'سيشرح القائد الفريق المقترح قبل بدء التنفيذ.':'The master will explain the proposed team before execution begins.'],
  replay:[ar?'استكشف كيف تعاون الفريق.':'See how the team worked.',ar?'هذا عرض لسجل محفوظ. لا يبدأ عملاً جديداً.':'Explore saved events. This does not start new work.']
 };
 const title=exists?titles[next]:[ar?'فكرة منك. فريق يعمل معك.':'Your idea. A team to bring it to life.',ar?'اكتب هدفك أو سجّله. سيوضح القائد الخطة قبل أن توافق.':'Write or speak your goal. The master explains the plan before you approve.'];
 const actionLabel=({clarify:ar?'أجب عن سؤال القائد':'Answer the master',plan:ar?'مراجعة الخطة':'Review the plan',answer:ar?'افتح الإجابة':'Explore the answer',resume:ar?'استئناف المهمة':'Resume mission',attention:ar?'مراجعة ما حدث':'Review what happened',team:ar?'شاهد تعاون الفريق':'Watch the teamwork',discuss:ar?'اسأل القائد':'Ask the master',replay:ar?'استكشف السجل':'Explore the recording'})[next];
 function nextAction(){if(next==='clarify'){document.getElementById('mission-clarification')?.scrollIntoView({behavior:'smooth',block:'start'});document.getElementById('mission-clarification-answer')?.focus({preventScroll:true});}else if(next==='resume')onPause();else if(next==='discuss')onDiscuss();else if(next==='attention')onAdvanced('board');else onNavigate(next==='plan'?'plan':next==='answer'?'answer':'theater');}
 return <section id="mission-navigation" className={`mission-journey ${exists?'has-mission':'is-welcome'}`} aria-label={ar?'مسار المهمة':'Mission navigation'}>
  <div className="journey-intro"><div><span className="journey-kicker"><Sparkles size={13}/>{ar?'من الفكرة إلى الفهم':'FROM CURIOSITY TO CLARITY'}</span><h1>{title[0]}</h1><p>{title[1]}</p>{exists&&<button type="button" className="journey-next-action" onClick={nextAction}>{actionLabel}<ArrowRight size={16}/></button>}</div><div className="journey-team-illustration" aria-hidden="true"><span className="illustration-route route-left"/><span className="illustration-route route-right"/><span className="illustration-packet packet-left"/><span className="illustration-packet packet-right"/><div className="illustration-master"><Robot leader color="purple" small/><span>{ar?'القائد':'Master'}</span></div><div className="illustration-worker worker-left"><Robot color="blue" small/></div><div className="illustration-worker worker-right"><Robot color="green" small/></div><span className="illustration-seal"><Check size={13}/>{ar?'يراجع ثم يعتمد':'Reviews & approves'}</span></div></div>
  {exists&&events.find(e=>e.type==='mission.created')?.payload.prompt&&<details className="journey-goal"><summary><Target size={14}/><span dir="auto">{events.find(e=>e.type==='mission.created')?.payload.prompt}</span><ChevronDown size={13}/></summary><p dir="auto">{events.find(e=>e.type==='mission.created')?.payload.prompt}</p></details>}
  <nav className="journey-shortcuts" aria-label={ar?'روابط مباشرة للمهمة':'Mission shortcuts'}>{stages.map((stage,i)=><button type="button" key={stage.id} disabled={!stage.enabled} aria-current={exists&&i===current?'page':undefined} className={`journey-step step-${i} ${exists&&i===current?'is-selected':''}`} onClick={()=>onNavigate(stage.id as JourneyView)}><span className="journey-step-icon"><stage.icon size={21} aria-hidden="true"/></span><span><strong>{stage.label}</strong><small>{stage.hint}</small></span>{i<3&&<ArrowRight className="journey-step-arrow" size={15}/>}</button>)}</nav>
  {exists&&<div className="journey-tools"><span className={`journey-status ${status==='FAILED'?'needs-attention':''}`}><i/>{(ar?({'RUNNING':'الفريق يعمل','PAUSED':'المهمة متوقفة مؤقتاً','AWAITING_CLARIFICATION':'القائد بانتظار توضيحك','AWAITING_APPROVAL':'الخطة بانتظار موافقتك','AWAITING_LIMIT_APPROVAL':'العمل محفوظ — يحتاج مراجعتك','COMPLETED':'الإجابة جاهزة','FAILED':'المهمة تحتاج مراجعتك','CANCELLED':'المهمة ملغاة'} as Record<string,string>)[status]:({'RUNNING':'Team at work','PAUSED':'Mission paused','AWAITING_CLARIFICATION':'Master awaiting your clarification','AWAITING_APPROVAL':'Plan ready for your approval','AWAITING_LIMIT_APPROVAL':'Saved work needs your attention','COMPLETED':'Answer ready','FAILED':'Needs your attention','CANCELLED':'Mission cancelled'} as Record<string,string>)[status])??status}{replay&&<small> · {ar?'سجل محفوظ':'Saved mission'}</small>}</span>{usage&&<span className="journey-cost">${Number(usage.estimated_cost_usd??0).toFixed(4)} {ar?'تكلفة تقديرية':'estimated'}<HelpButton topic="cost"/></span>}<div className="journey-actions">{next!=='discuss'&&<button type="button" className="journey-chat secondary-chat" onClick={onDiscuss}><MessageCircle size={16}/>{ar?'اسأل القائد':'Ask the master'}</button>}{canPause&&next!=='resume'&&<button type="button" onClick={onPause}>{status==='PAUSED'?<Play size={15}/>:<Pause size={15}/>} {status==='PAUSED'?(ar?'متابعة':'Resume'):(ar?'إيقاف مؤقت':'Pause')}</button>}<details className="journey-more"><summary><Settings2 size={15}/>{ar?'أدوات إضافية':'More tools'}<ChevronDown size={12}/></summary><div>{[{id:'replay',icon:Play,label:ar?'إعادة عرض المهمة':'Replay mission'},{id:'board',icon:Radio,label:ar?'سجل النشاط':'Activity board'},{id:'work',icon:BookOpen,label:ar?'داخل العمل':'Inside the work'},{id:'world',icon:Users,label:ar?'عالم الوكلاء':'Animated world'},{id:'flow',icon:Workflow,label:ar?'مخطط التدفق':'Workflow'}].map(item=><button type="button" key={item.id} onClick={e=>{onAdvanced(item.id);e.currentTarget.closest('details')?.removeAttribute('open');}}><item.icon size={15} aria-hidden="true"/>{item.label}</button>)}{canCancel&&<button type="button" className="journey-cancel" onClick={onCancel}>{ar?'إلغاء المهمة':'Cancel mission'}</button>}</div></details></div></div>}
 </section>;
}

// Navigation follows recorded milestones; a status alone cannot unlock an answer.
export function journeyNextAction(status:string,hasPlan:boolean,hasAnswer:boolean,replay:boolean){
 if(status==='AWAITING_CLARIFICATION')return 'clarify';
 if(replay)return 'replay';
 if(['FAILED','AWAITING_LIMIT_APPROVAL'].includes(status))return 'attention';
 if(status==='PAUSED')return 'resume';
 if(status==='COMPLETED'&&hasAnswer)return 'answer';
 if(status==='AWAITING_APPROVAL'&&hasPlan)return 'plan';
 if(status==='CANCELLED')return 'replay';
 if(['CREATED','PLANNING','AWAITING_APPROVAL'].includes(status))return 'discuss';
 return 'team';
}
