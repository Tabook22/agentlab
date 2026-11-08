import { ArrowDown, ArrowUp, CheckCircle2, GitBranch, ShieldCheck } from 'lucide-react';
import { agentsFrom, planFrom, type LabEvent } from './events';
import { Robot } from './Robot';
import './team.css';
import {WorkerNameEditor} from './WorkerNameEditor';
import { useState } from 'react';
import { workAnimation } from './animation';
import { HelpButton } from './Help';
import { ConnectionConversation } from './ConnectionConversation';
import { ActivityPackets } from './ActivityPackets';

export function TeamInteraction({events,onInspect,onRename,playing=true}:{events:LabEvent[];onInspect:(id:string)=>void;onRename?:(id:string,name:string)=>Promise<void>;playing?:boolean}) {
  const [connection,setConnection]=useState<string|null>(null);
  const [motionOverride,setMotionOverride]=useState(true);
  const motionOn=motionOverride;
  const activity=workAnimation(events,'RUNNING',false,playing,false,!motionOn);
  const plan=planFrom(events);
  const agents=agentsFrom(events);
  const mission=events.find(e=>e.type==='mission.created');
  const approved=events.findLast(e=>e.type==='master.final_approved');
  const improved=events.findLast(e=>e.type==='master.improved');
  const submitted=events.filter(e=>e.type==='agent.review_requested');
  const stopped=events.findLast(e=>['mission.failed','mission.cancelled','mission.completed','mission.planning','mission.retry_requested','mission.limit_approval_requested'].includes(e.type));
  const blocked=stopped&&['mission.failed','mission.cancelled'].includes(stopped.type);
  const workers=plan?.assignments??agents.map(a=>({agent_id:a.id,name:a.config.name,role:a.config.role,task:a.config.instructions}));
  const phases=[['Read the mission',!!mission],['Choose the team',!!plan],['Delegate and monitor',events.some(e=>e.type==='task.assigned')],['Review and improve',!!submitted.length||!!improved],['Approve final answer',!!approved]] as const;
  return <section className={`team-interaction ${motionOverride===true?'team-motion-opt-in':''}`} aria-label="Master Agent collaboration and approval">
    <div className="team-heading"><div><span className="board-kicker">FOLLOW THE COLLABORATION</span><h3>Every draft comes back to the master.</h3><p>Workers submit their work for review. The master requests changes or accepts it, improves the combined answer, then approves the final result.</p></div><ShieldCheck size={28}/></div>
    <ol className="team-phases">{phases.map(([label,done],i)=><li key={label} className={done?'phase-done':''}><span>{done?<CheckCircle2 size={15}/>:i+1}</span>{label}</li>)}</ol>
    <div className={`team-master ${activity.commander?'team-agent-active':''}`}><Robot leader color="purple" small active={activity.commander}/><div><span className="board-kicker">MASTER AGENT<HelpButton topic="master"/></span><h3>{stopped?.type==='mission.limit_approval_requested'?'Paused · awaiting admin limit approval':approved?'Final answer approved':blocked?'Stopped before final approval':improved?'Reviewing the improved answer':submitted.length?'Monitoring and reviewing submissions':plan?'Delegating the mission':'Understanding the intention'}</h3><p>{plan?.scenario_scope||mission?.payload.prompt||'Give the master a mission to see the collaboration begin.'}</p></div><span className="team-count">{workers.length} workers</span></div>
    {plan&&<div className="team-rationale"><GitBranch size={16}/><div><strong>Why this team?</strong><p>{plan.count_reason}</p><small>Task-specific team · workers run in dependency order</small></div></div>}
    <div className="team-motion-toolbar"><span><i className={activity.workers.length||activity.commander?'traffic-live':''}/>{!playing?'Activity paused':activity.workers.length||activity.commander?'Agents at work - live activity':'Waiting for agent activity'}</span><button onClick={()=>setMotionOverride(!motionOn)} aria-pressed={motionOn}>{motionOn?'Motion on':'Motion off'}</button></div>
    <p className="team-traffic-note">Click a connection line to read the assignments, drafts and feedback exchanged on it.</p>
    <div className="team-connections"><HelpButton topic="communication"/><span><ArrowDown size={14}/> Assignment and feedback</span><span><ArrowUp size={14}/> Draft and review request</span></div>
    <div className="team-workers">{workers.map((worker,i)=>{
      const review=events.findLast(e=>e.type==='master.review_completed'&&e.payload.worker_id===worker.agent_id);
      const request=events.findLast(e=>e.type==='agent.review_requested'&&e.agent_id===worker.agent_id);
      const agent=agents.find(a=>a.id===worker.agent_id);
      const pending=request&&(!review||request.sequence>review.sequence);
      const accepted=review?.payload.approved&&!pending;
      const working=activity.workers.includes(worker.agent_id);
      return <div className={`team-worker-branch ${working?'branch-active':''}`} key={worker.agent_id}><svg viewBox="0 0 240 80" className="team-traffic-link" aria-label={'Open conversation between Master Agent and '+worker.name} role="button" tabIndex={0} onClick={()=>setConnection(worker.agent_id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setConnection(worker.agent_id);}}}><path d="M 106 0 V 80" className="traffic-down"/><path d="M 134 80 V 0" className="traffic-up"/>{working&&<ActivityPackets path="M 106 0 V 80" reversePath="M 134 80 V 0"/>}</svg><article key={worker.agent_id} className={`team-worker ${working?'team-agent-active':''} ${accepted?'worker-approved':pending?'worker-reviewing':''}`}>
        <div className="team-worker-top"><Robot identity={worker.agent_id} role={worker.role} small active={working}/><button onClick={()=>onInspect(worker.agent_id)} disabled={!agent}><bdi translate="no" dir="auto">{worker.name}</bdi></button></div>
        {agent&&onRename&&<WorkerNameEditor name={worker.name} onSave={name=>onRename(worker.agent_id,name)}/>}
        <small>{worker.role}<HelpButton topic="worker" detail={worker.task}/></small><p>{worker.task}</p>
        <div className="team-worker-status">{agent?.state==='WAITING_LIMIT'?'Paused · awaiting admin limit approval':pending?'Draft with master · awaiting review':review?accepted?'Master accepted this task':'Master requested improvement':agent?.state==='RUNNING'?'Working on the assignment':'Waiting for assignment'}</div>
        {review&&<details><summary>Master feedback</summary><p>{review.payload.data.feedback}</p>{review.payload.data.checks.map((check:any,j:number)=><p key={j}>{check.passed?'✓':'↻'} {check.criterion}: {check.evidence}</p>)}</details>}
        <div className="team-exchanges">{events.filter(e=>(e.type==='agent.review_requested'&&e.agent_id===worker.agent_id)||(e.type==='master.review_completed'&&e.payload.worker_id===worker.agent_id)).slice(-4).map(e=><small key={e.id}>{e.type==='agent.review_requested'?<ArrowUp size={12}/>:<ArrowDown size={12}/>}#{e.sequence} · {e.type==='agent.review_requested'?'Draft sent to master':e.payload.approved?'Approval returned':'Revision feedback returned'}</small>)}</div>
      </article></div>;
    })}</div>
    <div className={`team-approval ${approved?'approval-granted':''}`} role="status"><ShieldCheck size={22}/><div><strong>{approved?'Master approval recorded':'Final answer awaiting master approval'}</strong><HelpButton topic="output"/><p>{approved?approved.payload.summary:improved?'The master improved the answer. Final mission checks must pass before delivery.':'Task completion alone does not approve the final answer.'}</p></div></div>
    {connection&&<ConnectionConversation key={connection} events={events} source="master" target={connection} onClose={()=>setConnection(null)}/>}
  </section>;
}
