import React from 'react';
import {expect,test} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {theaterStory} from './theater';
import {MissionTheater} from './MissionTheater';
import type {LabEvent} from './events';
const event=(sequence:number,type:string,payload:Record<string,any>={},agent_id?:string):LabEvent=>({id:`e${sequence}`,sequence,type,payload,agent_id,timestamp:'2026-10-29T00:00:00Z'});

test('mission theater explains pending research and review without claiming completion',()=>{
 const events=[event(1,'agent.created',{config:{name:'Salim',role:'Researcher'},state:'RUNNING'},'a'),event(2,'research.started',{summary:'Searching public sources'},'a')];
 expect(theaterStory(events,'RUNNING')).toMatchObject({title:'Salim is researching sources',event:events[1]});
 events.push(event(3,'research.completed',{},'a'),event(4,'model.call_started',{purpose:'Commander: review Salim'}));
 expect(theaterStory(events,'RUNNING').title).toBe('The master is reviewing a draft');
 expect(theaterStory(events,'PAUSED').title).toBe('The mission is paused');
 expect(theaterStory(events,'AWAITING_APPROVAL').title).toBe('Your team is ready for review');
});

test('only a saved master final approval is described as final approval',()=>{
 const events=[event(1,'mission.completed')];
 expect(theaterStory(events,'COMPLETED').title).toBe('The recorded run has ended');
 expect(theaterStory([...events,event(2,'master.final_approved')],'COMPLETED').title).toBe('The master approved the final answer');
 expect(theaterStory([event(1,'mission.failed',{summary:'Missing evidence'})],'FAILED').why).toBe('Missing evidence');
});

test('revision explanation uses recorded master feedback and an empty mission invites a goal',()=>{
 const review=event(1,'master.review_completed',{approved:false,data:{feedback:'Add publication dates'}});
 expect(theaterStory([review],'RUNNING')).toMatchObject({why:'Add publication dates',event:review});
 expect(theaterStory([],'READY').title).toBe('Your next question starts here');
});

test('theater keeps the mission, approval gate, and master details together',()=>{
 const events=[event(1,'mission.created',{prompt:'Build a source-backed news brief'})];
 const html=renderToStaticMarkup(<MissionTheater events={events} status="RUNNING" replay={false} replayPlaying={false} replaySpeed={1} onPauseReplay={()=>{}} onStart={()=>{}} onChooseMission={()=>{}} onShowPlan={()=>{}} canControl onTogglePause={()=>{}}/>);
 for(const text of ['Mission Theater','Build a source-backed news brief','WHAT IS HAPPENING','MISSION MAP','Inspect Master Agent','Pause mission','Mission journey'])expect(html).toContain(text);
 expect(html).not.toContain('Final approval recorded');
 expect(html).not.toContain('aria-label="Agent details"');
 expect(html.indexOf('WHAT IS HAPPENING')).toBeLessThan(html.indexOf('MISSION MAP'));
 expect(html).toContain('Playback options');
 expect(html).toContain('Latest recorded event');
});
