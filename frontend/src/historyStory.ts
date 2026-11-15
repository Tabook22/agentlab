import {type LabEvent} from './events';
import {dataFlow} from './dataFlow';
import {transferFor,type Transfer} from './animation';

export const storyChapters=[
 {id:'understand',en:'Understand the goal',ar:'فهم الهدف',why:'The master reads the mission and resolves missing information.',whyAr:'يقرأ القائد المهمة ويطلب توضيح المعلومات الناقصة.'},
 {id:'divide',en:'Divide the work',ar:'تقسيم العمل',why:'The master chooses roles and explains who receives and produces what.',whyAr:'يختار القائد الأدوار ويوضح ما يستلمه وينتجه كل وكيل.'},
 {id:'permission',en:'Ask for permission',ar:'طلب الإذن',why:'The team waits for recorded human approval or guidance when needed.',whyAr:'ينتظر الفريق موافقة الإنسان أو توجيهه عند الحاجة.'},
 {id:'work',en:'Agents do the work',ar:'عمل الوكلاء',why:'Each worker receives input, makes a public plan, uses tools and checks its output.',whyAr:'يستلم كل وكيل المدخلات ويخطط ويستخدم الأدوات ويفحص مخرجاته.'},
 {id:'exchange',en:'Share ideas & questions',ar:'تبادل الأفكار والأسئلة',why:'An output, idea or question moves from its sender to its receiver.',whyAr:'تنتقل المخرجات أو الأفكار أو الأسئلة من المرسل إلى المستلم.'},
 {id:'review',en:'Review & improve',ar:'المراجعة والتحسين',why:'Drafts return to the master. Feedback can start another worker attempt.',whyAr:'تعود المسودات إلى القائد وقد تبدأ الملاحظات محاولة جديدة.'},
 {id:'deliver',en:'Deliver the answer',ar:'تسليم الإجابة',why:'Recorded final approval and delivery complete the story.',whyAr:'يكتمل المسار بالاعتماد النهائي المسجل وتسليم الإجابة.'},
] as const;
export type StoryChapter=typeof storyChapters[number]['id'];
export function chapterFor(e:LabEvent):StoryChapter|null {
 if(['mission.created','mission.clarification_requested','mission.clarification_answered','master.mission_understood','master.observe'].includes(e.type))return 'understand';
 if(['mission.plan_ready','agent.created','task.assigned','master.plan'].includes(e.type))return 'divide';
 if(['mission.plan_approval_requested','mission.plan_approved','mission.plan_declined','mission.limit_approval_requested','mission.limit_approved','mission.limit_declined','master.budget_approval_requested','mission.budget_approved','mission.budget_denied','workspace.question_answered'].includes(e.type))return 'permission';
 if(['agent.input_received','agent.observe','agent.plan','agent.operation','agent.act','agent.test','agent.tool_completed','agent.output_accepted'].includes(e.type))return 'work';
 if(['agent.message_sent','agent.guidance_received','commander.instruction'].includes(e.type))return 'exchange';
 if(['agent.review_requested','master.review_completed','master.improved','master.act','master.test','master.adjust','agent.adjust','agent.repeat','task.retry_requested','agent.loop_resumed'].includes(e.type))return 'review';
 if(['master.final_approved','mission.completed'].includes(e.type))return 'deliver';
 return null;
}
export function storyMoments(events:LabEvent[]){return events.filter(e=>chapterFor(e)).slice().sort((a,b)=>a.sequence-b.sequence);}
export function storyTransfer(event:LabEvent,events:LabEvent[]):Transfer|null {
 if(['mission.created','mission.clarification_answered','mission.plan_approved','mission.plan_declined','mission.limit_approved','mission.limit_declined','mission.budget_approved','mission.budget_denied','workspace.question_answered'].includes(event.type))return {id:event.id,sequence:event.sequence,source:'you',target:event.type==='workspace.question_answered'?event.agent_id??'master':'master',label:event.type==='mission.created'?'Mission submitted':event.type.endsWith('approved')?'Permission granted':event.type.endsWith('declined')||event.type.endsWith('denied')?'Permission declined':'Clarification answer',data:event.payload};
 if(['mission.clarification_requested','mission.plan_approval_requested','mission.limit_approval_requested','master.budget_approval_requested'].includes(event.type))return {id:event.id,sequence:event.sequence,source:'master',target:'you',label:'Question or permission request',data:event.payload};
 const transfer=transferFor(event,events.filter(e=>e.sequence<=event.sequence));
 return transfer&&event.payload.message_type==='HELP_REQUEST'&&transfer.target!=='master'?{...transfer,label:'Clarification question'}:transfer;
}
export function storyActor(event:LabEvent){return event.type==='master.review_completed'?'master':event.agent_id??(event.payload.sender as string|undefined)??'master';}
export function storySnapshot(events:LabEvent[],sequence:number){
 const prefix=events.filter(e=>e.sequence<=sequence).slice().sort((a,b)=>a.sequence-b.sequence);
 const flow=dataFlow(prefix);
 const rows=flow.rows.map(row=>row.output?.type==='agent.output_accepted'&&!prefix.some(e=>e.type==='master.review_completed'&&e.payload.worker_id===row.agent_id&&e.sequence>row.output!.sequence&&e.payload.approved===false)?{...row,accepted:true}:row);
 const current=prefix.at(-1);
 return {prefix,...flow,rows,current,transfer:current?storyTransfer(current,prefix):null,approved:prefix.some(e=>e.type==='master.final_approved'),delivered:prefix.some(e=>e.type==='mission.completed')};
}

