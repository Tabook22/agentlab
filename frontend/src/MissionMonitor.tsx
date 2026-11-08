import { HelpButton } from './Help';
import {useEffect,useState} from 'react';
import {Activity,ArrowDown,CheckCircle2,Clock3,Wifi,WifiOff} from 'lucide-react';
import {Translate,formatTime} from './i18n';
import {missionProgress} from './monitor';
import type {LabEvent} from './events';

export type StreamState='connecting'|'connected'|'reconnecting'|'closed';
export function MissionMonitor({events,status,connection,replay,onBoard,onWorld}:{events:LabEvent[];status:string;connection:StreamState;replay:boolean;onBoard:()=>void;onWorld:()=>void}){
 const [now,setNow]=useState(Date.now());
 const limitWaiting=status==='AWAITING_LIMIT_APPROVAL';
 const awaiting=status==='AWAITING_APPROVAL';
 const clarifying=status==='AWAITING_CLARIFICATION';
 const active=!['COMPLETED','FAILED','CANCELLED','AWAITING_APPROVAL','AWAITING_LIMIT_APPROVAL','AWAITING_CLARIFICATION'].includes(status);
 useEffect(()=>{if(!active||replay)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[active,replay]);
 const progress=missionProgress(events);
 const openEnded=events.some(e=>e.type==='mission.execution_opened'||e.type==='mission.created'&&e.payload.limits?.open_ended);
 const usage=events.findLast(e=>e.payload.usage)?.payload.usage??events.findLast(e=>e.type==='mission.plan_approval_requested')?.payload.estimate?.planning_usage;
 const continuationEstimate=events.findLast(e=>e.type==='mission.execution_opened'&&e.payload.estimate)?.payload.estimate;
 const failed=events.findLast(e=>e.type==='mission.failed');
 const paused=status==='PAUSED';
 const pending=active&&!paused?progress.pending:undefined;
 const retrying=progress.last?.type==='model.retry_scheduled';
 const age=progress.last?Math.max(0,Math.floor((now-Date.parse(progress.last.timestamp))/1000)):0;
 const headline=clarifying?'The master needs your clarification before planning':limitWaiting?'Limit reached — mission paused for admin approval':awaiting?'Plan ready — your approval is required':status==='COMPLETED'?'Mission complete — your result is ready':status==='FAILED'?'Mission stopped — action needed':status==='CANCELLED'?'Mission cancelled':replay?'Recorded mission replay':paused?'Mission paused':'Your mission is running';
 return <Translate><section id="mission-monitor" className={`mission-monitor ${active&&!paused&&!replay?'monitor-active':''}`} aria-label="Mission progress monitor">
  <div className="monitor-heading"><div><span className="monitor-kicker"><Activity size={15}/>MISSION MONITOR</span><h1>{headline}<HelpButton topic="guide"/></h1></div><span className="monitor-connection">{connection==='connected'&&!replay?<Wifi size={16}/>:<WifiOff size={16}/>} {clarifying?'Waiting for your answer · no workers assigned':limitWaiting?'Saved work · awaiting admin':awaiting?'Workers have not started':replay?'Replay · saved events':!active?'Run ended':connection==='connected'?'Live updates connected':connection==='reconnecting'?'Reconnecting · updates may be delayed':'Connecting to live updates…'}</span></div>
  <p className="monitor-next">{clarifying?'Answer the master’s question in the clarification panel. Your answer will guide mission understanding and the team plan.':limitWaiting?'Review the master’s recommendation below. Approve a higher allowance to continue this same mission. Your saved work is kept.':awaiting?'Read the commander report below. Approve its team, workflow and total cap to start workers, or decline to revise the mission.':status==='COMPLETED'?'Open the delivered result below. You can inspect each worker’s saved work.':status==='FAILED'?failed?.payload.summary||'Open the board below for the recorded stop reason.':paused?'Resume the mission from the board controls when you are ready.':status==='CANCELLED'?'The recorded work remains available below.':replay?'This view shows recorded actions. It does not run agents or make new API calls.':'You do not need to press anything else. Watch the commander and workers below; respond only if they ask for help or approval.'}</p>
  <div className="monitor-facts"><div><strong>{progress.total?`${progress.completed} / ${progress.total}`:'—'}</strong><span>Tasks completed<HelpButton topic="output"/></span></div><div><strong>{progress.agents.length}</strong><span>Workers created<HelpButton topic="worker"/></span></div><div><strong>{progress.handoffs}</strong><span>Information handoffs<HelpButton topic="communication"/></span></div><div><strong>{events.length}</strong><span>Recorded events<HelpButton topic="replay"/></span></div></div>
  {usage&&<div className="execution-cost"><HelpButton topic="cost"/><strong>Estimated API cost so far: ${Number(usage.estimated_cost_usd??0).toFixed(4)}</strong><span>{usage.calls??0} model calls · {usage.reported_tokens??0} reported tokens</span><small>{openEnded?'Open-ended execution · no app resource caps':'Recorded usage'}</small></div>}
  {continuationEstimate&&active&&<p className="monitor-progress-note">Estimated total after the next continuation pass: ${continuationEstimate.estimated_total_low_usd.toFixed(2)} – ${continuationEstimate.estimated_total_high_usd.toFixed(2)}. Further revisions may increase this; it is not a spending cap.</p>}
  {progress.total>0&&<><progress aria-label="Completed tasks" max={progress.total} value={progress.completed}/><p className="monitor-progress-note">Task progress is based on completed tasks. The commander still checks the whole mission before declaring success.</p></>}
  <div className="monitor-current" aria-live="polite"><strong>{pending?`${progress.actor} · request in progress`:progress.last?'Latest recorded action':'Mission accepted · waiting for the first event'}</strong><p>{(retrying?progress.last?.payload.summary:pending?.payload.summary)||progress.last?.payload.summary||'The live board will update automatically when the backend records an action.'}</p>{pending&&<small><Clock3 size={13}/>Waiting for the tool or model response. A request can take time; no intermediate result has been received yet.</small>}{progress.last&&<small>Event #{progress.last.sequence} · {formatTime(progress.last.timestamp)}</small>}</div>
  {active&&!paused&&!replay&&age>=30&&<p className="monitor-waiting">{connection==='connected'?'No new event for over 30 seconds. The last recorded request may still be running; this is not evidence of further progress.':'The live connection is interrupted. Wait for reconnection before relying on the displayed status.'}</p>}
  <div className="monitor-guide"><span><CheckCircle2 size={15}/>1. Commander explains the team</span><span>2. Workers publish plans and use tools</span><span>3. Results are checked and shared</span></div>
  <div className="monitor-actions"><HelpButton topic="control"/><button onClick={onBoard}><ArrowDown size={15}/>{replay?'Inspect agent boards':'Follow agents live'}</button><button onClick={onWorld}>{replay?'Inspect recorded handoffs':'Watch animated handoffs'}</button></div>
  <p className="monitor-progress-note">Open a worker’s Understand, Plan, Act, Check, Adjust, and Repeat tabs to inspect its inputs, brief public plan, tool results, and verification. Private internal reasoning is not displayed.</p>
 </section></Translate>;
}
