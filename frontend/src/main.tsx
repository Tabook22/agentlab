import { apiBase } from './apiBase';
import { Translate, LocaleProvider, useLanguage, translateText, presetText, formatDateTime, formatTime, flowLabels } from './i18n';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Bot, Users, MessageCircle, FlaskConical, ArrowUpRight, ArrowRight, Play, Pause, Square, RotateCcw, ChevronRight, Check, Radio, Workflow, Globe2, Maximize2, X, BookOpen, History, Settings2, Sparkles, CloudSun, BarChart3, ShieldCheck, Send, StepForward, StepBack } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ReactFlow, Background, Controls, type Node, type Edge } from '@xyflow/react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import '@xyflow/react/dist/style.css';
import './style.css';
import './work.css';
import { WorkView } from './WorkView';
import { Robot } from './Robot';
import { AnimatedWorld } from './AnimatedWorld';
import {MissionSources} from './MissionSources';
import type {MissionAttachment} from './attachments';
import { AnswerActions } from './AnswerActions';
import { AnswerText } from './AnswerText';
import { MissionJourney, suggestedJourneyView, type JourneyView } from './MissionJourney';
import { MasterChat } from './MasterChat';
import { MissionTheater } from './MissionTheater';
import {MissionClarification} from './MissionClarification';
import { MissionPlan } from './MissionPlan';
import { LiveBoard } from './LiveBoard';
import { grazingMission, MissionComposer } from './MissionComposer';
import { MissionHistory } from './MissionHistory';
import { MissionMonitor, type StreamState } from './MissionMonitor';
import { ResearchText, ResearchSources } from './ResearchText';
import { HelpButton,HelpProvider,UserGuide } from './Help';
import { displayEvents } from './displayNames';
import { agentsFrom, appendEvent, recordedMissionStatus, type LabEvent, type Agent } from './events';
import './missionStage.css';

