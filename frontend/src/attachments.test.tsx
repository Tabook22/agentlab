import React from 'react';
import {expect,test} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {attachmentProblem,type MissionAttachment} from './attachments';
import {MissionAttachments} from './MissionAttachments';
const file:MissionAttachment={id:'a',filename:'requirements.pdf',media_type:'application/pdf',byte_size:2000,sha256:'hash',page_count:2,status:'ready',character_count:500,text:'Source requirements',notices:[],visual_labels:[],reading_usage:{}};
test('pending visual reading blocks planning until its evidence is ready',()=>{
 expect(attachmentProblem([file])).toBe('');expect(attachmentProblem([{...file,status:'needs_reading'}])).toContain('Read the pending');
 expect(attachmentProblem([{...file,character_count:180001}])).toContain('180,000');
});
test('source cards explain comments, reading consent and source review',()=>{
 const html=renderToStaticMarkup(<MissionAttachments files={[{...file,status:'needs_reading'}]} comments="Explain this source" available disabled={false} onChange={()=>{}} onBusy={()=>{}} onLive={()=>{}}/>);
 for(const text of ['Add files or images','Type or record your instructions','Review text and coverage','Read visual content','This paid reading does not start the mission','Workers start only after you approve'])expect(html).toContain(text);
 expect(html).toContain('type="file"');expect(html).not.toContain('Approve plan');
});

test('illustrated documents show complete coverage and resumable batch guidance',()=>{
 const html=renderToStaticMarkup(<MissionAttachments files={[{...file,status:'needs_reading',visual_labels:Array.from({length:13},(_,i)=>`Word image ${i+1}`),reading_progress:{completed:4,total:13,state:'paused'}}]} comments="Read every illustration" available disabled={false} onChange={()=>{}} onBusy={()=>{}} onLive={()=>{}}/>);
 for(const text of ['Visual coverage','4 / 13','Continue reading','Completed batches are saved','max="13"','value="4"'])expect(html).toContain(text);
});
