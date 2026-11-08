import { expect, test } from 'vitest';
import { actorLabel, agentActivity, activityNames, matchesActor, matchesActivityQuery } from './activity';
import type { LabEvent } from './events';
const event=(sequence:number,type:string,payload:Record<string,any>={},agent_id='a'):LabEvent=>({id:`e${sequence}`,sequence,timestamp:'2026-10-26T00:00:00Z',type,payload,agent_id});
const born=event(1,'agent.created',{config:{name:'Pixel',role:'Data preparation'},state:'CREATED'});

test('the board shows each stage only after a corresponding event',()=>{
  const input=event(3,'agent.input_received',{input:{scores:[68]},source_agents:[]});
  const decision=event(4,'agent.decision',{reason:'Use the supplied scores',source:'simulation_rule'});
  const output=event(6,'agent.tool_completed',{output:{scores:[68]}});
  const sent=event(7,'agent.message_sent',{sender:'a',receiver:'b',data:{scores:[68]}},'b');
  const prefix=[born,event(2,'task.assigned'),input,decision,event(5,'agent.operation',{value:{scores:[68]}}),output];
  expect(agentActivity([born],'a').stages.filter(s=>s.occurred).map(s=>s.type)).toEqual(['agent.created']);
  expect(agentActivity(prefix.slice(0,3),'a').decision).toBeUndefined();
  expect(agentActivity(prefix,'a').stages.at(-1)?.occurred).toBe(false);
  expect(agentActivity([...prefix,sent],'a').stages.at(-1)?.occurred).toBe(true);
  expect(agentActivity([...prefix,sent],'b').trace.input).toBeUndefined();
  expect(agentActivity(prefix,'a').trace.output?.payload.output).toEqual({scores:[68]});
});

test('an assigned retry does not reuse prior input, explanation or output',()=>{
  const events=[born,event(2,'task.assigned'),event(3,'agent.input_received',{input:{scores:[1]}}),event(4,'agent.decision',{reason:'Prior attempt'}),event(5,'task.failed'),event(6,'task.assigned')];
  const retry=agentActivity(events,'a');
  expect(retry.trace.input).toBeUndefined();
  expect(retry.decision).toBeUndefined();
  expect(retry.trace.error).toBeUndefined();
});

test('master and worker filters preserve relevant handoffs and dispatch explanations',()=>{
  const dispatch=event(2,'master.decision',{target_agent_id:'a'},undefined);
  const message=event(3,'agent.message_sent',{sender:'a',receiver:'b'},'b');
  expect(matchesActor(dispatch,'master')).toBe(true);
  expect(matchesActor(dispatch,'a')).toBe(true);
  expect(matchesActor(message,'a')).toBe(true);
  expect(matchesActor(message,'b')).toBe(true);
  expect(matchesActor(message,'c')).toBe(false);
  const names=activityNames([born,event(2,'agent.created',{config:{name:'Nova'}},'b')]);
  expect(actorLabel(message,names)).toBe('Pixel → Nova');
});

test('the final worker is marked delivered only once the master publishes the result',()=>{
  const events=[born,event(2,'task.completed')];
  expect(agentActivity(events,'a').stages.at(-1)?.occurred).toBe(false);
  expect(agentActivity([...events,event(3,'mission.completed',{output:{verified:true}})],'a').stages.at(-1)?.occurred).toBe(true);
});

test('ledger search finds named operations as well as public summaries',()=>{
  const operation=event(2,'agent.operation',{operation:'Calculate average',summary:'400 divided by 5 is 80.'});
  expect(matchesActivityQuery(operation,' average ',new Map())).toBe(true);
  expect(matchesActivityQuery(operation,'timeout',new Map())).toBe(false);
});