const examples = [
  { id:'weather', icon:CloudSun, title:'Weather laboratory', subtitle:'From data to a six-day dashboard', prompt:'Create a six-day weather dashboard using the synthetic classroom dataset.', color:'blue' },
  { id:'data', icon:BarChart3, title:'Data detectives', subtitle:'Find the story inside student scores', prompt:'Analyze the scores 68, 75, 81, 92, 84. Calculate their average and give two short observations.', color:'purple' },
  { id:'concepts', icon:BookOpen, title:'Meet an AI agent', subtitle:'Turn a big idea into a simple explanation', prompt:'Explain how an AI agent uses instructions, context, and tools.', color:'green' },
  { id:'failure', icon:ShieldCheck, title:'The recovery challenge', subtitle:'Watch a team handle a simulated timeout', prompt:'Demonstrate a simulated weather API timeout and safe retry.', color:'amber' },
];
async function api(path: string, options?: RequestInit) {
  const res = await fetch(apiBase + path, options);
  if (!res.ok) { const body = await res.json().catch(() => ({})); throw new Error(typeof body.detail === 'string' ? body.detail : `Request failed (${res.status})`); }
  return res.json();
}
const pretty = (s:string) => s.toLowerCase().replaceAll('_',' ');
function App() {
  const [page,setPage] = useState('lab');
  const [showComposer,setShowComposer]=useState(true);
  const [showMasterChat,setShowMasterChat]=useState(false);
  function openMasterChat(){setShowMasterChat(true);requestAnimationFrame(()=>document.getElementById('master-study')?.scrollIntoView({behavior:'smooth',block:'start'}));}
  const [connection,setConnection]=useState<StreamState>('closed');
  const [provider,setProvider] = useState<{key_present:boolean;live_enabled:boolean;model:string;connection_tested:boolean;limits?:{max_budget_usd:number}}|null>(null);
  const [executionMode,setExecutionMode] = useState<'live'|'simulation'>('live');
  const [maxWorkers,setMaxWorkers] = useState(8);
  const [maxCycles,setMaxCycles] = useState(3);
  const [budget,setBudget] = useState(0.10);
  const [scenario,setScenario] = useState('weather');
  const [prompt,setPrompt] = useState('');
  const [attachments,setAttachments]=useState<MissionAttachment[]>([]);
  const goalSourceMission=useRef<string|null>(null);
  const [mission,setMission] = useState<any>(null);
  const [events,setEvents] = useState<LabEvent[]>([]);
  const [selected,setSelected] = useState<string|null>(null);
  const [view,setView] = useState('theater');
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [replay,setReplay] = useState<number|null>(null);
  const [playing,setPlaying] = useState(false);
  const [speed,setSpeed] = useState(1);
  const {language,setLanguage}=useLanguage();
  const arabic=language==='ar';
  const setArabic=(value:boolean)=>setLanguage(value?'ar':'en');
  const [presentation,setPresentation] = useState(false);
  const source = useRef<EventSource|null>(null);
  const missionSelection=useRef(0);
  const namedEvents=useMemo(()=>displayEvents(events),[events]);
  const shown = replay === null ? namedEvents : namedEvents.slice(0,replay);
  const visibleRunEvent=shown.findLast(e=>['mission.completed','mission.failed','mission.cancelled','mission.cancel','mission.planning','mission.retry_requested','mission.plan_approval_requested','mission.plan_approved','mission.limit_approval_requested','mission.clarification_requested','mission.clarification_answered'].includes(e.type));
  const replayStatus=({'mission.completed':'COMPLETED','mission.failed':'FAILED','mission.cancelled':'CANCELLED','mission.cancel':'CANCELLED','mission.limit_approval_requested':'AWAITING_LIMIT_APPROVAL','mission.plan_approval_requested':'AWAITING_APPROVAL','mission.clarification_requested':'AWAITING_CLARIFICATION'} as Record<string,string>)[visibleRunEvent?.type||'']||'RUNNING';
  const agents = agentsFrom(shown);
  const inspected = agents.find(a => a.id === selected);
  const terminal = ['COMPLETED','FAILED','CANCELLED'].includes(mission?.status);
  const output = shown.find(e => e.type === 'mission.completed')?.payload.output;
  const completed = shown.filter(e => e.type === 'task.completed').length;
  const tasks = shown.filter(e => e.type === 'task.created');
  const t = (en:string, _ar?:string) => translateText(en,language);
  async function navigateJourney(next:JourneyView){setView(next);setShowComposer(next==='goal');if(next==='goal'&&mission&&goalSourceMission.current!==mission.id){goalSourceMission.current=mission.id;setPrompt(mission.prompt);setExecutionMode(mission.mode==='live'?'live':'simulation');const ids=events.find(e=>e.type==='mission.created')?.payload.attachment_ids??[];setBusy(true);try{setAttachments(await Promise.all(ids.map((id:string)=>api(`/attachments/${id}`))));}catch(cause){setError(cause instanceof Error?cause.message:'Could not load saved sources.');}finally{setBusy(false);}}requestAnimationFrame(()=>document.querySelector('.mission-journey')?.scrollIntoView({behavior:'smooth',block:'start'}));}


  useEffect(()=>{setPrompt(current=>presetText(current,language));},[language]);
  useEffect(() => () => source.current?.close(), []);
  useEffect(()=>{api('/settings/provider').then(setProvider).catch(e=>setError(e.message));},[]);
  useEffect(() => {
    if (!playing || replay === null) return;
    const timer = setInterval(() => setReplay(cursor => {
      if (cursor === null || cursor >= events.length) { setPlaying(false); return cursor; }
      return cursor + 1;
    }), 650/speed);
    return () => clearInterval(timer);
  },[playing,replay === null,speed,events.length]);
  useEffect(() => {
    if (page === 'settings') api('/settings/provider').then(setProvider).catch(e => setError(e.message));
  },[page]);

  useEffect(()=>{let cancelled=false;
    api('/missions').then(async rows=>{
      const current=rows.find((row:any)=>['CREATED','RUNNING','PAUSED','AWAITING_APPROVAL','AWAITING_LIMIT_APPROVAL','AWAITING_CLARIFICATION'].includes(row.status));
      if(!current||cancelled||missionSelection.current)return;
      const recorded=await api(`/missions/${current.id}/events`);
      if(cancelled||missionSelection.current)return;
      current.status=recordedMissionStatus(recorded,current.status);
      const ending=recorded.findLast((event:LabEvent)=>['mission.completed','mission.failed','mission.cancelled','mission.cancel','mission.limit_approval_requested','mission.clarification_requested','mission.clarification_answered','mission.retry_requested','mission.planning','mission.execution_opened','mission.plan_approved'].includes(event.type));
      const endedStatus=({'mission.completed':'COMPLETED','mission.failed':'FAILED','mission.cancelled':'CANCELLED','mission.cancel':'CANCELLED'} as Record<string,string>)[ending?.type||''];
      setMission(endedStatus?{...current,status:endedStatus}:current);setEvents(recorded);setShowComposer(false);setView(suggestedJourneyView(current.status,recorded.some((e:LabEvent)=>e.type==='mission.completed')));
      if(!endedStatus&&!['AWAITING_APPROVAL','AWAITING_LIMIT_APPROVAL','AWAITING_CLARIFICATION'].includes(current.status))watchMission(current.id,recorded.at(-1)?.sequence||0);
    }).catch(()=>{});
    return()=>{cancelled=true;};
  },[]);

  function watchMission(id:string,after=0) {
      source.current?.close();setConnection('connecting');
      const stream = new EventSource(`${apiBase}/missions/${id}/stream?after=${after}`);
      source.current = stream;
      stream.onmessage = message => {
        const event = JSON.parse(message.data) as LabEvent;
        setEvents(old => appendEvent(old,event));
        if(event.type==='mission.clarification_requested'){setMission((m:any)=>({...m,status:'AWAITING_CLARIFICATION'}));setView('theater');setShowComposer(false);stream.close();setConnection('closed');requestAnimationFrame(()=>document.getElementById('mission-clarification')?.scrollIntoView({behavior:'smooth',block:'start'}));}
        if(event.type==='mission.limit_approval_requested'){setMission((m:any)=>({...m,status:'AWAITING_LIMIT_APPROVAL'}));setView('board');stream.close();setConnection('closed');requestAnimationFrame(()=>document.getElementById('mission-limit-approval')?.scrollIntoView({behavior:'smooth',block:'center'}));}
        if(event.type==='mission.plan_approval_requested'){setView('plan');setMission((m:any)=>({...m,status:'AWAITING_APPROVAL'}));setShowComposer(false);requestAnimationFrame(()=>document.getElementById('commander-plan-report')?.scrollIntoView({behavior:'smooth',block:'start'}));stream.close();setConnection('closed');}
        if (event.type === 'mission.planning') setMission((m:any) => ({...m,status:'RUNNING'}));
        if (event.type.startsWith('mission.') && event.payload.status) setMission((m:any) => ({...m,status:event.payload.status}));
        const status = {'mission.completed':'COMPLETED','mission.failed':'FAILED','mission.cancel':'CANCELLED','mission.cancelled':'CANCELLED'}[event.type];
        if (status) {
          if(status==='COMPLETED'){setView('answer');setShowComposer(false);}
          setMission((m:any) => ({...m,status}));
          // Cancellation cleanup may emit further events; recover them from durable history.
          if (status === 'CANCELLED') setTimeout(() => api(`/missions/${id}/events`).then(setEvents).catch(e => setError(e.message)), 400);
          stream.close();setConnection('closed');
        }
      };
      stream.onerror = () => { if (stream.readyState !== EventSource.CLOSED) {setConnection('reconnecting');setError('Connection interrupted. Reconnecting to persisted events…');} };
      stream.onopen = () => {setError('');setConnection('connected');};
  }
  async function launch(chosenScenario = scenario, chosenPrompt = prompt, chosenMode = executionMode) {
    missionSelection.current++;setBusy(true); setError(''); source.current?.close(); setReplay(null); setPlaying(false); setSelected(null);
    try {
      const created = await api('/missions', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({prompt:chosenPrompt,attachment_ids:chosenMode==='live'?attachments.map(file=>file.id):[],scenario:chosenScenario,mode:chosenMode,open_ended:true,max_workers:maxWorkers,max_iterations:maxCycles,budget_usd:budget,language})});
      setMission(created); setAttachments([]); setEvents([]); setPage('lab');setView('theater');setShowComposer(false);setShowMasterChat(false);
      requestAnimationFrame(()=>document.getElementById('mission-monitor')?.scrollIntoView({behavior:'smooth',block:'start'}));
      watchMission(created.id);
    } catch (e:any) {setError(e.message);} finally {setBusy(false);}
  }
  async function control(action:string) {
    try { setError('');setMission(await api(`/missions/${mission.id}/${action}`, {method:'POST'})); if(action.startsWith('retry')){setReplay(null);setPlaying(false);watchMission(mission.id,events.at(-1)?.sequence||0);} } catch(e:any){setError(e.message);}
  }
  async function renameWorker(agentId:string,name:string){
    const selected=missionSelection.current;
    const result=await api(`/missions/${mission.id}/agents/${agentId}/name`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});
    if(selected===missionSelection.current)setEvents(old=>appendEvent(old,result.event));
  }
  async function answerClarification(questionId:string,answer:string){
    const result=await api(`/missions/${mission.id}/clarifications/${questionId}/answer`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({answer})});
    await budgetChanged(result);
  }
  async function decidePlan(action:'approve'|'decline',planId:string,cap?:number,names?:Record<string,string>){
    const result=await api(`/missions/${mission.id}/plan/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan_id:planId,...(action==='approve'?{total_budget_usd:cap,worker_names:names,open_ended:true}:{})})});
    await budgetChanged(result);
    if(action==='approve'){setView('theater');setShowMasterChat(false);}if(action==='approve')requestAnimationFrame(()=>document.getElementById('live-workspace')?.scrollIntoView({behavior:'smooth',block:'start'}));
    if(action==='decline'){setPrompt(mission.prompt);setShowComposer(true);setView('goal');}
  }
  async function budgetChanged(result:any) {
    source.current?.close();setError('');
    const [current,recorded]=await Promise.all([api(`/missions/${mission.id}`),api(`/missions/${mission.id}/events`)]);
    current.status=recordedMissionStatus(recorded,current.status);
    setMission(current);setEvents(recorded);setReplay(null);setPlaying(false);
    if(result.resumed||['RUNNING','PAUSED'].includes(current.status))watchMission(mission.id,recorded.at(-1)?.sequence||0);
  }
  async function openHistory(item:any) {
    missionSelection.current++;
    source.current?.close(); setError('');
    try { const recorded = await api(`/missions/${item.id}/events`); setMission({...item,status:recordedMissionStatus(recorded,item.status)}); setEvents(recorded); setReplay(recorded.length); setPlaying(false); setSelected(null); setPage('lab');setView(suggestedJourneyView(item.status,recorded.some((e:LabEvent)=>e.type==='mission.completed')));setShowComposer(false);setShowMasterChat(false);setConnection('closed'); }
    catch(e:any) {setError(e.message);}
  }
  async function prepareHistory(item:any) {
    missionSelection.current++;
    if(mission&&!terminal&&replay===null){setError('Finish or cancel the current mission before preparing another run.');return;}
    source.current?.close();setMission(null);setEvents([]);setSelected(null);setReplay(null);setPlaying(false);
    try{const recorded=await api(`/missions/${item.id}/events`);const ids=recorded.find((event:LabEvent)=>event.type==='mission.created')?.payload.attachment_ids??[];setAttachments(await Promise.all(ids.map((id:string)=>api(`/attachments/${id}`))));}catch(cause){setError(cause instanceof Error?cause.message:'Could not load saved sources.');return;}
    setShowComposer(true);setPrompt(item.prompt);setExecutionMode(item.mode);setScenario(item.mode==='simulation'?item.scenario:'weather');setPage('lab');setView('board');setError('');
  }
  const nodes:Node[] = [ {id:'master',position:{x:225,y:15},data:{label:'◎ Master Agent · Commander'},style:{borderRadius:16,background:'#eef2ff',borderColor:'#b8c6ff',width:220}},
    ...agents.map((a,i) => ({id:a.id,position:{x:225,y:130+i*145},data:{label:`${a.config.name} · ${a.config.role}\n${pretty(a.state)}`},style:{borderRadius:16,width:220,borderColor:a.state === 'RUNNING' ? '#7865e9':'#d9e1ee',whiteSpace:'pre-line' as const}})) ];
  const edges:Edge[] = [ ...shown.filter(e => e.type === 'task.assigned' && e.agent_id).map(e => ({id:e.id,source:'master',target:e.agent_id!,animated:!terminal})), ...shown.filter(e => e.type === 'agent.message_sent').map(e => ({id:e.id,source:e.payload.sender,target:e.payload.receiver,animated:replay===null && !terminal && shown.at(-1)?.id===e.id,label:'result handoff'})) ];

  const missionComposer=<MissionComposer attachments={attachments} onAttachmentsChange={setAttachments} maxBudget={provider?.limits?.max_budget_usd||5} prompt={prompt} setPrompt={setPrompt} mode={executionMode} setMode={setExecutionMode} maxWorkers={maxWorkers} setMaxWorkers={setMaxWorkers} maxCycles={maxCycles} setMaxCycles={setMaxCycles} budget={budget} setBudget={setBudget} available={!!provider?.live_enabled} model={provider?.model || 'Configured model'} busy={busy} active={!!mission&&!terminal&&replay===null} onLaunch={()=>void launch()}/>;
  return <Translate>{<div className={`app ${presentation?'presentation':''} ${view==='board'?'board-view':''}`}>
    <aside className="sidebar"><a href="#" className="brand" onClick={e => {e.preventDefault();setPage('lab');}}><span className="brand-icon"><FlaskConical size={23}/></span><span>{arabic?'مختبر ':'agent'}<span className="brand-light">{arabic?'الوكلاء':'lab'}</span><small>WATCH AI AT WORK</small></span></a>
      <div className="sidebar-section">YOUR WORKSPACE</div>
      <nav>{[{id:'lab',icon:FlaskConical,label:t('Mission Control','مركز المهام')},{id:'history',icon:History,label:t('Mission history','سجل المهام')},{id:'learn',icon:BookOpen,label:t('Learning center','مركز التعلم')}].map(n=><button key={n.id} className={page===n.id?'nav active':'nav'} onClick={()=>setPage(n.id)}><n.icon size={19}/>{n.label}{page===n.id&&<span className="nav-dot"/>}</button>)}</nav>
      <div className="sidebar-note"><div className="note-icon"><Sparkles size={20}/></div><strong>A little curiosity.<br/>A lot to discover.</strong><p>Big ideas become clear when you can see them happen.</p><button onClick={()=>setPage('learn')}>Explore the basics <ArrowUpRight size={15}/></button></div>
      <button className={`nav settings ${page==='settings'?'active':''}`} onClick={()=>setPage('settings')}><Settings2 size={18}/>Lab settings</button>
      <div className="profile"><span>ST</span><div>Student workspace<small>Local learning session</small></div><span className="online"/></div>
    </aside>
    <main>
      <header className="topbar"><div className="breadcrumb">Workspace <ChevronRight size={14}/><strong>{page==='lab'?t('Mission Control','مركز المهام'):page==='history'?'Mission history':page==='learn'?'Learning center':'Lab settings'}</strong></div><div className="header-actions"><HelpButton topic="guide" label={arabic?'دليل المستخدم':'User guide'}/><span className="local-pill"><i/>Local laboratory</span><button className="icon-button" onClick={()=>setArabic(!arabic)} aria-label="Switch language"><Globe2 size={17}/><span>{arabic?'English':'Arabic'}</span></button><button className="icon-button" onClick={()=>setPresentation(!presentation)} aria-label="Toggle classroom view">{presentation?<X size={18}/>:<Maximize2 size={18}/>}</button></div></header>
      <div className="content">
      {error&&<div className="error" role="alert">{error}<button onClick={()=>setError('')} aria-label="Dismiss error"><X size={16}/></button></div>}
      {page==='lab'&&<>
        <MissionJourney exists={!!mission} status={replay!==null?replayStatus:mission?.status||'READY'} view={showComposer?'goal':view} events={shown} replay={replay!==null} onNavigate={navigateJourney} onDiscuss={openMasterChat} onPause={()=>void control(mission.status==='PAUSED'?'resume':'pause')} onCancel={()=>void control('cancel')} onAdvanced={next=>{setShowComposer(false);if(next==='replay'){setView('theater');setReplay(0);setPlaying(true);}else setView(next);}}/>
        {mission&&<MissionSources key={mission.id} events={namedEvents}/>}
        {mission&&['board','work','world','flow'].includes(view)&&<details className="journey-detailed-progress"><summary>Detailed progress</summary><MissionMonitor events={shown} status={replay!==null?replayStatus:mission.status} connection={connection} replay={replay!==null} onBoard={()=>{setView('board');requestAnimationFrame(()=>document.getElementById('live-workspace')?.scrollIntoView({behavior:'smooth',block:'start'}));}} onWorld={()=>{setView('world');requestAnimationFrame(()=>document.getElementById('live-workspace')?.scrollIntoView({behavior:'smooth',block:'start'}));}}/></details>}
        {showComposer&&<section className="mission-entry panel" aria-label="Give your agents a mission"><div className="mission-entry-heading"><span className="step">01</span><div><h2>Give your agents a mission</h2><p>Describe your goal. Review the team and cost before work begins.</p></div></div>{missionComposer}
          <details className="mission-examples"><summary>Need inspiration? Try an example</summary><button type="button" disabled={attachments.length>0} className="journey-research-example" onClick={()=>{setPrompt(presetText(grazingMission,language));setExecutionMode('live');}}><Globe2 size={18}/>Dhofar grazing research<span>Live AI · review a research plan</span><ArrowRight size={15}/></button><div className="examples">{examples.map(ex=><button type="button" disabled={attachments.length>0} key={ex.id} className={`example ${scenario===ex.id?'chosen':''}`} onClick={()=>{setScenario(ex.id);setExecutionMode('simulation');setPrompt(presetText(ex.prompt,language));}}><span className={`example-icon ${ex.color}`}><ex.icon size={19}/></span><span><strong>{ex.title}</strong><small>{ex.subtitle}</small></span><ChevronRight size={15}/></button>)}</div></details>
        </section>}
        {mission&&<MissionClarification key={mission.id} events={shown} status={mission.status} canAnswer={mission.status==='AWAITING_CLARIFICATION'&&(replay===null||replay===events.length)} onAnswer={answerClarification}/>}
        {mission&&showMasterChat&&<MasterChat key={mission.id} missionId={mission.id} status={mission.status} events={namedEvents} available={!!provider?.key_present} onClose={()=>setShowMasterChat(false)}/>}
        {mission&&view==='plan'&&<MissionPlan onDiscuss={openMasterChat} events={shown} onInspect={setSelected} canApprove={mission?.status==='AWAITING_APPROVAL'&&(replay===null||replay===events.length)} onDecision={decidePlan}/>}{mission&&!['goal','plan','answer'].includes(view)&&<div className="workspace-grid board-layout journey-overview">
          <section id="live-workspace" className="lab-panel panel"><div className="journey-view-heading"><Users size={17}/>{view==='theater'?'Your team in action':view==='board'?'Activity board':view==='work'?'Inside the work':view==='world'?'Animated world':'Workflow'}</div>
            {view==='theater'?<MissionTheater onAnswered={async()=>{if(mission)setEvents(await api(`/missions/${mission.id}/events`));}} onResult={()=>navigateJourney('answer')} onDiscuss={mission?openMasterChat:undefined} onRecover={()=>{setView('board');requestAnimationFrame(()=>document.getElementById('mission-limit-approval')?.scrollIntoView({behavior:'smooth',block:'center'}));}} onRename={renameWorker} key={mission?.id||'theater-intro'} events={shown} status={replay!==null?replayStatus:mission?.status||'READY'} replay={replay!==null} replayPlaying={playing} replaySpeed={speed} onPauseReplay={()=>setPlaying(false)} onStart={()=>{setScenario('data');setPrompt(presetText(examples[1].prompt,language));void launch('data',presetText(examples[1].prompt,language),'simulation');}} onChooseMission={()=>{setShowComposer(true);requestAnimationFrame(()=>document.getElementById('mission')?.focus());}} onShowPlan={()=>navigateJourney('plan')} canControl={false} onTogglePause={()=>void control(mission.status==='PAUSED'?'resume':'pause')}/>:view==='board'?<LiveBoard limitMissionId={mission?.mode==='live'&&(mission.status==='AWAITING_LIMIT_APPROVAL'||mission.status==='FAILED')&&(replay===null||replay===events.length)?mission.id:undefined} onRename={renameWorker} budgetMissionId={mission?.mode==='live'&&mission.status==='FAILED'&&(replay===null||replay===events.length)?mission.id:undefined} onBudgetChange={budgetChanged} onExtend={mission?.status==='FAILED'&&mission.mode==='live'&&events.some(e=>e.type==='task.completed')?()=>void control('retry?extend_cycles=true'):undefined} onRetry={mission?.status==='FAILED'&&mission.mode==='live'&&events.some(e=>e.type==='task.completed')?()=>void control('retry'):undefined} key={mission?.id || 'intro'} events={shown} replay={replay!==null} replayPlaying={playing} paused={['PAUSED','AWAITING_LIMIT_APPROVAL'].includes(mission?.status||'')} canControl={false} onTogglePause={()=>void control(mission.status==='PAUSED'?'resume':'pause')} onChooseMission={()=>{setShowComposer(true);requestAnimationFrame(()=>{document.getElementById('mission')?.scrollIntoView({behavior:'smooth',block:'center'});document.getElementById('mission')?.focus({preventScroll:true});});}} onShowPlan={()=>setView('work')} onInspect={setSelected} onStart={()=>{setScenario('data');setPrompt(presetText(examples[1].prompt,language));void launch('data',presetText(examples[1].prompt,language),'simulation');}}/>:view==='work'?<WorkView key={mission?.id || "intro"} canPause={false} onTogglePause={()=>void control(mission.status==='PAUSED'?'resume':'pause')} events={shown} replay={replay!==null} paused={['PAUSED','AWAITING_LIMIT_APPROVAL'].includes(mission?.status||'')} onInspect={setSelected} onStart={()=>{setScenario('data');setPrompt(presetText(examples[1].prompt,language));void launch('data',presetText(examples[1].prompt,language),'simulation');}}/>:view==='world'?<AnimatedWorld onPauseReplay={()=>setPlaying(false)} key={mission?.id || 'empty'} events={shown} replay={replay!==null} replayPlaying={playing} replaySpeed={speed} missionPaused={['PAUSED','AWAITING_LIMIT_APPROVAL'].includes(mission?.status||'')} backendStatus={mission?.status || 'READY'} onInspect={id=>id==='master'?setView('theater'):setSelected(id)} onStart={()=>{setScenario('data');setPrompt(presetText(examples[1].prompt,language));void launch('data',presetText(examples[1].prompt,language),'simulation');}}/>:<div className="flow"><ReactFlow ariaLabelConfig={flowLabels(language)} key={agents.length} nodes={nodes.map(node=>({...node,data:{...node.data,label:translateText(String(node.data.label),language)}}))} edges={edges.map(edge=>({...edge,label:typeof edge.label==='string'?translateText(edge.label,language):edge.label}))} fitView onNodeClick={(_,n)=>n.id!=='master'&&setSelected(n.id)}><Background gap={22} color="#d9e1eb"/><Controls/></ReactFlow></div>}
            <div className="lab-footer"><div><span className="legend-dot purple"/>Commander<span className="legend-dot blue"/>Specialist<span className="legend-dot green"/>Completed</div><span>{agents.length} agents · {completed}/{tasks.length} tasks</span></div>
            {mission&&(terminal||replay!==null)&&<div className="execution-controls">{(terminal||replay!==null)&&<button onClick={()=>{setReplay(0);setPlaying(true);}}><RotateCcw size={15}/>Replay events</button>}{replay!==null&&<><button onClick={()=>setReplay(Math.max(0,replay-1))} aria-label="Previous event"><StepBack size={16}/></button><button onClick={()=>setPlaying(!playing)} aria-label="Play or pause replay">{playing?<Pause size={16}/>:<Play size={16}/>}</button><button onClick={()=>setReplay(Math.min(events.length,replay+1))} aria-label="Next event"><StepForward size={16}/></button><input aria-label="Replay position" type="range" min={0} max={events.length} value={replay} onChange={e=>setReplay(+e.target.value)}/><select aria-label="Playback speed" value={speed} onChange={e=>setSpeed(+e.target.value)}>{[.5,1,2,4].map(s=><option key={s} value={s}>{s}×</option>)}</select></>}</div>}
          </section>
        </div>}
        {output&&view==='answer'&&<section id="mission-answer" className="panel result"><div className="journey-answer-note"><ShieldCheck size={18}/>{shown.some(e=>e.type==='master.final_approved')?'The master approved this answer after reviewing the mission.':'Saved result · inspect the recorded evidence and sources.'}</div><div className="panel-heading"><span className="result-check"><Check size={19}/></span><h2>Your answer</h2><span className={mission?.mode==='live'?'live-mode-pill':'simulation'}>{mission?.mode==='live'?'LIVE AI OUTPUT':'SIMULATED OUTPUT'}</span></div><AnswerActions key={mission.id} missionId={mission.id}/>{(output.title||output.label)&&<h3>{output.title||output.label}</h3>}{typeof output.content==='string'&&<AnswerText content={output.content}/>}{output.limitations?.length>0&&<ul className="artifact-limitations">{output.limitations.map((item:string,i:number)=><li key={i}>{item}</li>)}</ul>}<ResearchSources sources={output.sources}/>{output.temperatures&&<div className="chart"><ResponsiveContainer width="100%" height={210}><AreaChart data={output.temperatures.map((temp:number,i:number)=>({day:translateText(output.days[i],language),temperature:temp}))}><defs><linearGradient id="temperature" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7474ef" stopOpacity={.3}/><stop offset="100%" stopColor="#7474ef" stopOpacity={0}/></linearGradient></defs><XAxis dataKey="day"/><YAxis unit="°"/><Tooltip/><Area name={t('Temperature')} dataKey="temperature" stroke="#7165df" strokeWidth={3} fill="url(#temperature)"/></AreaChart></ResponsiveContainer></div>}{output.mean&&<p className="mean">Average score: <strong>{output.mean}</strong> / 100</p>}{output.lesson&&<p>{output.lesson}</p>}<details><summary>Inspect structured output</summary><pre>{JSON.stringify(output,null,2)}</pre></details></section>}
      </>}
      {page==='history'&&<MissionHistory request={api} onReplay={openHistory} onPrepare={prepareHistory}/>}
      {page==='learn'&&<section><UserGuide events={shown}/><div className="eyebrow">LEARN BY LOOKING INSIDE</div><h1>From a reply to a team.</h1><p className="muted">Different systems suit different missions. More agents also add coordination, latency, and cost.</p><div className="lesson-grid">{[{title:'A chatbot',icon:Bot,text:'Receives a message and generates a response. It may not have tools or a workflow.',example:'“Explain the weather.” → a text explanation.'},{title:'A tool-using agent',icon:FlaskConical,text:'Uses instructions, context, permitted tools and control logic to perform a task.',example:'Retrieve observations → organize them → report the result.'},{title:'A multi-agent team',icon:Workflow,text:'Delegates work to specialists and passes results through explicit dependencies.',example:'Data specialist → visualization specialist → verifier.'}].map(l=><article key={l.title} className="panel lesson"><l.icon size={28}/><h2>{l.title}</h2><p>{l.text}</p><div className="lesson-example">{l.example}</div></article>)}</div><section className="panel lesson"><h2>Try it in the lab</h2><p>Choose the recovery challenge. Watch the failed task, its retry, and the successful handoff. Open an agent to compare its allowed tool with the tool it used.</p><button className="launch compact" onClick={()=>{setScenario('failure');setPrompt(presetText(examples[3].prompt,language));setPage('lab');}}>Open recovery experiment <ArrowRight size={16}/></button></section></section>}
      {page==='settings'&&<section className="settings-page"><div className="eyebrow">LOCAL EDUCATIONAL WORKSPACE</div><h1>Your classroom laboratory.</h1><div className="panel lesson"><h2>Simulation mode</h2><p>Enabled. Runs entirely with local fixtures, without an API key or model costs.</p><h2>OpenAI key setup</h2><p>{provider ? provider.key_present ? (provider.connection_tested ? 'Key found on the backend. A live response has been received in this server session.' : 'Key found on the backend. Connection has not been tested in this server session.') : 'No key found. Add it to backend/.env, then restart the backend.' : 'Checking backend configuration…'} Your key is never returned to this page. Live AI uses this backend key; it is never sent to the browser.</p><h2>Live AI</h2><p>Available locally when a key is configured. The commander creates 1–8 mission-specific workers. They continue reviewing and improving until the master approves the final answer. Local tools are allowlisted; web research returns source links; no shell or unrestricted network tools are provided.</p><h2>Language and access</h2><p>English and Arabic interface with a saved language preference and matching layout direction. New live missions generate public text in the selected language. Saved original evidence and editable user text keep their original content. This is a single-user local demo.</p><h2>Execution and cost</h2><p>One live mission at a time · up to 8 workers · open-ended execution. No app spending, call, token, cycle or total-time caps. Cost estimates and accumulated usage are visible throughout. Pause and cancel remain available. Simulation supports four active missions.</p></div></section>}
      <footer>AI Agent Lab <span>Give AI a mission. Watch the agents come alive!</span><span className="footer-version">FOUNDATION / 0.1</span></footer>
      </div>
    </main>
    <AnimatePresence>{inspected&&<><motion.div className="inspector-overlay" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={()=>setSelected(null)}/><motion.aside className="inspector" initial={{x:420}} animate={{x:0}} exit={{x:420}}><div className="panel-heading"><span className="example-icon purple"><Bot size={21}/></span><h2>Look inside an agent</h2><button className="icon-button" onClick={()=>setSelected(null)} aria-label="Close inspector"><X size={20}/></button></div><Robot identity={inspected.id} role={inspected.config.role}/><h2>{inspected.config.name}</h2><p className="muted">{inspected.config.role} · {pretty(inspected.state)}</p><dl><dt>Identity</dt><dd>{inspected.id}</dd><dt>Created</dt><dd>{formatDateTime(inspected.config.created_at,language)}</dd><dt>Instructions</dt><dd>{inspected.config.instructions}</dd><dt>Model</dt><dd>{inspected.config.model}</dd><dt>Allowed tools</dt><dd>{inspected.config.tools.join(', ')}</dd><dt>Tools actually used</dt><dd>{[...new Set(shown.filter(e=>e.agent_id===inspected.id&&e.type==='agent.tool_started').map(e=>e.payload.tool))].join(', ') || 'None yet'}</dd><dt>Task dependencies</dt><dd>{tasks.find(e=>e.agent_id===inspected.id)?.payload.dependencies.join(', ') || 'No prerequisites'}</dd></dl><h3>Observable activity</h3>{shown.filter(e=>e.agent_id===inspected.id || e.payload.sender===inspected.id || e.payload.receiver===inspected.id).map(e=><details key={e.id}><summary>{e.payload.summary}</summary><pre>{JSON.stringify(e,null,2)}</pre></details>)}{inspected.output&&<><h3>Result</h3><pre>{JSON.stringify(inspected.output,null,2)}</pre></>}<p className="info-note">This panel shows saved actions and results. It does not show hidden model reasoning.</p></motion.aside></>}</AnimatePresence>
  </div>}</Translate>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><LocaleProvider><HelpProvider><App/></HelpProvider></LocaleProvider></React.StrictMode>);
