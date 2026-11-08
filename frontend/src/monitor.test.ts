import {describe,it,expect} from 'vitest';
import {missionProgress} from './monitor';
import type {LabEvent} from './events';
const event=(sequence:number,type:string,payload:Record<string,any>={},agent_id?:string,task_id?:string):LabEvent=>({id:String(sequence),sequence,type,payload,agent_id,task_id,timestamp:'2026-10-28T10:00:00Z'});
describe('recorded mission progress',()=>{
 it('a limit hold closes pending activity without declaring the mission finished',()=>{
  const events=[event(1,'model.call_started',{purpose:'Review'},'a'),event(2,'mission.limit_approval_requested',{status:'AWAITING_LIMIT_APPROVAL'})];
  expect(missionProgress(events).pending).toBeUndefined();expect(missionProgress(events).finished).toBe(false);
 });
 it('does not turn requests or drafts into completed work',()=>{
  const events=[event(1,'mission.plan_ready',{plan:{assignments:[{},{}]}}),event(2,'task.created',{},'a','t1'),event(3,'model.call_started',{purpose:'Worker proposal'},'a'),event(4,'agent.act',{artifact:{content:'Draft'}},'a','t1')];
  const progress=missionProgress(events);
  expect(progress.total).toBe(2);expect(progress.completed).toBe(0);
  expect(progress.pending?.sequence).toBe(3);expect(progress.finished).toBe(false);
  events.push(event(5,'mission.failed'),event(6,'mission.retry_requested'));
  expect(missionProgress(events).pending).toBeUndefined();
 });
 it('closes only matching requests and counts unique completed tasks',()=>{
  const events=[event(1,'model.call_started',{purpose:'Review'},'a'),event(2,'model.call_completed',{purpose:'Review'},'b'),event(3,'task.completed',{},'a','t1'),event(4,'task.completed',{},'a','t1')];
  expect(missionProgress(events).pending?.sequence).toBe(1);
  events.push(event(5,'model.call_completed',{purpose:'Review'},'a'));
  expect(missionProgress(events).pending).toBeUndefined();expect(missionProgress(events).completed).toBe(1);
 });
 it('keeps verification separate from task completion and respects replay prefixes',()=>{
  const events=[event(1,'task.created',{},'a','t1'),event(2,'task.completed',{},'a','t1'),event(3,'master.test',{scope:'whole mission',passed:true}),event(4,'mission.completed')];
  expect(missionProgress(events.slice(0,2)).verified).toBe(false);
  expect(missionProgress(events.slice(0,3)).finished).toBe(false);
  expect(missionProgress(events).finished).toBe(true);
 });
});
