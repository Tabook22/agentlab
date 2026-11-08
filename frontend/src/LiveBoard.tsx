import { Translate, formatTime } from './i18n';
import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Bot, Check, CheckCircle2, ChevronRight, CircleHelp, Clock3, Database, GitBranch, ListChecks, Pause, Play, Radio, Send, Settings2, Sparkles, XCircle } from 'lucide-react';
import { actorLabel, activityNames, agentActivity, matchesActor, matchesActivityQuery } from './activity';
import { agentsFrom, planFrom, type LabEvent } from './events';
import { dataCaption } from './animation';
import { Robot } from './Robot';
import { DataPreview } from './WorkView';
import './board.css';
import { AgentLoopBoard } from './AgentLoopBoard';
import { BudgetApprovalPanel } from './BudgetApprovalPanel';
import { executionMode } from './loops';
import { HelpButton } from './Help';
import { operationHelp } from './helpContent';
import { TeamInteraction } from './TeamInteraction';
import {LimitApprovalPanel} from './LimitApprovalPanel';

const stageIcons=[Bot,ListChecks,Database,CircleHelp,Settings2,CheckCircle2,Send];
const actionTitle=(type:string)=>({
  'mission.created':'Mission received','mission.planning':'Planning started','mission.plan_ready':'Team plan published',
  'master.decision':'Master action explained','agent.created':'Worker created','agent.ready':'Worker ready',
  'task.created':'Task defined','task.assigned':'Task assigned','agent.started':'Worker started',
  'agent.input_received':'Input received','agent.decision':'Worker action explained','agent.operation':'Tool operation',
  'agent.message_sent':'Data delivered','agent.tool_started':'Tool called','agent.tool_completed':'Tool returned output',
  'task.completed':'Task complete','agent.standby':'Worker in standby','task.failed':'Task failed',
  'task.retry_requested':'Retry requested','mission.completed':'Final result delivered',
}[type] || type.replaceAll('.',' · ').replaceAll('_',' '));

