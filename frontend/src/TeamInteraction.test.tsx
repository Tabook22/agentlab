import React from 'react';
import { expect,test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TeamInteraction } from './TeamInteraction';
import type { LabEvent } from './events';
const event=(sequence:number,type:string,payload:Record<string,any>={},agent_id?:string):LabEvent=>({id:`e${sequence}`,sequence,type,payload,agent_id,timestamp:'2026-10-28T12:00:00Z'});
const render=(events:LabEvent[])=>renderToStaticMarkup(<TeamInteraction events={events} onInspect={()=>{}}/>);
test('worker completion and a legacy mission completion cannot imply master approval',()=>{
  const events=[event(1,'agent.created',{config:{name:'Nova',role:'Writer'},state:'RUNNING'},'nova'),event(2,'agent.review_requested',{},'nova')];
  expect(render(events)).toContain('Draft with master · awaiting review');
  events.push(event(3,'master.review_completed',{worker_id:'nova',approved:true,data:{feedback:'Accepted',checks:[]}}));
  events.push(event(4,'mission.completed'));
  expect(render(events)).toContain('Master accepted this task');
  expect(render(events)).toContain('Final answer awaiting master approval');
  expect(render(events)).not.toContain('Master approval recorded');
  events.push(event(5,'master.final_approved',{summary:'All checks passed'}));
  expect(render(events)).toContain('Master approval recorded');
});
test('a new submission returns a previously reviewed worker to awaiting review',()=>{
  const events=[event(1,'agent.created',{config:{name:'Nova',role:'Writer'}},'nova'),event(2,'master.review_completed',{worker_id:'nova',approved:false,data:{feedback:'Add evidence',checks:[]}}),event(3,'agent.review_requested',{},'nova')];
  expect(render(events)).toContain('Draft with master · awaiting review');
  expect(render(events)).toContain('Add evidence');
});

test('activity packets and robots stop when paused or terminal',()=>{
  const events=[event(1,'agent.created',{config:{name:'Nova',role:'Writer'},state:'RUNNING'},'nova'),event(2,'task.assigned',{},'nova')];
  const active=render(events);
  expect(active).toContain('Open conversation between Master Agent and Nova');
  expect(active).toContain('team-motion-opt-in');
  expect(active).toContain('Motion on');
  expect(active).toContain('animateMotion');
  expect(active).toContain('avatar-storyteller working');
  const paused=renderToStaticMarkup(<TeamInteraction events={events} playing={false} onInspect={()=>{}}/>);
  expect(paused).not.toContain('animateMotion');
  expect(paused).not.toContain('avatar-storyteller working');
  for(const type of ['mission.completed','mission.failed','mission.cancelled']) {
    const stopped=render([...events,event(3,type)]);
    expect(stopped).not.toContain('animateMotion');
    expect(stopped).not.toContain('avatar-storyteller working');
  }
});
