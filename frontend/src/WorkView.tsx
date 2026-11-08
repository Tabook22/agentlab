import { Translate, formatTime } from './i18n';
import { useState } from 'react';
import { ArrowRight, Bot, CheckCircle2, Clock3, Database, Play, Send, Settings2, XCircle } from 'lucide-react';
import { agentsFrom, workFor, type LabEvent } from './events';
import { executionMode } from './loops';
import { HelpButton } from './Help';
import { ResearchText, ResearchSources } from './ResearchText';

export function DataPreview({data}: {data: Record<string, any>}) {
  return <Translate>{<div className="data-preview">
    {typeof data.content==='string'&&<ResearchText content={data.content} citations={data.citations}/>}
    {data.content&&typeof data.content==='object'&&<details><summary>Scoped context values</summary><pre>{JSON.stringify(data.content,null,2)}</pre></details>}
    <ResearchSources sources={data.sources}/>
    {data.result!==undefined&&<p><strong>Calculated result: {String(data.result)}</strong></p>}
    {data.expression&&<p>{data.expression}</p>}
    {data.accepted===false&&<p>Draft · not accepted yet</p>}
    {data.accepted===true&&<p className="verified"><CheckCircle2 size={14}/>Accepted against task criteria</p>}
    {data.mission&&<p>{data.mission}</p>}
    {data.assigned_task&&<p>{data.assigned_task}</p>}
    {data.dependency_outputs&&<p>{data.dependency_outputs.length} scoped predecessor output(s)</p>}
    {Array.isArray(data.limitations)&&data.limitations.length>0&&<ul className="artifact-limitations">{data.limitations.map((item:string,i:number)=><li key={i}>{item}</li>)}</ul>}
    {data.source && <p><Database size={14}/>{data.source}</p>}
    {data.request && <p>{data.request}</p>}
    {data.task && <p>{data.task}</p>}
    {Array.isArray(data.scores) && <div><span className="data-label">Scores</span><div className="value-chips">{data.scores.map((value:number,i:number)=><span key={i}>{value}</span>)}</div></div>}
    {Array.isArray(data.temperatures) && !data.rows && <div><span className="data-label">Synthetic temperatures</span><div className="value-chips">{data.temperatures.map((value:number,i:number)=><span key={i}>{data.days?.[i]} {value}°</span>)}</div></div>}
    {Array.isArray(data.rows) && <table><caption>Chart-ready rows</caption><thead><tr><th>Day</th><th>Temperature</th></tr></thead><tbody>{data.rows.map((row:any,i:number)=><tr key={i}><td>{row.day}</td><td>{row.temperature}°</td></tr>)}</tbody></table>}
    <div className="calculation-values">{[['sum','Total'],['count','Count'],['mean','Average']].map(([key,label])=>data[key] !== undefined && <div key={key}><span>{label}</span><strong>{data[key]}</strong></div>)}</div>
    {data.lesson && <p>{data.lesson}</p>}
    {Array.isArray(data.sections) && <ol>{data.sections.map((sentence:string,i:number)=><li key={i}>{sentence}</li>)}</ol>}
    {Array.isArray(data.checks) && <ul className="verification-checks">{data.checks.map((check:any,i:number)=><li key={i}>{check.passed?<CheckCircle2 size={15}/>:<XCircle size={15}/>} {check.check ?? check.criterion}</li>)}</ul>}
    {data.verified === true && <p className="verified"><CheckCircle2 size={15}/>Verification passed</p>}
    <details className="raw-data"><summary>Exact data (JSON)</summary><pre>{JSON.stringify(data,null,2)}</pre></details>
  </div>}</Translate>;
}

