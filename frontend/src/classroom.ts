import type {LabEvent} from './events';
import {flowPayload} from './dataFlow';
import {storyActor,storyMoments,storySnapshot,storyTransfer} from './historyStory';
import {missionProgress} from './monitor';

export type PacketKind='Task'|'Evidence'|'Idea'|'Question'|'Draft'|'Feedback'|'Approval'|'Result';
export const packetLabels:Record<PacketKind,{en:string;ar:string;why:string;whyAr:string}>={
 Task:{en:'Task',ar:'مهمة',why:'The receiver learns what it has been asked to do.',whyAr:'يتعرّف المستلم إلى العمل المطلوب منه.'},
 Evidence:{en:'Evidence',ar:'أدلة',why:'Recorded findings and sources are passed on to support the next task.',whyAr:'تنتقل النتائج والمصادر المسجلة لدعم المهمة التالية.'},
 Idea:{en:'Idea',ar:'فكرة',why:'An agent shares its public proposed approach.',whyAr:'يشارك الوكيل نهجه المقترح المعلن.'},
 Question:{en:'Question',ar:'سؤال',why:'Missing information or permission is requested before proceeding.',whyAr:'يُطلب توضيح معلومة ناقصة أو الحصول على إذن قبل المتابعة.'},
 Draft:{en:'Draft',ar:'مسودة',why:'The worker submits its work for review. A draft is not yet approved.',whyAr:'يرسل الوكيل عمله للمراجعة. المسودة ليست معتمدة بعد.'},
 Feedback:{en:'Feedback',ar:'ملاحظات',why:'Guidance returns to the worker so it can clarify or improve its work.',whyAr:'يعود التوجيه إلى الوكيل لتوضيح عمله أو تحسينه.'},
 Approval:{en:'Approval',ar:'موافقة',why:'A recorded decision allows the next stage to proceed.',whyAr:'يسمح قرار مسجل بالانتقال إلى المرحلة التالية.'},
 Result:{en:'Result',ar:'نتيجة',why:'A recorded output is handed to its next receiver.',whyAr:'تُسلَّم المخرجات المسجلة إلى المستلم التالي.'},
};
export function packetKind(e:LabEvent):PacketKind {
 if(e.type==='master.review_completed')return e.payload.approved?'Approval':'Feedback';
 if(e.type==='agent.review_requested')return 'Draft';
 if(e.type.includes('approval_requested')||e.type==='mission.clarification_requested')return 'Question';
 if(e.type.endsWith('declined')||e.type.endsWith('denied'))return 'Feedback';
 if(e.type.endsWith('approved'))return 'Approval';
 if(e.type==='mission.clarification_answered'||e.type==='workspace.question_answered')return 'Feedback';
 if(e.type==='mission.created'||e.type==='task.assigned')return 'Task';
 if(e.payload.message_type==='HELP_REQUEST')return 'Question';
 if(e.payload.message_type==='IDEA')return 'Idea';
 if(e.payload.message_type==='GUIDANCE')return 'Feedback';
 if(e.type==='mission.completed')return 'Result';
 if(e.payload.data?.sources?.length)return 'Evidence';
 return 'Result';
}
export function readableData(value:unknown):string {
 if(value===null||value===undefined)return '';
 if(typeof value==='string'||typeof value==='number')return String(value);
 if(Array.isArray(value))return value.every(v=>['string','number'].includes(typeof v))?value.slice(0,12).join(' · '):`${value.length} items`;
 if(typeof value!=='object')return '';
 const p=value as Record<string,any>;
 if(p.scores)return readableData(p.scores);
 if(p.temperatures)return readableData(p.temperatures);
 if(p.mean!==undefined)return `Average: ${p.mean}`;
 if(p.result!==undefined)return `Result: ${readableData(p.result)}`;
 return readableData(p.content??p.feedback??p.question??p.assigned_task??p.mission??p.task??p.public_plan?.[0]??p.label??p.summary??p.request??p.temperatures);
}
export function eventPreview(e:LabEvent|undefined):string {return e?readableData(flowPayload(e))||String(e.payload.summary??''):'';}
export function classroomSnapshot(events:LabEvent[],sequence:number){
 const snapshot=storySnapshot(events,sequence);
 const progress=missionProgress(snapshot.prefix);
 const last=storyMoments(snapshot.prefix).at(-1)??snapshot.current;
 // In-flight calls are shown as waiting for a result, never as completed work.
 const event=progress.pending??last;
 const transfer=last&&!progress.pending?storyTransfer(last,snapshot.prefix):null;
 const actor=event?storyActor(event):'master';
 const focus=progress.pending?progress.pending.agent_id??'master':transfer&&!['you','result'].includes(transfer.target)?transfer.target:actor;
 const own=event?.type??'';
 const action=progress.pending?{en:'Waiting for a tool or model response',ar:'بانتظار استجابة الأداة أو النموذج'}:
 own==='agent.input_received'||own==='agent.observe'?{en:'Reading the input',ar:'قراءة المدخلات'}:
 own==='agent.plan'||own==='master.plan'?{en:'Planning the next action',ar:'تخطيط الخطوة التالية'}:
 own==='agent.operation'||own==='agent.act'?{en:'Working with the input',ar:'معالجة المدخلات'}:
 own==='agent.test'||own==='master.test'?{en:'Checking the work',ar:'فحص العمل'}:
 own==='master.final_approved'?{en:'The master approved the final answer',ar:'اعتمد القائد الإجابة النهائية'}:
 own==='mission.completed'?{en:'The team delivered its answer',ar:'سلّم الفريق إجابته'}:
 own==='mission.plan_ready'?{en:'The master has divided the work',ar:'قسّم القائد العمل على الفريق'}:
 own==='agent.created'?{en:'A new worker is ready',ar:'أصبح وكيل جديد جاهزاً'}:
 own==='agent.output_accepted'?{en:'This worker’s task passed its checks',ar:'اجتازت مهمة الوكيل فحوصها'}:
 own==='agent.tool_completed'?{en:'An output is ready',ar:'أصبحت المخرجات جاهزة'}:
 own==='master.improved'?{en:'Improving the team’s answer',ar:'تحسين إجابة الفريق'}:
 transfer?{en:`${packetKind(last!)} on the move`,ar:`انتقال ${packetLabels[packetKind(last!)].ar}`}:
 {en:'Follow the team’s next step',ar:'تابع الخطوة التالية للفريق'};
 return {...snapshot,current:last,event,transfer,focus,action,pending:progress.pending};
}

export function classroomPositions(ids:string[]){
 const rows=Math.max(1,Math.ceil(ids.length/4)),height=230+rows*190;
 const positions=new Map<string,{x:number;y:number}>([['you',{x:100,y:100}],['master',{x:500,y:100}],['result',{x:900,y:100}]]);
 ids.forEach((id,i)=>{const count=Math.min(4,ids.length-Math.floor(i/4)*4);positions.set(id,{x:(i%4+.5)*1000/count,y:310+Math.floor(i/4)*190});});
 return {positions,height};
}
export function classroomRoute(a:{x:number;y:number},b:{x:number;y:number}){
 if(a.x===b.x&&a.y===b.y)return `M${a.x+88} ${a.y} C${a.x+180} ${a.y-100},${a.x+180} ${a.y+100},${a.x+88} ${a.y+20}`;
 const dx=b.x-a.x,dy=b.y-a.y,pad=Math.min(94/Math.abs(dx),78/Math.abs(dy));
 return `M${a.x+dx*pad} ${a.y+dy*pad} Q${(a.x+b.x)/2+(a.y===b.y?0:50)} ${(a.y+b.y)/2+(a.y===b.y?145:0)} ${b.x-dx*pad} ${b.y-dy*pad}`;
}
