import React from 'react';
import {test,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {ProviderRecovery,providerFailure} from './ProviderRecovery';
import {MissionTheater} from './MissionTheater';
import type {LabEvent} from './events';
const failed=(payload:Record<string,any>):LabEvent[]=>[{id:'e',sequence:1,timestamp:'2026-10-29',type:'mission.failed',payload}];
test('legacy error admits missing cause and offers account recovery',()=>{
 const events=failed({summary:'OpenAI rate limit or quota reached. Check your account limits.'});
 expect(providerFailure(events)?.code).toBe('legacy_429');
 const html=renderToStaticMarkup(<ProviderRecovery events={events} status="FAILED"/>);
 expect(html).toContain('exact cause was not recorded');expect(html).toContain('https://platform.openai.com/usage');
 expect(renderToStaticMarkup(<ProviderRecovery events={events} status="RUNNING"/>)).toBe('');
 expect(providerFailure(failed({summary:'Missing evidence'}))).toBeNull();
});
test('specific quota issue is not presented as an unknown cause',()=>{
 const html=renderToStaticMarkup(<ProviderRecovery events={failed({provider_issue:'insufficient_quota',summary:'OpenAI API quota or billing access is unavailable.'})} status="FAILED"/>);
 expect(html).toContain('identified above');expect(html).not.toContain('exact cause was not recorded');
});
test('failure heading contains text only with accessible help beside it',()=>{
 const html=renderToStaticMarkup(<MissionTheater events={failed({summary:'OpenAI rate limit or quota reached.'})} status="FAILED" replay={false} replayPlaying={false} replaySpeed={1} onPauseReplay={()=>{}} onStart={()=>{}} onChooseMission={()=>{}} onShowPlan={()=>{}} canControl={false} onTogglePause={()=>{}}/>);
 expect(html).toContain('<h3>The mission needs attention</h3>');
 expect(html).toContain('aria-hidden="true"');expect(html).toContain('Work is saved');
});
