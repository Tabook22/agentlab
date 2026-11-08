import React from 'react';
import {expect,test} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {MissionJourney,suggestedJourneyView,journeyNextAction} from './MissionJourney';
import type {LabEvent} from './events';
const event=(sequence:number,type:string,payload:Record<string,any>={}):LabEvent=>({id:String(sequence),sequence,type,payload,timestamp:'2026-10-30'});
const noop=()=>{};
function render(status:string,events:LabEvent[]=[],replay=false){return renderToStaticMarkup(<MissionJourney exists status={status} events={events} view="theater" replay={replay} onNavigate={noop} onDiscuss={noop} onPause={noop} onCancel={noop} onAdvanced={noop}/>);}
test('mission shortcuts unlock from recorded plan and answer, not status alone',()=>{
 const html=render('COMPLETED');
 expect(html).toMatch(/disabled=""[^>]*class="journey-step step-1/);
 expect(html).toMatch(/disabled=""[^>]*class="journey-step step-3/);
 const ready=render('COMPLETED',[event(1,'mission.plan_ready'),event(2,'mission.completed')]);
 expect(ready).not.toMatch(/disabled=""[^>]*class="journey-step step-(1|3)/);
 expect(ready).toContain('More tools');expect(ready).toContain('Ask the master');
});
test('paused missions can resume while saved replays cannot control live execution',()=>{
 expect(render('PAUSED')).toContain('Resume');
 expect(render('RUNNING')).toContain('Pause');
 expect(render('RUNNING',[],true)).not.toContain('Cancel mission');
 expect(render('RUNNING',[],true)).not.toContain('>Pause<');
 expect(render('AWAITING_APPROVAL')).not.toContain('>Pause<');
});
test('landing view follows the actual plan or saved answer',()=>{
 expect(suggestedJourneyView('AWAITING_APPROVAL',false)).toBe('plan');
 expect(suggestedJourneyView('COMPLETED',true)).toBe('answer');
 expect(suggestedJourneyView('COMPLETED',false)).toBe('theater');
 expect(suggestedJourneyView('FAILED',false)).toBe('theater');
});
test('execution cost and mission goal stay visible across views',()=>{
 const html=render('RUNNING',[event(1,'mission.created',{prompt:'Compare three sensor designs'}),event(2,'model.call_completed',{usage:{estimated_cost_usd:.125}})]);
 expect(html).toContain('Compare three sensor designs');expect(html).toContain('0.1250');
});

test('a saved failed mission still shows that it needs attention',()=>{
 expect(render('FAILED',[],true)).toContain('Needs your attention');
 expect(render('FAILED',[],true)).toContain('Saved mission');
});

test('next action keeps approval and recovery explicit and respects recorded milestones',()=>{
 expect(journeyNextAction('AWAITING_APPROVAL',true,false,false)).toBe('plan');
 expect(journeyNextAction('AWAITING_APPROVAL',false,false,false)).toBe('discuss');
 expect(journeyNextAction('COMPLETED',true,false,false)).not.toBe('answer');
 expect(journeyNextAction('COMPLETED',true,true,false)).toBe('answer');
 expect(journeyNextAction('PAUSED',true,false,false)).toBe('resume');
 expect(journeyNextAction('AWAITING_LIMIT_APPROVAL',true,false,false)).toBe('attention');
 expect(journeyNextAction('PAUSED',true,false,true)).toBe('replay');
 expect(render('AWAITING_APPROVAL',[event(1,'mission.plan_ready')])).toContain('Review the plan');
});
