import { expect, test } from 'vitest';
import { nextVisualCursor, stationPositions, transferFor, visibleTransfers,workAnimation } from './animation';
import type { LabEvent } from './events';
const event=(sequence:number,type:string,payload:Record<string,any>={},agent_id?:string):LabEvent=>({id:`e${sequence}`,sequence,type,payload,agent_id,timestamp:'2026-10-25T12:00:00Z'});
test('review requests and approval feedback travel between the real worker and master',()=>{
 const draft=event(1,'agent.review_requested',{data:{content:'Draft'}},'nova');
 const feedback=event(2,'master.review_completed',{worker_id:'nova',approved:false,data:{feedback:'Add evidence'}});
 expect(transferFor(draft,[draft])).toMatchObject({source:'nova',target:'master',data:{content:'Draft'}});
 expect(transferFor(feedback,[draft,feedback])).toMatchObject({source:'master',target:'nova',label:'Master revision feedback'});
 expect(nextVisualCursor([draft,feedback],0)).toBe(1);
 const positions=stationPositions(['a','b','c','d','e','f','g','h']);
 expect(positions.get('result')!.y).toBeGreaterThan(positions.get('h')!.y);
});

test('work effects follow actual running workers and stop on pause, limits, or reduced motion',()=>{
 const events=[event(1,'mission.planning'),event(2,'agent.created',{config:{name:'Reef'},state:'RUNNING'},'reef')];
 expect(workAnimation(events,'RUNNING',false,true,false,false).workers).toEqual(['reef']);
 for(const status of ['FAILED','CANCELLED','COMPLETED','PAUSED'])expect(workAnimation(events,status,false,true,false,false).enabled).toBe(false);
 expect(workAnimation(events,'RUNNING',false,true,true,false).enabled).toBe(false);
 expect(workAnimation(events,'RUNNING',false,false,false,false).enabled).toBe(false);
 expect(workAnimation(events,'RUNNING',false,true,false,true).enabled).toBe(false);
 expect(workAnimation([...events,event(3,'mission.failed')],'RUNNING',false,true,false,false).workers).toEqual([]);
 expect(workAnimation(events,'FAILED',true,true,false,false).workers).toEqual(['reef']);
});

test('a handoff uses the actual sender, receiver and payload',()=>{
  const message=event(3,'agent.message_sent',{sender:'pixel',receiver:'nova',data:{scores:[68,75]}} ,'nova');
  expect(transferFor(message,[message])).toMatchObject({source:'pixel',target:'nova',data:{scores:[68,75]}});
  expect(visibleTransfers([])).toEqual([]);
  expect(visibleTransfers([event(1,'agent.created',{},'pixel')])).toEqual([]);
});

test('only the last completed worker delivers the final output',()=>{
  const events=[event(1,'task.completed',{},'pixel'),event(2,'task.completed',{},'scout'),event(3,'mission.completed',{output:{verified:true}})];
  expect(transferFor(events[2],events)).toMatchObject({source:'scout',target:'result',data:{verified:true}});
  expect(transferFor(event(1,'mission.completed'),[])).toBeNull();
});

test('replay prefix cannot reveal future connections',()=>{
  const events=[event(1,'task.assigned',{summary:'Load scores'},'pixel'),event(2,'agent.message_sent',{sender:'pixel',receiver:'nova',data:{scores:[68]}})];
  expect(visibleTransfers(events.slice(0,1))).toHaveLength(1);
  expect(visibleTransfers(events.slice(0,1))[0].target).toBe('pixel');
  expect(visibleTransfers(events)).toHaveLength(2);
});

test('visual queue advances through each significant event without dropping a burst',()=>{
  const events=[event(1,'agent.created',{},'a'),event(2,'agent.ready',{},'a'),event(3,'task.created',{},'a'),event(4,'task.assigned',{},'a'),event(5,'agent.input_received',{},'a')];
  expect(nextVisualCursor(events,0)).toBe(1);
  expect(nextVisualCursor(events,1)).toBe(4);
  expect(nextVisualCursor(events,4)).toBe(5);
  expect(nextVisualCursor(events,5)).toBe(5);
  expect(stationPositions(['a','b']).get('a')?.x).not.toBe(stationPositions(['a','b']).get('b')?.x);
});

test('resuming open execution reactivates packets after an earlier stop',()=>{
 const events=[event(1,'agent.created',{config:{name:'Reef'},state:'RUNNING'},'reef'),event(2,'mission.failed'),event(3,'mission.execution_opened')];
 expect(workAnimation(events,'RUNNING',false,true,false,false).workers).toEqual(['reef']);
});