export function WorkView({events, onStart, onInspect, replay, paused, canPause, onTogglePause}: {events:LabEvent[];onStart:()=>void;onInspect:(id:string)=>void;replay:boolean;paused:boolean;canPause:boolean;onTogglePause:()=>void}) {
  const live=executionMode(events)==='live';
  const [pinned,setPinned] = useState<string|null>(null);
  const agents = agentsFrom(events);
  const lastWorker = events.findLast(e => e.agent_id && ['agent.input_received','agent.operation','agent.tool_completed','task.failed'].includes(e.type));
  const agent = agents.find(a=>a.id===pinned) ?? agents.find(a=>a.id===lastWorker?.agent_id) ?? agents[0];
  const names = new Map(agents.map(a=>[a.id,a.config.name]));
  const taskEvents = events.filter(e=>e.type==='task.created');

  if (!agent) return <Translate>{<section className="work-view work-intro">
    <span className="work-kicker">START HERE · WATCH A CALCULATION HAPPEN</span>
    <h3>What happens inside an agent?</h3>
    <p>Follow the data through three visible steps. Every value you see during a run comes from a saved backend event.</p>
    <div className="intro-pipeline"><span><Database size={24}/><strong>1. Input</strong>What did it receive?</span><ArrowRight size={19}/><span><Settings2 size={24}/><strong>2. Process</strong>What operation did it run?</span><ArrowRight size={19}/><span><Send size={24}/><strong>3. Result</strong>What does it pass on?</span></div>
    <div className="guided-example"><strong>Try the guided score experiment</strong><p>Pixel loads scores → Nova calculates their average → Scout checks it. You can pause and inspect every step.</p><button className="launch" onClick={onStart}><Play size={16}/>Start guided example<ArrowRight size={16}/></button></div>
    <p className="simulation-note">SIMULATION · Actual local calculations with synthetic data. No language model is called.</p>
  </section>}</Translate>;

  const trace = workFor(events,agent.id);
  const lastOperation = trace.operations.at(-1);
  const assignment = taskEvents.find(e=>e.agent_id===agent.id);
  const dependencies:string[] = assignment?.payload.dependencies ?? [];
  const prerequisiteNames = dependencies.map(id => names.get(taskEvents.find(e=>e.task_id===id)?.agent_id || '') || 'prerequisite agent');
  const relevant = events.filter(e=>['agent.input_received','agent.operation','agent.message_sent','task.failed','task.retry_requested','task.completed'].includes(e.type));

  return <Translate>{<section className="work-view">
    <div className="work-follow"><span><i className={paused?'paused':''}/>{replay?'Recorded work':paused?'Execution paused':'Following backend events'}</span><div className="work-actions">{canPause&&<button onClick={onTogglePause}>{paused?'Resume mission':'Pause mission'}</button>}<button onClick={()=>setPinned(null)} aria-pressed={!pinned}>{pinned?'Follow current agent':'Auto-follow is on'}</button></div></div>
    <div className="agent-pipeline" aria-label="Agent task order">{agents.map((a,i)=><div key={a.id} className="pipeline-item"><button className={agent.id===a.id?'focused':''} aria-pressed={agent.id===a.id} onClick={()=>setPinned(a.id)}><span>{i+1}</span><strong><bdi translate="no" dir="auto">{a.config.name}</bdi></strong><small>{a.config.role}</small><em>{a.state.toLowerCase()}</em></button>{i<agents.length-1&&<ArrowRight size={16}/>}</div>)}</div>
    <div className="work-assignment"><div><span className="work-kicker">{agent.config.name.toUpperCase()}’S ASSIGNMENT</span><h3>{assignment?.payload.summary || agent.config.instructions}</h3></div><button onClick={()=>onInspect(agent.id)}><Bot size={15}/>Inspect agent</button></div>
    {!trace.input && <p className="waiting-explanation"><Clock3 size={16}/>{trace.output?'This older recording has no detailed input events. Start a new mission to see the full input → process → result sequence.':prerequisiteNames.length?`Waiting for ${prerequisiteNames.join(' and ')}. This agent cannot start until the required result arrives.`:'Waiting for the commander to assign this task.'}</p>}
    <div className="work-stages">
      <article className={trace.input?'stage has-data':'stage'}><h4><Database size={16}/><span>1. Input received</span><HelpButton topic="input"/>{trace.input&&<CheckCircle2 size={15}/>}</h4><p className="stage-explanation">{trace.input ? trace.input.payload.source_agents.length ? `From ${trace.input.payload.source_agents.map((id:string)=>names.get(id) || 'another agent').join(', ')}`:executionMode(events)==='live'?'From the commander: mission and assigned task':'From the commander: a local fixture request' : 'Nothing received yet.'}</p>{trace.input&&<DataPreview data={trace.input.payload.input}/>}</article>
      <article className={trace.operations.length?'stage processing has-data':'stage processing'}><h4><Settings2 size={16}/><span>2. Process the input</span><HelpButton topic="act"/></h4><p className="stage-explanation">{trace.error&&!trace.output?'The attempt failed; no result was produced.':trace.operations.length?'Operations the local tool actually performed.':'Operations will appear here when they run.'}</p>{trace.error&&!trace.output&&<p className="work-failure">{trace.error.payload.summary}</p>}<ol className="operation-list">{trace.operations.map(op=><li key={op.id}><strong>{op.payload.operation}</strong><HelpButton topic={String(op.payload.operation).includes('research')?'research':'act'} detail={op.payload.summary}/><p>{op.payload.summary}</p><small>Event #{op.sequence} · {formatTime(op.timestamp)}</small></li>)}</ol>{lastOperation&&<><span className="data-label">Intermediate result · step {lastOperation.payload.step}</span><DataPreview data={lastOperation.payload.value}/></>}</article>
      <article className={trace.output?'stage has-data output-stage':'stage output-stage'}><h4><Send size={16}/><span>3. Result & handoff</span><HelpButton topic="communication"/>{trace.output&&<CheckCircle2 size={15}/>}</h4><p className="stage-explanation">{trace.output?'The tool returned this exact output.':'No output yet. Nothing has been sent onward.'}</p>{trace.output&&<DataPreview data={trace.output.payload.output}/>}<div className="handoff-list">{trace.outgoing.map(message=><div key={message.id} className="handoff" role="status"><Send size={15}/><span><strong>{agent.config.name} → {names.get(message.payload.receiver) || 'next agent'}</strong><small>Delivered this result · event #{message.sequence}</small></span></div>)}{trace.output&&!trace.outgoing.length&&<p>{events.some(e=>e.type==='mission.completed')?'Available to the commander as the final result.':'Result saved. Waiting for the next handoff or mission completion.'}</p>}</div></article>
    </div>
    <details className="work-timeline" open><summary>Follow the story · {relevant.length} work events</summary><div>{relevant.length?relevant.slice(-12).map(event=><button key={event.id} onClick={()=>event.agent_id&&setPinned(event.agent_id)}><span>#{event.sequence}</span><div><strong>{event.type==='agent.message_sent'?`${names.get(event.payload.sender)} → ${names.get(event.payload.receiver)}`:names.get(event.agent_id || '') || 'Commander'}</strong><p>{event.payload.summary}</p></div><time>{formatTime(event.timestamp)}</time></button>):<p>Waiting for the first input event.</p>}</div></details>
    <p className="simulation-note">{live?'LIVE AI':'SIMULATION'} · These are saved inputs, public plans, tool operations and outputs—not private internal reasoning. Old recordings may lack the detailed work events; start a new mission to see them.</p>
  </section>}</Translate>;
}
