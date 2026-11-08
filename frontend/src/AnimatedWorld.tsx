import { Translate } from './i18n';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Check, ChevronRight, CirclePause, Database, FastForward, Package, Pause, Play, Radio, RotateCcw, Send, Settings2, StepForward, X } from 'lucide-react';
import { agentsFrom, workFor, type LabEvent } from './events';
import { dataCaption, nextVisualCursor, packetPath, stationPositions, transferFor, visibleTransfers, workAnimation } from './animation';
import { HelpButton } from './Help';
import { operationHelp } from './helpContent';
import { ConnectionConversation } from './ConnectionConversation';
import { ActivityPackets } from './ActivityPackets';
import { Robot } from './Robot';
import { DataPreview } from './WorkView';
import './animation.css';
import { executionMode } from './loops';

export function AnimatedWorld({events,replay,replayPlaying,replaySpeed,missionPaused,backendStatus,onInspect,onStart,onPauseReplay,compact=false}: {
  compact?:boolean;events:LabEvent[];replay:boolean;replayPlaying:boolean;replaySpeed:number;missionPaused:boolean;backendStatus:string;
  onInspect:(id:string)=>void;onStart:()=>void;onPauseReplay:()=>void;
}) {
  const [cursor,setCursor] = useState(0);
  const [followLive,setFollowLive]=useState(true);
  const live=executionMode(events)==='live';
  const [playing,setPlaying] = useState(true);
  const [speed,setSpeed] = useState(1);
  const [connection,setConnection]=useState<{source:string;target:string}|null>(null);
  const [packetOpen,setPacketOpen] = useState(false);
  const svg = useRef<SVGSVGElement>(null);
  const packetMotion = useRef<SVGAnimationElement>(null);
  const availableEvents = useRef(events);
  availableEvents.current = events;
  const [motionOverride,setMotionOverride] = useState(()=>typeof window==='undefined'||!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const reduceMotion = !motionOverride;
  const count = replay||followLive?events.length:Math.min(cursor,events.length);
  const prefix = events.slice(0,count);
  const agents = agentsFrom(prefix);
  const current = prefix.at(-1);
  const packet = transferFor(current,prefix);
  const positions = stationPositions(agents.map(a=>a.id));
  const worldHeight = 660+Math.max(0,Math.ceil(agents.length/3)-1)*270;
  const edges = visibleTransfers(prefix);
  const names = new Map([['master','Master Agent'],['result','Mission result'],...agents.map(a=>[a.id,a.config.name] as [string,string])]);
  const active = agents.find(a=>a.id===current?.agent_id);
  const final = prefix.findLast(e=>e.type==='mission.completed');
  const moving = replay?replayPlaying:playing&&!missionPaused;
  const behind = !replay && count<events.length;
  const activity=workAnimation(replay?prefix:events,backendStatus,replay,moving,missionPaused,!!reduceMotion);

  useEffect(()=>{
    if(replay || followLive || !playing || missionPaused || cursor>=availableEvents.current.length) return;
    const timer=setTimeout(()=>setCursor(old=>nextVisualCursor(availableEvents.current,old)), 1500/speed);
    return ()=>clearTimeout(timer);
  },[cursor,cursor<events.length,playing,missionPaused,replay,speed,followLive]);

  useEffect(()=>{
    packetMotion.current?.beginElement();
  },[current?.id,reduceMotion]);
  useEffect(()=>{
    if(moving) svg.current?.unpauseAnimations(); else svg.current?.pauseAnimations();
  },[moving,current?.id]);
  useEffect(()=>setPacketOpen(false),[current?.id]);

  function advance() {setFollowLive(false);setPlaying(false);setCursor(nextVisualCursor(events,count));}
  function inspectData() {
    if(packetOpen) {setPacketOpen(false);return;}
    if(replay) onPauseReplay(); else {setFollowLive(false);setCursor(count);setPlaying(false);}
    setPacketOpen(true);
  }
  const operation = current?.type==='agent.operation'?current:null;
  const detailData = packet?.data ?? operation?.payload.value ?? (current?.type==='agent.input_received'?current.payload.input:null);

  return <Translate>{<section className={`animated-world ${compact?'is-embedded-map':''} ${moving?'is-playing':'is-paused'} ${activity.enabled?'has-work-motion':''} ${motionOverride===true?'motion-opt-in':''}`}>
    {compact?<div className="animation-controls compact-map-controls"><span className="animation-mode"><Radio size={13}/>{replay?'RECORDED REPLAY':followLive?'LATEST RECORDED ACTIVITY':'EVENT PLAYBACK'}</span><div className="animation-buttons">{!replay&&<button onClick={()=>{if(followLive){setFollowLive(false);setCursor(count);}setPlaying(!playing);}} aria-label={playing?'Pause animation':'Play animation'}>{playing?<Pause size={15}/>:<Play size={15}/>}</button>}<button className="motion-toggle" aria-pressed={!reduceMotion} aria-label={reduceMotion?'Enable work animation':'Reduce work animation'} onClick={()=>setMotionOverride(!!reduceMotion)}>{reduceMotion?'Motion off':'Motion on'}</button>{!replay&&<details className="map-playback-options"><summary><Settings2 size={14}/>Playback options</summary><div><button onClick={advance} aria-label="Next animation event"><StepForward size={15}/></button><button onClick={()=>{setFollowLive(false);setCursor(0);setPlaying(true);}} aria-label="Restart animation"><RotateCcw size={15}/></button><select value={speed} onChange={e=>setSpeed(+e.target.value)} aria-label="Animation speed">{[.5,1,2].map(v=><option key={v} value={v}>{v}×</option>)}</select><span>{count} / {events.length} events</span></div></details>}</div></div>:<div className="animation-controls"><div><HelpButton topic="communication"/><span className="animation-mode"><Radio size={13}/>{replay?'RECORDED REPLAY':followLive?'LIVE ACTIVITY':'EVENT PLAYBACK'}</span><span className="animation-count">{count} / {events.length} recorded events</span></div><div className="animation-buttons">{!replay&&<><button onClick={()=>{if(followLive){setFollowLive(false);setCursor(count);}setPlaying(!playing);}} aria-label={playing?'Pause animation':'Play animation'}>{playing?<Pause size={15}/>:<Play size={15}/>}</button><button onClick={advance} aria-label="Next animation event"><StepForward size={15}/></button><button onClick={()=>{setFollowLive(false);setCursor(0);setPlaying(true);}} aria-label="Restart animation"><RotateCcw size={15}/></button><select value={speed} onChange={e=>setSpeed(+e.target.value)} aria-label="Animation speed">{[.5,1,2].map(v=><option key={v} value={v}>{v}×</option>)}</select></>}<button className="motion-toggle" aria-pressed={!reduceMotion} aria-label={reduceMotion?'Enable work animation':'Reduce work animation'} onClick={()=>setMotionOverride(!!reduceMotion)}>{reduceMotion?'Motion off':'Motion on'}</button><span className="backend-status">Backend: {backendStatus.toLowerCase()}</span></div></div>}
    {behind&&<div className="animation-lag"><span>{missionPaused?'Backend paused. You can still step through recorded events.':playing?'Showing each recorded action so you can follow it.':'Animation paused; backend execution may continue.'}</span><button onClick={()=>{setCursor(events.length);setFollowLive(true);setPlaying(true);}}><FastForward size={12}/>Jump to latest</button></div>}
    <div className={`work-motion-status ${activity.enabled?'work-motion-on':''}`} role="status"><span className="work-motion-light"/>{replay?(activity.enabled?'Recorded activity · work animation follows this replay':'Recorded replay · work animation is paused'):['FAILED','CANCELLED'].includes(backendStatus)?'Mission stopped · work animation is off':backendStatus==='COMPLETED'?'Mission complete · work animation is off':missionPaused?'Mission paused · work animation is off':activity.enabled?'Work in progress · moving lines highlight active workers':'Work animation is off'}</div>
    <div className="animation-canvas" aria-label="Animated agent communication diagram" style={agents.length>3?{height:worldHeight*.92}:undefined}>
      <svg className="communication-routes" viewBox={`0 0 1000 ${worldHeight}`} preserveAspectRatio="none" ref={svg} aria-label="Agent connections"><defs><marker id="route-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0 L7 3.5 L0 7" fill="#a9b9d0"/></marker><filter id="packet-glow"><feGaussianBlur stdDeviation="5"/></filter></defs>
        {edges.map(edge=>{const from=positions.get(edge.source);const to=positions.get(edge.target);const busy=edge.source==='master'&&activity.workers.includes(edge.target);return from&&to?<g key={`${edge.source}:${edge.target}`}><path d={packetPath(from,to)} className={`communication-route ${edge.source==='master'?'assignment-route':'handoff-route'} ${packet?.source===edge.source&&packet.target===edge.target?'route-active':''}`} markerEnd="url(#route-arrow)"/>{busy&&<><path d={packetPath(from,to)} className="work-flow-line"/><ActivityPackets path={packetPath(from,to)} reversePath={packetPath(to,from)}/></>}<path d={packetPath(from,to)} className="connection-line-hit" role="button" tabIndex={0} aria-label={`Open conversation between ${names.get(edge.source)} and ${names.get(edge.target)}`} onClick={()=>setConnection({source:edge.source,target:edge.target})} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setConnection({source:edge.source,target:edge.target});}}}/></g>:null;})}
        {packet&&positions.has(packet.source)&&positions.has(packet.target)&&<g key={packet.id} className="travelling-packet" onClick={inspectData} transform={reduceMotion?`translate(${positions.get(packet.target)!.x} ${positions.get(packet.target)!.y})`:undefined}><circle r="21" fill="#a995ee" opacity=".35" filter="url(#packet-glow)"/><rect x="-17" y="-11" width="34" height="22" rx="7" fill={packet.source==='master'?'#9b86db':'#69acba'} stroke="white" strokeWidth="2"/><path d="M-9 -4 L0 2 L9 -4 M-9 -4 L-9 5 L9 5 L9 -4" fill="none" stroke="white" strokeWidth="1.6"/>{!reduceMotion&&<animateMotion ref={packetMotion} begin="indefinite" dur={`${replay ? 0.52/replaySpeed : 1.2/speed}s`} path={packetPath(positions.get(packet.source)!,positions.get(packet.target)!)} fill="freeze"/>}</g>}
      </svg>
      <button type="button" onClick={()=>onInspect('master')} aria-label="Inspect Master Agent" className={`animated-commander ${activity.commander?'commander-busy':''}`} style={{left:'50%',top:`${90/worldHeight*100}%`}}><Robot leader color="purple" active={activity.commander}/><strong>Master Agent</strong><small>{activity.commander?'Planning and coordinating…':'Assigns · monitors · improves · approves'}</small></button>
      <AnimatePresence>{agents.map((agent,i)=>{
        const point=positions.get(agent.id)!;
        const trace=workFor(prefix,agent.id);
        const isSender=packet?.source===agent.id;
        const isReceiver=packet?.target===agent.id;
        const working=agent.state==='RUNNING';
        const workMotion=activity.workers.includes(agent.id);
        const done=['COMPLETED','STANDBY'].includes(agent.state);
        const failed=agent.state==='FAILED';
        const task=prefix.find(e=>e.type==='task.created'&&e.agent_id===agent.id);
        const prerequisiteNames=(task?.payload.dependencies ?? []).map((id:string)=>names.get(prefix.find(e=>e.task_id===id&&e.type==='task.created')?.agent_id || '')).filter(Boolean);
        const lastOp=trace.operations.at(-1);
        return <motion.button key={agent.id} className={`animated-station tone-${i%3} ${working?'is-working':''} ${workMotion?'work-motion-active':''} ${done?'is-done':''} ${failed?'is-failed':''} ${isSender?'is-sending':''} ${isReceiver?'is-receiving':''}`} style={{left:`${point.x/10}%`,top:`${point.y/worldHeight*100}%`}} initial={reduceMotion?false:{opacity:0,scale:.6}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:.6}} onClick={()=>onInspect(agent.id)} aria-label={`Inspect ${agent.config.name}, ${agent.config.role}, ${agent.state.toLowerCase()}`}>
          <span className="birth-ring"/>
          <span className="station-operation">{isSender?<><Send size={12}/>Sending result</>:isReceiver?<><Package size={12}/>Receiving data</>:working?<><Settings2 size={12}/>{lastOp?.payload.operation || 'Processing input'}</>:failed?'Attempt failed':done?<><Check size={12}/>Result ready</>:prerequisiteNames.length?`Waiting for ${prerequisiteNames.join(' & ')}`:'Ready for a task'}</span>
          <Robot identity={agent.id} role={agent.config.role} active={workMotion}/><strong><bdi translate="no" dir="auto">{agent.config.name}</bdi></strong><span className="station-role">{agent.config.role}</span>
          <div className="work-signal"><span className={trace.input?'lit':''} title="Input received"><Database size={11}/></span><i/><span className={trace.operations.length?'lit':''} title="Operation performed"><Settings2 size={11}/></span><i/><span className={trace.output?'lit done':''} title="Output produced"><Package size={11}/></span></div>
          <span className="animated-state">{agent.state.toLowerCase()} {workMotion&&<span className="processing-dots"><i/><i/><i/></span>}</span>
        </motion.button>;
      })}</AnimatePresence>
      {!agents.length&&<div className="animation-empty"><SparkleIllustration/><h3>Watch the team come alive.</h3><p>Robots appear when they are created. Packets move when a task or result is delivered.</p>{!events.length&&<button onClick={onStart}><Play size={15}/>Start animated example<ArrowRight size={15}/></button>}{events.length>0&&<p>{backendStatus==='AWAITING_APPROVAL'?'The proposed team appears after you approve the plan.':['COMPLETED','FAILED','CANCELLED'].includes(backendStatus)?'No workers were created in this part of the recording.':'The master is preparing the team. Workers appear when their creation is recorded.'}</p>}</div>}
      {agents.length>0&&<div className={`result-station ${final?'result-delivered':''}`} style={{left:'50%',top:`${positions.get('result')!.y/worldHeight*100}%`}}><span>{final?<Check size={21}/>:<Package size={21}/>}</span><div><strong>{final?'Mission result delivered':'Master approval gate'}</strong><small>{final?dataCaption(final.payload.output):'Waiting for master review and final approval'}</small></div></div>}
    </div>
    {compact?<details className="map-recorded-event"><summary>Latest recorded event {current?`· #${current.sequence}`:''}<ChevronRight size={14}/></summary><div className="animation-story" aria-live="polite"><span className="story-symbol">{packet?<Send size={18}/>:operation?<Settings2 size={18}/>:<Radio size={18}/>}</span><div><span className="story-kicker">{current?`EVENT #${current.sequence} · ${packet?packet.label:operation?'TOOL OPERATION':current.type.replaceAll('.',' · ').replaceAll('_',' ')}`:'START WITH THE GUIDED EXAMPLE'}</span><strong>{packet?`${names.get(packet.source)} → ${names.get(packet.target)}`:active?`${active.config.name}: ${operation?.payload.operation || active.config.role}`:'Follow the data, one event at a time.'}</strong><HelpButton topic={packet?'communication':operationHelp(current?.type??'mission.created')} detail={current?.payload.summary}/><p>{packet?dataCaption(packet.data):current?.payload.summary || 'Use the play, pause and step controls to see how the agents cooperate.'}</p></div>{detailData&&<button onClick={inspectData}><Package size={15}/>{packetOpen?'Hide data':'Open data'}<ChevronRight size={14}/></button>}</div></details>:<div className="animation-story" aria-live="polite"><span className="story-symbol">{packet?<Send size={18}/>:operation?<Settings2 size={18}/>:<Radio size={18}/>}</span><div><span className="story-kicker">{current?`EVENT #${current.sequence} · ${packet?packet.label:operation?'TOOL OPERATION':current.type.replaceAll('.',' · ').replaceAll('_',' ')}`:'START WITH THE GUIDED EXAMPLE'}</span><strong>{packet?`${names.get(packet.source)} → ${names.get(packet.target)}`:active?`${active.config.name}: ${operation?.payload.operation || active.config.role}`:'Follow the data, one event at a time.'}</strong><HelpButton topic={packet?'communication':operationHelp(current?.type??'mission.created')} detail={current?.payload.summary}/><p>{packet?dataCaption(packet.data):current?.payload.summary || 'Use the play, pause and step controls to see how the agents cooperate.'}</p></div>{detailData&&<button onClick={inspectData}><Package size={15}/>{packetOpen?'Hide data':'Open data'}<ChevronRight size={14}/></button>}</div>}
    {packetOpen&&detailData&&<div className="packet-inspector"><div><strong>{packet?'Exact packet contents':'Actual operation data'}</strong><button aria-label="Close packet contents" onClick={()=>setPacketOpen(false)}><X size={15}/></button></div><DataPreview data={detailData}/></div>}
    {!compact&&<div className="animation-explainer"><span><i className="dispatch-key"/>Task assignment</span><span><i className="exchange-key"/>Result handoff</span><span><Settings2 size={12}/>Tool operation</span><span>Click a connection line to read its conversation. Moving packets indicate activity; recorded deliveries appear in the conversation.</span><small>{live?'LIVE AI · Model outputs and backend actions are recorded before animation.':'SIMULATION · Animations follow saved execution events. No OpenAI calls.'}</small></div>}
    {connection&&<ConnectionConversation key={connection.source+connection.target} events={prefix} source={connection.source} target={connection.target} onClose={()=>setConnection(null)}/>}
  </section>}</Translate>;
}

function SparkleIllustration(){return <Translate>{<div className="empty-orbit"><Database size={22}/><span/><Send size={22}/></div>}</Translate>;}
