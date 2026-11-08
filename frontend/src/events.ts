export type LabEvent = { id: string; mission_id?:string; sequence: number; timestamp: string; type: string; agent_id?: string; task_id?: string; payload: Record<string, any> };
export type Agent = { id: string; config: { name: string; role: string; instructions: string; tools: string[]; model: string; created_at: string }; state: string; output?: any };
// A persisted question/approval can arrive between the mission snapshot and event fetch.
// Prefer its recorded state so reconnecting after the last event cannot miss a user turn.
export function recordedMissionStatus(events:LabEvent[],fallback:string):string {
  const states:Record<string,string>={
    'mission.planning':'RUNNING','mission.retry_requested':'RUNNING','mission.execution_opened':'RUNNING',
    'mission.clarification_requested':'AWAITING_CLARIFICATION','mission.clarification_answered':'RUNNING',
    'mission.plan_approval_requested':'AWAITING_APPROVAL','mission.plan_approved':'RUNNING',
    'mission.limit_approval_requested':'AWAITING_LIMIT_APPROVAL','mission.pause':'PAUSED','mission.resume':'RUNNING',
    'mission.completed':'COMPLETED','mission.failed':'FAILED','mission.cancelled':'CANCELLED','mission.cancel':'CANCELLED',
  };
  const latest=events.findLast(e=>states[e.type]);
  return latest?states[latest.type]:fallback;
}
export type MissionPlanData = {
  basis:'scripted_scenario_rules'|'openai_mission_plan';worker_count:number;commander_count:number;
  requested_objective:string;scenario_scope:string;count_reason:string;fewer_agents:string;
  more_agents:string;execution_order:string;success_criteria:string;
  assignments:{task_id:string;agent_id:string;name:string;role:string;task:string;
    why_separate:string;receives:string;performs:string;produces:string;waits_for:string[];sends_to:string[]}[];
};
export function planFrom(events:LabEvent[]):MissionPlanData|null {
  const ready=events.findLast(event=>event.type==='mission.plan_ready');
  const plan:MissionPlanData|undefined=ready?.payload.plan;
  if(!plan)return null;
  const renames=events.filter(e=>e.type==='agent.renamed'&&e.sequence>ready!.sequence);
  if(!renames.length)return plan;
  const names=new Map(renames.map(e=>[e.agent_id,e.payload.name as string]));
  const oldToNew=new Map(plan.assignments.map(row=>[row.name,names.get(row.agent_id)??row.name]));
  return {...plan,assignments:plan.assignments.map(row=>({...row,name:names.get(row.agent_id)??row.name,
    waits_for:row.waits_for.map(name=>oldToNew.get(name)??name),sends_to:row.sends_to.map(name=>oldToNew.get(name)??name)}))};
}
export function agentsFrom(events: LabEvent[]): Agent[] {
  const agents = new Map<string, Agent>();
  for (const event of events) {
    if (event.type === 'agent.created' && event.agent_id) agents.set(event.agent_id, { id: event.agent_id, config: event.payload.config, state: 'CREATED' });
    const agent = agents.get(event.agent_id || '');
    if(agent&&event.type==='agent.renamed')agent.config={...agent.config,name:event.payload.name};
    if (agent && event.payload.state) agent.state = event.payload.state;
    if (agent && event.payload.output) agent.output = event.payload.output;
  }
  return [...agents.values()];
}
export function appendEvent(events: LabEvent[], incoming: LabEvent) {
  return events.some(e => e.sequence === incoming.sequence) ? events : [...events, incoming].sort((a,b) => a.sequence - b.sequence);
}

export function workFor(events: LabEvent[], agentId: string) {
  const own = events.filter(e => e.agent_id === agentId);
  const lastInput = own.findLast(e => e.type === 'agent.input_received');
  const lastAssignment = own.findLast(e => e.type === 'task.assigned');
  const attemptStart = Math.max(lastInput?.sequence ?? 0,lastAssignment?.sequence ?? 0);
  const input = lastInput && lastInput.sequence>=attemptStart ? lastInput : undefined;
  return {
    attemptStart,
    input,
    operations: own.filter(e => e.type === 'agent.operation' && e.sequence >= attemptStart),
    output: own.findLast(e => ['agent.tool_completed','agent.output_accepted'].includes(e.type) && e.sequence >= attemptStart),
    error: own.findLast(e => e.type === 'task.failed' && e.sequence >= attemptStart),
    incoming: events.filter(e => e.type === 'agent.message_sent' && e.payload.receiver === agentId),
    outgoing: events.filter(e => e.type === 'agent.message_sent' && e.payload.sender === agentId),
  };
}
