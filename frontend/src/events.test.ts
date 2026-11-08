import { expect, test } from 'vitest';
import { agentsFrom, appendEvent, workFor, planFrom, type LabEvent } from './events';
const birth: LabEvent = { id:'e1', sequence:1, timestamp:'now', type:'agent.created', agent_id:'a1', payload:{config:{name:'Cloudy'}} };
const started: LabEvent = { ...birth, id:'e2', sequence:2, type:'agent.started', payload:{state:'RUNNING'} };
test('replay reconstructs agent state only from events up to its cursor', () => {
  expect(agentsFrom([birth])[0].state).toBe('CREATED');
  expect(agentsFrom([birth, started])[0].state).toBe('RUNNING');
  expect(agentsFrom([])).toEqual([]);
});
test('reconnected events are deduplicated and ordered', () => {
  expect(appendEvent([started], birth)).toEqual([birth, started]);
  expect(appendEvent([birth], birth)).toHaveLength(1);
});

test('work replay never reveals future input, calculations, or handoffs', () => {
  const input = {...birth, sequence:3, type:'agent.input_received', payload:{input:{scores:[1,3]},source_agents:[]}};
  const operation = {...birth, sequence:4, type:'agent.operation', payload:{operation:'Calculate average',value:{mean:2}}};
  const output = {...birth, sequence:5, type:'agent.tool_completed', payload:{output:{mean:2}}};
  const handoff = {...birth, sequence:6, type:'agent.message_sent', agent_id:'a2', payload:{sender:'a1',receiver:'a2',data:{mean:2}}};
  const stream = [birth,input,operation,output,handoff];
  expect(workFor(stream.slice(0,1),'a1').input).toBeUndefined();
  const working = workFor(stream.slice(0,3),'a1');
  expect(working.operations[0].payload.value.mean).toBe(2);
  expect(working.output).toBeUndefined();
  expect(working.outgoing).toEqual([]);
  expect(workFor(stream,'a1').outgoing).toEqual([handoff]);
  expect(workFor(stream,'a2').incoming[0].payload.data).toEqual(output.payload.output);
});

test('a new attempt does not inherit a prior failure or intermediate result', () => {
  const failed = {...birth, sequence:2, type:'task.failed', payload:{error:'TIMEOUT'}};
  const newInput = {...birth, sequence:3, type:'agent.input_received', payload:{input:{source:'fixture'}}};
  expect(workFor([birth,failed],'a1').error).toBe(failed);
  expect(workFor([birth,failed,newInput],'a1').error).toBeUndefined();
});

test('the planning explanation is visible only after its persisted event',()=>{
  const plan={worker_count:2,count_reason:'Read the lesson and format it.',assignments:[{name:'Atlas'},{name:'Sage'}]};
  const ready={...birth,sequence:3,type:'mission.plan_ready',payload:{plan}};
  expect(planFrom([birth])).toBeNull();
  expect(planFrom([birth,ready])).toEqual(plan);
  expect(planFrom([{...ready,payload:{task_ids:[]}}])).toBeNull();
});
test('renames update boards and dependency labels only after their recorded event',()=>{
 const plan={assignments:[{agent_id:'a1',name:'Cloudy',waits_for:[],sends_to:['Editor']},{agent_id:'a2',name:'Editor',waits_for:['Cloudy'],sends_to:['Master Agent']}]};
 const ready={...birth,id:'plan',sequence:2,type:'mission.plan_ready',payload:{plan}};
 const renamed={...birth,id:'rename',sequence:3,type:'agent.renamed',payload:{name:'الباحث أحمد'}};
 expect(agentsFrom([birth,ready,renamed])[0].config.name).toBe('الباحث أحمد');
 expect(planFrom([birth,ready,renamed])?.assignments[1].waits_for).toEqual(['الباحث أحمد']);
 expect(agentsFrom([birth,ready])[0].config.name).toBe('Cloudy');
 expect(planFrom([birth,ready])?.assignments[1].waits_for).toEqual(['Cloudy']);
 expect(birth.payload.config.name).toBe('Cloudy');
});
