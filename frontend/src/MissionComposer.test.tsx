import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,test} from 'vitest';
import {MissionComposer} from './MissionComposer';
test('mission entry presents open execution instead of cycle and spending cap selectors',()=>{
 const html=renderToStaticMarkup(<MissionComposer prompt="Explain DNS" setPrompt={()=>{}} mode="live" setMode={()=>{}} maxWorkers={8} setMaxWorkers={()=>{}} maxCycles={3} setMaxCycles={()=>{}} budget={.1} setBudget={()=>{}} available model="Configured model" busy={false} active={false} onLaunch={()=>{}}/>);
 expect(html).toContain('No app spending cap');expect(html).toContain('Team settings');
 expect(html).not.toContain('aria-label="Worker cycle limit"');expect(html).not.toContain('aria-label="Mission spending guard"');
});
