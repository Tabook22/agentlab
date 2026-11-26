import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,test} from 'vitest';
import {MissionComposer} from './MissionComposer';
test('mission entry presents open execution instead of cycle and spending cap selectors',()=>{
 const html=renderToStaticMarkup(<MissionComposer prompt="Explain DNS" setPrompt={()=>{}} mode="live" setMode={()=>{}} maxWorkers={8} setMaxWorkers={()=>{}} maxCycles={3} setMaxCycles={()=>{}} budget={.1} setBudget={()=>{}} available model="Configured model" busy={false} active={false} onLaunch={()=>{}}/>);
 expect(html).toContain('No app spending cap');expect(html).toContain('Skill selection');
 expect(html).not.toContain('aria-label="Worker cycle limit"');expect(html).not.toContain('aria-label="Mission spending guard"');
});

test('backend failure explains why planning is disabled and offers reconnection',()=>{
 const props={prompt:'Plan a student project',setPrompt:()=>{},mode:'live' as const,setMode:()=>{},maxWorkers:8,setMaxWorkers:()=>{},maxCycles:3,setMaxCycles:()=>{},budget:.1,setBudget:()=>{},available:false,model:'Configured model',busy:false,active:false,onLaunch:()=>{},onRetryProvider:()=>{},providerError:'Agent Lab could not connect to its backend.'};
 const failed=renderToStaticMarkup(<MissionComposer {...props}/>);
 expect(failed).toContain('role="alert"');expect(failed).toContain(props.providerError);expect(failed).toContain('Retry backend connection');
 expect(failed).toMatch(/<button[^>]*type="submit"[^>]*disabled/);
 const connected=renderToStaticMarkup(<MissionComposer {...props} available providerError=""/>);
 expect(connected).not.toMatch(/<button[^>]*type="submit"[^>]*disabled/);
 expect(connected).not.toContain('Retry backend connection');
});
