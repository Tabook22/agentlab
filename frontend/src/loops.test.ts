import { expect,test } from 'vitest';
import { cyclesFor,executionMode,loopState } from './loops';
import type { LabEvent } from './events';
const event=(sequence:number,type:string,payload:Record<string,any>,agent_id='a'):LabEvent=>({id:`e${sequence}`,sequence,timestamp:'now',type,payload,agent_id});

test('each cycle reveals only its actual observed world, public plan, action and test',()=>{
  const events=[event(1,'agent.observe',{cycle:1,world:{mission:'Explain DNS'}}),
    event(2,'agent.plan',{cycle:1,public_plan:['Write an explanation']}),
    event(3,'agent.act',{cycle:1,artifact:{content:'Draft'}}),
    event(4,'agent.test',{cycle:1,passed:false,feedback:'Add an example'}),
    event(5,'agent.repeat',{cycle:1,next_cycle:2}),
    event(6,'agent.observe',{cycle:2,world:{previous_attempt:{test_feedback:'Add an example'}}}),
    event(7,'agent.test',{cycle:2,passed:true})];
  expect(cyclesFor(events.slice(0,1),'a')[0].plan).toBeUndefined();
  expect(cyclesFor(events.slice(0,3),'a')[0].test).toBeUndefined();
  const cycles=cyclesFor(events,'a');
  expect(cycles).toHaveLength(2);
  expect(cycles[0].test?.payload.passed).toBe(false);
  expect(cycles[1].observe?.payload.world.previous_attempt.test_feedback).toBe('Add an example');
  expect(cycles[1].test?.payload.passed).toBe(true);
  expect(cyclesFor(events,'b')).toEqual([]);
});

test('master cycles and historical simulation mode remain distinct',()=>{
  const events=[event(1,'mission.created',{mode:'live'}),event(2,'master.observe',{cycle:1,world:{mission:'Mission'}}),event(3,'master.plan',{cycle:1,public_plan:['Delegate']})];
  expect(executionMode(events)).toBe('live');
  expect(executionMode([])).toBe('simulation');
  expect(cyclesFor(events,'master')[0].plan?.payload.public_plan).toEqual(['Delegate']);
  expect(cyclesFor(events,'a')).toEqual([]);
});


test('adjustment, repeat and stop outcomes respect actor and replay boundaries',()=>{
  const events=[event(1,'agent.observe',{cycle:1}),event(2,'agent.test',{cycle:1,passed:false}),
    event(3,'agent.adjust',{cycle:1,next_action:'Apply guidance'}),event(4,'agent.repeat',{cycle:1,next_cycle:2}),
    event(5,'agent.stopped',{cycle:1,outcome:'help_needed'}),event(6,'agent.observe',{cycle:2}),
    event(7,'agent.stopped',{cycle:2,outcome:'completed'})];
  expect(cyclesFor(events.slice(0,2),'a')[0].adjust).toBeUndefined();
  expect(cyclesFor(events,'a')[0].adjust?.payload.next_action).toBe('Apply guidance');
  expect(loopState(events.slice(0,5),'a').status).toBe('Help needed');
  expect(loopState(events.slice(0,6),'a').stop).toBeUndefined();
  expect(loopState(events,'a').status).toBe('Completed');
  expect(loopState(events,'b').status).toBe('Waiting');
});

test('commander limits and current checks are visible without exposing future results',()=>{
  const events=[event(1,'master.observe',{cycle:1}),event(2,'model.call_started',{purpose:'Commander: whole-mission verification'},''),
    event(3,'master.stopped',{cycle:1,outcome:'limit_reached'})];
  expect(loopState(events.slice(0,2),'master').status).toBe('Checking');
  expect(loopState(events,'master').status).toBe('Limit reached');
});
test('a held mission is waiting for approval and returns to work after an approved continuation',()=>{
 const events=[event(1,'agent.observe',{cycle:1}),event(2,'mission.limit_approval_requested',{status:'AWAITING_LIMIT_APPROVAL'})];
 expect(loopState(events,'a').status).toBe('Paused · awaiting admin limit approval');
 events.push(event(3,'mission.retry_requested',{}),event(4,'agent.observe',{cycle:2}));
 expect(loopState(events,'a').status).toBe('Working');
});