export function LiveBoard({events,replay,replayPlaying,paused,canControl,onTogglePause,onStart,onChooseMission,onShowPlan,onInspect,onRetry,onExtend,budgetMissionId,onBudgetChange,onRename,limitMissionId}: {
  limitMissionId?:string;events:LabEvent[];replay:boolean;replayPlaying:boolean;paused:boolean;canControl:boolean;
  onTogglePause:()=>void;onStart:()=>void;onChooseMission:()=>void;onShowPlan:()=>void;onInspect:(id:string)=>void;onRetry?:()=>void;onExtend?:()=>void;budgetMissionId?:string;onBudgetChange:(result:any)=>Promise<void>;onRename?:(id:string,name:string)=>Promise<void>;
}) {
  const [filter,setFilter]=useState('all');
  const [query,setQuery]=useState('');
  const [ledgerLimit,setLedgerLimit]=useState(100);
  const live=executionMode(events)==='live';
  const reduced=useReducedMotion();
  const agents=agentsFrom(events);
  const names=activityNames(events);
  const plan=planFrom(events);
  const last=events.at(-1);
  const latestStatus=events.findLast(e=>['mission.failed','mission.retry_requested','mission.planning','mission.completed','mission.limit_approval_requested'].includes(e.type));
  const failure=latestStatus?.type==='mission.failed'?latestStatus:undefined;
  const final=events.findLast(e=>e.type==='mission.completed');
  const latestMaster=events.findLast(e=>e.type==='master.decision');
  const masterDecisions=events.filter(e=>e.type==='master.decision');
  const first=events.find(e=>e.type==='mission.created');
  const workers=plan?.assignments ?? agents.map(a=>({agent_id:a.id,name:a.config.name,role:a.config.role,task:a.config.instructions,waits_for:[] as string[]}));
  const cycleLimit=events.findLast(e=>e.type==='mission.limits_extended')?.payload.max_iterations || first?.payload.limits?.max_iterations || 3;
  const cyclesExhausted=agents.filter(agent=>['FAILED','CANCELLED'].includes(agent.state)).some(agent=>Math.max(0,...events.filter(e=>e.agent_id===agent.id&&e.type==='agent.observe').map(e=>e.payload.cycle||0))>=cycleLimit);
  const savedWork=agents.map(agent=>({agent,accepted:events.findLast(e=>e.agent_id===agent.id&&e.type==='agent.output_accepted'),draft:events.findLast(e=>e.agent_id===agent.id&&e.type==='agent.act'&&typeof e.payload.artifact?.content==='string')})).filter(row=>row.accepted||row.draft);
  const filtered=events.filter(event=>matchesActor(event,filter)&&matchesActivityQuery(event,query,names)).slice().reverse();
  const moving=!reduced&&!paused&&(!replay||replayPlaying)&&!final;

  return <Translate>{<section className={`live-board ${moving?'board-moving':'board-still'}`} aria-label="Live educational activity board">
    <div className="board-toolbar"><div><span className="board-kicker"><Radio size={14}/>{replay?'RECORDED EVENT BOARD':paused?'MISSION PAUSED':'LIVE EVENT BOARD'}</span><h3>See the whole team at work.</h3></div><div className="board-buttons"><button onClick={onChooseMission}><ListChecks size={15}/>Give a mission</button>{canControl&&<button onClick={onTogglePause}>{paused?<Play size={15}/>:<Pause size={15}/>} {paused?'Resume mission':'Pause mission'}</button>}{!canControl&&!replay&&!limitMissionId&&<button onClick={onStart}><Play size={15}/>Run guided example</button>}</div></div>
    <div className="board-explanation"><CircleHelp size={17}/><p><strong>How to read this board:</strong> follow each worker from creation to delivery. Open Understand → Plan → Act → Check → Adjust → Repeat to inspect its visible world, public plan, tool actions, test evidence and repeated cycles. These are public artifacts and explanations, not private internal reasoning.</p><span>{!first?'READY TO LAUNCH':live?'LIVE AI':'SIMULATION'}</span></div>
    {limitMissionId&&<LimitApprovalPanel missionId={limitMissionId} onChange={onBudgetChange}/>}
    {failure&&!limitMissionId&&<div className="error" role="alert"><strong>{failure.payload.stop_reason==='limit_reached'?'Limit reached':failure.payload.stop_reason==='help_needed'?'Help needed':'Run stopped'}</strong> · {failure.payload.summary}{onRetry&&!cyclesExhausted&&<button onClick={onRetry}>Retry remaining work</button>}{onExtend&&cycleLimit<5&&<button onClick={onExtend}>Allow 2 more cycles and retry · same spending guard</button>}</div>}
    {!limitMissionId&&budgetMissionId&&failure&&(failure.payload.summary?.toLowerCase().includes('spending')||events.some(e=>e.type==='master.budget_approval_requested'))&&<BudgetApprovalPanel key={budgetMissionId} missionId={budgetMissionId} onChange={onBudgetChange}/>}
    {(failure||limitMissionId)&&savedWork.length>0&&<section className="saved-mission-work"><h3>Saved work · ready to continue</h3><p>Accepted outputs and drafts are preserved. The mission continues after the required admin approval.</p>{savedWork.map(row=><details key={row.agent.id}><summary>{row.agent.config.name} · {row.accepted?'Accepted task output':'Draft · final review incomplete'}</summary><DataPreview data={row.accepted?.payload.output||row.draft?.payload.artifact}/></details>)}</section>}
    <TeamInteraction playing={!paused&&(!replay||replayPlaying)&&!final} events={events} onInspect={onInspect} onRename={replay?undefined:onRename}/>
    <div className="board-stats"><span><Bot size={15}/><strong>1</strong> commander</span><span><GitBranch size={15}/><strong>{agents.length}{plan?` / ${plan.worker_count}`:''}</strong> workers created</span><span><Settings2 size={15}/><strong>{events.filter(e=>e.type==='agent.operation').length}</strong> operations</span><span><Send size={15}/><strong>{events.filter(e=>e.type==='agent.message_sent').length}</strong> handoffs</span><span><Radio size={15}/><strong>{events.length}</strong> recorded events</span></div>
    <article className="master-board-lane"><div className="master-lane-header"><div className="board-master-avatar"><Robot leader color="purple" small/></div><div><span className="board-kicker">COORDINATION LANE</span><h3>Master Agent <HelpButton topic="master"/></h3><p>Reads the intention · chooses the team · monitors drafts · improves and approves</p></div>{plan&&<button onClick={onShowPlan}>Read the full plan <ChevronRight size={14}/></button>}</div>
      <div className="master-journey">{[
        ['Mission received',!!first],['Plan explained',!!plan],['Workers created',agents.length>0],['Work dispatched',events.some(e=>e.type==='task.assigned')],['Master approval',events.some(e=>e.type==='master.final_approved')],
      ].map(([label,done],i)=><div key={String(label)} className={done?'reached':''}><span>{done?<Check size={12}/>:i+1}</span>{label}{i<4&&<ArrowRight size={12}/>}</div>)}</div>
      <div className="master-board-grid"><div><span className="board-field-label">MISSION INPUT<HelpButton topic="start"/></span><p>{first?.payload.prompt || 'Choose a mission, or start the guided example to see the entire lifecycle.'}</p>{plan&&<><span className="board-field-label">WHY THIS TEAM?<HelpButton topic="worker"/></span><p>{plan.count_reason}</p></>}</div><div className="public-decision"><span className="board-field-label"><CircleHelp size={13}/>LATEST PUBLIC ACTION EXPLANATION</span>{latestMaster?<><strong>{latestMaster.payload.action}</strong><p>{latestMaster.payload.reason}</p><details><summary>Evidence for this action · event #{latestMaster.sequence}</summary><pre>{JSON.stringify(latestMaster.payload.evidence,null,2)}</pre></details></>:<p>{events.length?'Waiting for a recorded explanation. Older missions may not contain these events.':'The Master Agent’s planning and dispatch explanations will appear here.'}</p>}</div><div><span className="board-field-label">FINAL OUTPUT<HelpButton topic="output"/></span>{final?<><p className="board-result-caption"><CheckCircle2 size={16}/>{dataCaption(final.payload.output)}</p><details><summary>Open the delivered result</summary><DataPreview data={final.payload.output}/></details></>:<p>The result appears only after a mission.completed event is recorded.</p>}<details className="master-decision-history"><summary>All Master Agent explanations ({masterDecisions.length})</summary>{masterDecisions.map(e=><div key={e.id}><strong>#{e.sequence} · {e.payload.action}</strong><p>{e.payload.reason}</p></div>)}</details></div></div>
      <AgentLoopBoard events={events} agentId="master" readOnly={replay}/>
    </article>
    <div className="board-dispatch-arrow"><GitBranch size={16}/><span>Planned worker lanes · inputs and results appear as execution events arrive</span><ArrowRight size={16}/></div>
    {workers.length?<div className="worker-board-lanes">{workers.map((worker,index)=>{
      const agent=agents.find(a=>a.id===worker.agent_id);
      const activity=agentActivity(events,worker.agent_id);
      const trace=activity.trace;
      const running=agent?.state==='RUNNING';
      const attempts=events.filter(e=>e.type==='task.assigned'&&e.agent_id===worker.agent_id).length;
      const targetEvents=events.filter(e=>e.agent_id===worker.agent_id||e.payload.sender===worker.agent_id||e.payload.receiver===worker.agent_id);
      const current=targetEvents.at(-1);
      const finalSource=!!final&&(final.payload.source_agent_ids ? final.payload.source_agent_ids.includes(worker.agent_id) : events.findLast(e=>e.type==='task.completed')?.agent_id===worker.agent_id);
      return <motion.article key={worker.agent_id} initial={reduced?false:{opacity:0,y:12}} animate={{opacity:1,y:0}} className={`worker-board-lane ${running?'lane-running':''} ${trace.error&&!trace.output?'lane-error':''}`}>
        <div className="worker-lane-header"><Robot identity={worker.agent_id} role={worker.role} small active={running&&moving}/><div><span className="board-kicker">WORKER {index+1}</span><h3><bdi translate="no" dir="auto">{worker.name}</bdi></h3><p>{worker.role}</p><span className={`lane-state state-${agent?.state.toLowerCase() || 'planned'}`}>{agent?agent.state.toLowerCase():'Planned · not created yet'}{attempts>1?` · attempt ${attempts}`:''}</span></div>{agent&&<button onClick={()=>onInspect(agent.id)} aria-label={`Inspect board agent ${worker.name}`}><Bot size={17}/></button>}</div>
        <ol className="board-lifecycle" aria-label={`${worker.name} recorded lifecycle`}>{activity.stages.map((stage,i)=>{const Icon=stageIcons[i];return <li key={stage.type} className={stage.occurred?'stage-recorded':''}><span><Icon size={12}/></span><small>{stage.label}</small><HelpButton topic={operationHelp(stage.type)}/></li>;})}</ol>
        <div className="board-task"><span className="board-field-label">ASSIGNED TASK<HelpButton topic="worker"/></span><p>{activity.assignment?.payload.summary || worker.task}</p>{!activity.assignment&&<small>{worker.waits_for.length?`Waiting for ${worker.waits_for.join(' and ')} before assignment.`:'Not assigned yet.'}</small>}</div>
        <AgentLoopBoard events={events} agentId={worker.agent_id} readOnly={replay}/>
        <div className="board-input"><span className="board-field-label"><Database size={13}/>INPUT RECEIVED<HelpButton topic="input"/></span>{trace.input?<><small>{trace.input.payload.source_agents?.length?`From ${trace.input.payload.source_agents.map((id:string)=>names.get(id) || 'a predecessor').join(', ')}`:live?'From the commander: mission and assigned task':'From the commander’s fixture-read request'}</small><DataPreview data={trace.input.payload.input}/></>:<p>No input received yet.</p>}</div>
        <div className="public-decision worker-decision"><span className="board-field-label"><CircleHelp size={13}/>WHY THIS ACTION?</span>{activity.decision?<><strong>{activity.decision.payload.action}</strong><p>{activity.decision.payload.reason}</p><details><summary>Recorded evidence · #{activity.decision.sequence}</summary><pre>{JSON.stringify(activity.decision.payload.evidence,null,2)}</pre></details></>:<p>No action explanation has been recorded for this attempt.</p>}</div>
        <div className="board-operations"><span className="board-field-label"><Settings2 size={13}/>OPERATIONS ACTUALLY PERFORMED<HelpButton topic="act"/></span>{trace.operations.length?<ol>{trace.operations.map(op=><li key={op.id}><span>{op.payload.step}</span><div><strong>{op.payload.operation}</strong><HelpButton topic={String(op.payload.operation).includes('research')?'research':'act'} detail={op.payload.summary}/><p>{op.payload.summary}</p><small>Event #{op.sequence} · {formatTime(op.timestamp)}</small><details><summary>Intermediate values</summary><DataPreview data={op.payload.value}/></details></div></li>)}</ol>:<p>No operation has run yet.</p>}</div>
        <div className="board-output"><span className="board-field-label"><CheckCircle2 size={13}/>OUTPUT PRODUCED<HelpButton topic="output"/></span>{trace.output?<><p>{dataCaption(trace.output.payload.output)}</p><details><summary>Open output values</summary><DataPreview data={trace.output.payload.output}/></details></>:<p>No output produced yet.</p>}{trace.error&&!trace.output&&<p className="board-error"><XCircle size={15}/>{trace.error.payload.summary}</p>}</div>
        <div className="board-deliveries"><span className="board-field-label"><Send size={13}/>DELIVERY<HelpButton topic="communication"/></span>{trace.outgoing.map(e=><details key={e.id}><summary>{worker.name} → {names.get(e.payload.receiver) || 'next worker'} · delivered #{e.sequence}</summary><DataPreview data={e.payload.data}/></details>)}{finalSource&&<p><CheckCircle2 size={14}/>The Master Agent used this accepted output in the final mission result.</p>}{!trace.outgoing.length&&!finalSource&&<p>{trace.output?'Saved; no onward delivery event yet.':'Nothing sent yet.'}</p>}</div>
        <div className="lane-last-event"><Clock3 size={12}/>{current?`Latest: #${current.sequence} · ${actionTitle(current.type)}`:'Awaiting worker creation'}</div>
      </motion.article>;
    })}</div>:<div className="board-empty-team"><Bot size={30}/><h3>Watch every stage on one board.</h3><p>Start the guided example. The Master Agent will publish a plan, create workers, assign tasks and record each input, explanation, operation and result here.</p></div>}
    <section className="activity-ledger"><div className="ledger-heading"><div><span className="board-kicker">EVERY OBSERVABLE ACTION</span><h3>Complete activity ledger</h3></div><span>{filtered.length} / {events.length} events</span></div><div className="ledger-controls"><label>Actor<select aria-label="Filter activity by actor" value={filter} onChange={e=>{setFilter(e.target.value);setLedgerLimit(100);}}><option value="all">All actors</option><option value="master">Master Agent</option>{workers.map(w=><option key={w.agent_id} value={w.agent_id}>{w.name}</option>)}</select></label><label>Find an action<input aria-label="Search activity ledger" placeholder="Try input, average, retry…" value={query} onChange={e=>{setQuery(e.target.value);setLedgerLimit(100);}}/></label><span>Newest first · open any row for the saved event</span></div><div className="ledger-latest" aria-live="polite">{last?`Latest recorded event #${last.sequence}: ${last.payload.summary || actionTitle(last.type)}`:'Waiting for the first mission event.'}</div><div className="ledger-rows">{filtered.slice(0,ledgerLimit).map(event=><details key={event.id} className={`ledger-event ${event.id===last?.id?'newest-event':''} ${event.type.includes('failed')?'ledger-failure':''}`}><summary><span className="ledger-sequence">#{event.sequence}</span><time>{formatTime(event.timestamp)}</time><span className="ledger-actor">{actorLabel(event,names)}</span><span className="ledger-action"><strong>{actionTitle(event.type)}</strong><HelpButton topic={operationHelp(event.type)} detail={event.payload.summary}/><span>{event.payload.summary}</span></span><ChevronRight size={13}/></summary><div className="ledger-detail">{event.payload.reason&&<div><strong>Public explanation · {event.payload.source}</strong><p>{event.payload.reason}</p></div>}<pre>{JSON.stringify(event,null,2)}</pre></div></details>)}{filtered.length>ledgerLimit&&<button type="button" className="conversation-older" onClick={()=>setLedgerLimit(n=>n+100)}>Show 100 older events ({filtered.length-ledgerLimit} remaining)</button>}{!filtered.length&&<p className="ledger-empty">{events.length?'No events match this filter.':'The full event history will appear here as the mission runs.'}</p>}</div></section>
    <div className="board-footnote">The board displays saved backend events in real time. Replay uses the same events without new API calls. {live?'Worker plans and rubric reviews come from the configured model; tool actions are executed by the backend. Rubric acceptance is not an external fact check.':'Simulation uses programmed classroom operations and summaries.'}</div>
  </section>}</Translate>;
}
