import { HelpButton } from './Help';
import { Translate } from './i18n';
import { ArrowRight, Bot, CheckCircle2, GitBranch, ListChecks } from 'lucide-react';
import type { LabEvent } from './events';
import { planFrom } from './events';
import './plan.css';
import { PlanApprovalReport } from './PlanApprovalReport';

export function MissionPlan({events,onInspect,canApprove=false,onDecision,onDiscuss}:{events:LabEvent[];onInspect:(id:string)=>void;canApprove?:boolean;onDiscuss?:()=>void;onDecision?:(action:'approve'|'decline',planId:string,cap?:number,names?:Record<string,string>)=>Promise<void>}) {
  const plan=planFrom(events);
  const report=events.findLast(e=>e.type==='mission.plan_approval_requested');
  if(!plan) return <Translate>{events.some(e=>e.type==='mission.plan_ready')?<section className="panel plan-legacy"><Bot size={18}/><p>This older mission has no saved planning explanation. Launch a new mission to see why its team was chosen.</p></section>:null}</Translate>;
  const created=new Set(events.filter(e=>e.type==='agent.created').map(e=>e.agent_id));
  return <Translate>{<section id="commander-plan-report" className={`panel master-plan ${report?'approval-plan':''}`} aria-label="Master Agent mission plan">
    {report&&<PlanApprovalReport onDiscuss={onDiscuss} request={report} events={events} canApprove={canApprove} onDecision={onDecision}/>}
    <details className="journey-plan-details" open={!report||undefined}><summary>Explore the full team plan</summary>
    {report&&<div className="plan-scope"><strong>Mission submitted for analysis</strong><p>{plan.requested_objective}</p></div>}
    <div className="plan-heading"><span className="plan-commander"><Bot size={24}/></span><div><span className="plan-eyebrow">MASTER AGENT’S PLAN</span><h2>Why {plan.worker_count} worker agents?</h2></div><span className="plan-count">{plan.commander_count} commander + {plan.worker_count} workers</span></div>
    <blockquote>{plan.count_reason}</blockquote>
    <div className="plan-scope"><strong>What this team will deliver</strong><p>{plan.scenario_scope}</p><small>{plan.basis==='openai_mission_plan'?'Live AI · the commander generated this validated team from the submitted mission and configured worker limit.':'Classroom simulation · selected scenario rules determine this plan. The typed mission is recorded; OpenAI is not choosing the team.'}</small></div>
    <div className="plan-division-heading"><ListChecks size={17}/><h3>How I divided the work<HelpButton topic="worker"/></h3><span>Planned responsibilities</span></div>
    <ol className="plan-assignments">{plan.assignments.map((assignment,index)=><li key={assignment.task_id}><div className="assignment-heading"><span>{index+1}</span><div><strong><bdi translate="no" dir="auto">{assignment.name}</bdi></strong><small>{assignment.role}</small></div>{created.has(assignment.agent_id)&&<button onClick={()=>onInspect(assignment.agent_id)} aria-label={`Inspect planned agent ${assignment.name}`}><Bot size={16}/></button>}</div><p className="assignment-reason">{assignment.why_separate}</p><p><strong>Assigned task:</strong> {assignment.task}</p><dl><dt>Input</dt><dd>{assignment.receives}</dd><dt>Work</dt><dd>{assignment.performs}</dd><dt>Output</dt><dd>{assignment.produces}</dd></dl>{report&&<div className="assignment-criteria"><strong>Completion criteria</strong><ul>{report.payload.worker_plan.tasks[index].acceptance_criteria.map((criterion:string)=><li key={criterion}>{criterion}</li>)}</ul><p>Allowed tools: {report.payload.worker_plan.tasks[index].tools.join(", ")}</p></div>}<div className="assignment-dependency"><GitBranch size={13}/>{assignment.waits_for.length?`Waits for ${assignment.waits_for.join(' and ')}`:'Starts without another worker’s result'}</div><div className="assignment-recipient"><ArrowRight size={13}/>Sends to {assignment.sends_to.join(' and ')}</div></li>)}</ol>
    <div className="plan-delivery"><CheckCircle2 size={17}/><div><strong>How I will know the mission is complete</strong><p>{plan.success_criteria}</p></div></div>
    <details className="plan-tradeoffs"><summary>Could I use fewer or more agents?</summary><div><article><h4>A smaller team</h4><p>{plan.fewer_agents}</p></article><article><h4>A larger team</h4><p>{plan.more_agents}</p></article></div><p className="plan-count-note">These are alternative designs, not extra agents running in this mission. The commander is counted separately from its workers.</p></details>
    <div className="plan-route"><GitBranch size={15}/><span>{plan.execution_order}</span><small>Planned order · execution events below show what actually happens</small></div>
    </details>
  </section>}</Translate>;
}