const esc=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
function lines(value:string,width:number){const words=value.split(/\s+/),out:string[]=[];let line='';for(const word of words){if(line&&line.length+word.length>width){out.push(line);line='';}line+=(line?' ':'')+word;}if(line)out.push(line);return out;}
// Local vector export: no model calls, remote assets or injected markup.
export function historyIllustration(events:LabEvent[],ar=false){
 const moments=storyMoments(events),flow=dataFlow(events),names=new Map(flow.rows.map(r=>[r.agent_id,r.name]));
 const name=(id:string)=>id==='you'?(ar?'أنت':'You'):id==='result'?(ar?'الإجابة':'Answer'):id==='master'?(ar?'القائد':'Master Agent'):names.get(id)??id;
 let y=42;const shapes:string[]=[];
 const text=(value:string,x:number,top:number,size=15,color='#263958')=>`<text x="${x}" y="${top}" font-family="Arial,sans-serif" font-size="${size}" fill="${color}">${esc(value)}</text>`;
 const box=(value:string,tint:string)=>{const wrapped=lines(value,105);const h=wrapped.length*21+28;shapes.push(`<rect x="24" y="${y}" width="952" height="${h}" rx="12" fill="${tint}"/>`);wrapped.forEach((line,i)=>shapes.push(text(line,40,y+25+i*21)));y+=h+12;};
 shapes.push(text(ar?'قصة المهمة المصورة':'How the agents completed this mission',24,y,25));y+=27;
 box(String(events.find(e=>e.type==='mission.created')?.payload.prompt??''),'#eff4ff');
 shapes.push(text(ar?'خريطة التواصل المسجل':'Recorded communication map',24,y+22,21));y+=42;
 const workers=flow.rows.filter(r=>!['master','you','result'].includes(r.agent_id));
 const positions=new Map<string,{x:number;y:number}>([['you',{x:120,y:65}],['master',{x:500,y:65}],['result',{x:880,y:65}]]);
 workers.forEach((r,i)=>{const count=Math.min(4,workers.length-Math.floor(i/4)*4);positions.set(r.agent_id,{x:(i%4+.5)*1000/count,y:225+Math.floor(i/4)*170});});
 const routeSet=new Map<string,Transfer>();for(const e of moments){const t=storyTransfer(e,events);if(t)routeSet.set(`${t.source}:${t.target}`,t);}
 shapes.push(`<g transform="translate(0 ${y})">`);
 for(const t of routeSet.values()){const a=positions.get(t.source),b=positions.get(t.target);if(!a||!b||t.source===t.target)continue;const dx=b.x-a.x,dy=b.y-a.y,pad=Math.min(85/Math.abs(dx),42/Math.abs(dy));shapes.push(`<path d="M${a.x+dx*pad} ${a.y+dy*pad} Q${(a.x+b.x)/2+40} ${(a.y+b.y)/2+65} ${b.x-dx*pad} ${b.y-dy*pad}" fill="none" stroke="#889ab7" stroke-width="2" marker-end="url(#history-arrow)"/>`);}
 for(const [id,p] of positions){shapes.push(`<rect x="${p.x-80}" y="${p.y-35}" width="160" height="70" rx="12" fill="${id==='master'?'#eee8fa':id==='result'?'#e8f7ee':'#edf4fc'}" stroke="#c9d5e7"/>`);const label=lines(name(id),19).slice(0,2);label.forEach((line,i)=>shapes.push(`<text x="${p.x}" y="${p.y-3+i*19}" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" fill="#263958">${esc(line)}</text>`));}
 shapes.push('</g>');y+=135+Math.ceil(workers.length/4)*170;
 for(const chapter of storyChapters){const count=moments.filter(e=>chapterFor(e)===chapter.id).length;box(`${ar?chapter.ar:chapter.en} · ${count} ${ar?'خطوات مسجلة':'recorded steps'}`,'#eee9fa');}
 shapes.push(text(ar?'الخطوات بترتيب حدوثها':'The steps in recorded order',24,y+22,21));y+=42;
 for(const e of moments){const t=storyTransfer(e,events);const route=t?`${name(t.source)} → ${name(t.target)} · `:`${name(storyActor(e))} · `;box(`#${e.sequence} ${route}${e.payload.summary??e.type}`,t?'#edf8f3':'#f5f7fa');}
 box(ar?'الرسوم مبنية على السجل المحفوظ. الخطط عامة وليست تفكير النموذج الداخلي.':'Drawn from saved events. Public plans and artifacts, not private model reasoning.','#eff4ff');
 return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${y+12}" viewBox="0 0 1000 ${y+12}" role="img" aria-label="${esc(ar?'قصة المهمة':'Mission history illustration')}"><defs><marker id="history-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0L7 3.5L0 7Z" fill="#889ab7"/></marker></defs><rect width="100%" height="100%" fill="#ffffff"/>${shapes.join('')}</svg>`;
}
