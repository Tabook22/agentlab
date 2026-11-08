import type { LabEvent } from './events';
export type LoopStage='observe'|'plan'|'act'|'test'|'adjust'|'repeat';
export type WorkCycle={number:number;observe?:LabEvent;plan?:LabEvent;acts:LabEvent[];test?:LabEvent;adjust?:LabEvent;repeat?:LabEvent};

export function cyclesFor(events:LabEvent[],agentId:string):WorkCycle[] {
  const prefix=agentId==='master'?'master.':'agent.';
  const cycles=new Map<number,WorkCycle>();
  for(const event of events) {
    if(!event.type.startsWith(prefix) || (agentId!=='master'&&event.agent_id!==agentId)) continue;
    const stage=event.type.slice(prefix.length);
    if(!['observe','plan','act','test','adjust','repeat'].includes(stage)) continue;
    const number=event.payload.cycle;
    if(!Number.isInteger(number)||number<1) continue;
    const cycle:WorkCycle=cycles.get(number) ?? {number,acts:[]};
    if(stage==='act') cycle.acts.push(event);
    else if(stage==='observe') cycle.observe=event;
    else if(stage==='plan') cycle.plan=event;
    else if(stage==='test') cycle.test=event;
    else if(stage==='adjust') cycle.adjust=event;
    else cycle.repeat=event;
    cycles.set(number,cycle);
  }
  return [...cycles.values()].sort((a,b)=>a.number-b.number);
}

export function executionMode(events:LabEvent[]):'live'|'simulation' {
  return events.find(e=>e.type==='mission.created')?.payload.mode==='live'?'live':'simulation';
}

export function loopState(events:LabEvent[],agentId:string) {
  const master=agentId==='master';
  const own=events.filter(e=>master?e.type.startsWith('master.')||e.type.startsWith('model.')&&!e.agent_id:e.agent_id===agentId);
  const started=own.findLast(e=>e.type===(master?'master.observe':'agent.observe')||!master&&e.type==='agent.loop_resumed');
  const stop=own.findLast(e=>e.type===(master?'master.stopped':'agent.stopped'));
  const activeStop=stop&&(!started||stop.sequence>started.sequence)?stop:undefined;
  const last=own.at(-1);
  const terminal=events.findLast(e=>['mission.completed','mission.failed','mission.cancelled','mission.planning','mission.retry_requested','mission.plan_approval_requested','mission.plan_approved','mission.limit_approval_requested','mission.clarification_requested'].includes(e.type));
  const ended=terminal&&['mission.completed','mission.failed','mission.cancelled'].includes(terminal.type);
  const status=terminal?.type==='mission.clarification_requested'?'Waiting for your clarification':terminal?.type==='mission.limit_approval_requested'?'Paused · awaiting admin limit approval':terminal?.type==='mission.plan_approval_requested'?'Waiting for plan approval':activeStop?({completed:'Completed',help_needed:'Help needed',limit_reached:'Limit reached'}[activeStop.payload.outcome as string]||'Stopped'):ended?(terminal?.type==='mission.cancelled'?'Cancelled by user':'Run ended · historical outcome not recorded'):
    last?.type==='model.call_started'?(String(last.payload.purpose).includes('review')||String(last.payload.purpose).includes('verification')?'Checking':'Planning'):
    last?.type.endsWith('.adjust')?'Adjusting':last?.type.endsWith('.test')?'Checking':last?.type.includes('tool_')||last?.type.endsWith('.act')?'Working':started?'Working':'Waiting';
  return {status,stop:activeStop,last};
}
