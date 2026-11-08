import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,test} from 'vitest';
import {MissionMonitor} from './MissionMonitor';
test('the open mission monitor shows retained cost and a continuation estimate',()=>{
 const html=renderToStaticMarkup(<MissionMonitor events={[{id:'open',sequence:1,type:'mission.execution_opened',timestamp:'2026-10-29T00:00:00Z',payload:{usage:{estimated_cost_usd:.4779,calls:29,reported_tokens:195705},estimate:{estimated_total_low_usd:.6,estimated_total_high_usd:.8}}}]} status="RUNNING" connection="connected" replay={false} onBoard={()=>{}} onWorld={()=>{}}/>);
 expect(html).toContain('0.4779');expect(html).toContain('no app resource caps');
 expect(html).toContain('0.60');expect(html).toContain('0.80');expect(html).not.toContain('Limit reached');
});
