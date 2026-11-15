import type {LabEvent} from './events';
import {safeSourceUrl} from './citations';
import {executionMode} from './loops';
export type GraphicTopic='goal'|'data'|'build'|'review'|'launch'|'time'|'insight'|'document';
export type GraphicStep={id:string;title:string;content:string;excerpt:string;topic:GraphicTopic};
export type AnswerGraphic={title:string;goal:string;steps:GraphicStep[];metrics:{label:string;value:string}[];limitations:string[];sources:{title:string;url:string}[];sequence:number;simulation:boolean};
export const plainGraphicText=(value:string)=>value.replace(/\[([^\]]+)\]\(([^)]+)\)/g,'$1').replace(/^[ \t]*#{1,6}\s+/gm,'').replace(/\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`/g,(_,a,b,c)=>a??b??c).replace(/^\s*[-+]\s+/gm,'').trim();
export function graphicTopic(title:string):GraphicTopic{
 if(/risk|valid|test|evaluat|check|limit|review|مخاطر|فحص|تقييم|تحقق|قيود|مراجعة/i.test(title))return 'review';
 if(/data|source|collect|research|بيانات|مصادر|جمع|بحث/i.test(title))return 'data';
 if(/build|train|model|code|implement|develop|تدريب|نموذج|تنفيذ|بناء|تطوير/i.test(title))return 'build';
 if(/deploy|deliver|launch|next|نشر|تسليم|إطلاق|اطلاق|تالية/i.test(title))return 'launch';
 if(/time|schedul|phase|جدول|وقت|مدة|مراحل/i.test(title))return 'time';
 if(/result|analy|compar|find|نتيجة|نتائج|تحليل|مقارن/i.test(title))return 'insight';
 if(/goal|purpose|objective|question|هدف|غرض|سؤال/i.test(title))return 'goal';
 return 'document';
}
function sectionsFrom(content:string,ar:boolean):{title:string;content:string}[]{
 const lines=content.replace(/\r\n?/g,'\n').split('\n');
 const eligible=new Set<number>();let fenced=false;const headings:{index:number;depth:number;title:string}[]=[];
 lines.forEach((line,index)=>{if(/^\s*(```|~~~)/.test(line)){fenced=!fenced;return;}if(fenced)return;eligible.add(index);const h=/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);if(h)headings.push({index,depth:h[1].length,title:plainGraphicText(h[2])});});
 if(headings.length){
  let depth=Math.min(...headings.map(h=>h.depth));
  // A single leading document title must not hide its individual sections.
  if(headings.filter(h=>h.depth===depth).length===1&&headings.length>1&&headings[0].depth===depth)depth=Math.min(...headings.slice(1).map(h=>h.depth));
  const chosen=headings.filter(h=>h.depth<=depth),out:{title:string;content:string}[]=[];
  const intro=lines.slice(0,chosen[0].index).join('\n').trim();
  if(intro)out.push({title:ar?'نظرة عامة':'Overview',content:intro});
  chosen.forEach((h,i)=>{const body=lines.slice(h.index+1,chosen[i+1]?.index??lines.length).join('\n').trim();if(body)out.push({title:h.title,content:body});});
  if(out.length)return out;
 }
 // Without headings, explicit numbered instructions define the steps. Keep continuations.
 const ordered=lines.map((line,index)=>({match:/^\s{0,3}(?:\d+|[٠-٩]+)[.)\-]\s+(.+)$/.exec(line),index})).filter(item=>item.match&&eligible.has(item.index));
 if(ordered.length>1){
  const out:{title:string;content:string}[]=[];const intro=lines.slice(0,ordered[0].index).join('\n').trim();if(intro)out.push({title:ar?'نظرة عامة':'Overview',content:intro});
  ordered.forEach((item,i)=>out.push({title:plainGraphicText(item.match![1]),content:lines.slice(item.index,ordered[i+1]?.index??lines.length).join('\n').trim()}));return out;
 }
 return content.split(/\n\s*\n/).filter(s=>s.trim()).map((part,i)=>({title:ar?`الفكرة ${i+1}`:`Key idea ${i+1}`,content:part.trim()}));
}
export function approvedAnswerGraphic(events:LabEvent[],ar=false):AnswerGraphic|null{
 const delivered=events.findLast(e=>e.type==='mission.completed');
 if(!delivered||!events.some(e=>e.type==='master.final_approved'&&e.sequence<delivered.sequence))return null;
 const output=delivered.payload.output;if(!output||typeof output!=='object')return null;
 const title=String(output.title??output.label??(ar?'الإجابة مصورة':'Your answer, illustrated'));
 let sections=typeof output.content==='string'&&output.content.trim()?sectionsFrom(output.content,ar):[];
 const numeric=(v:unknown)=>typeof v==='number'&&Number.isFinite(v);
 const metrics:{label:string;value:string}[]=[];
 for(const [key,label] of [['mean',ar?'المتوسط':'Average'],['sum',ar?'المجموع':'Total'],['count',ar?'العدد':'Count'],['result',ar?'النتيجة':'Result']])if(numeric(output[key]))metrics.push({label,value:String(output[key])});
 if(!sections.length){
  if(Array.isArray(output.temperatures)&&output.temperatures.length){
   const values=output.temperatures.map((v:unknown,i:number)=>`${output.days?.[i]??i+1}: ${String(v)}°`).join(' · ');
   sections.push({title:ar?'اقرأ القيم':'Read the observations',content:values});
   // Only summarize finite recorded values; do not infer a forecast or claim a trend.
   const valuesNumeric=output.temperatures.filter(numeric) as number[];
   if(valuesNumeric.length)metrics.push({label:ar?'أدنى قيمة':'Lowest value',value:`${Math.min(...valuesNumeric)}°`},{label:ar?'أعلى قيمة':'Highest value',value:`${Math.max(...valuesNumeric)}°`});
  }
  if(Array.isArray(output.scores))sections.push({title:ar?'القيم الأصلية':'Original values',content:output.scores.map(String).join(' · ')});
  if(output.expression)sections.push({title:ar?'الحساب':'Calculation',content:String(output.expression)});
  if(metrics.length)sections.push({title:ar?'النتيجة بالأرقام':'The numerical result',content:metrics.map(m=>`${m.label}: ${m.value}`).join('\n')});
  if(typeof output.lesson==='string')sections.push({title:ar?'الفكرة الأساسية':'The key idea',content:output.lesson});
  if(Array.isArray(output.sections))sections.push(...output.sections.filter((s:unknown)=>typeof s==='string').map((s:string,i:number)=>({title:ar?`الفكرة ${i+1}`:`Key idea ${i+1}`,content:s})));
 }
 if(!sections.length)sections=[{title:ar?'المخرجات المسجلة':'Recorded result',content:JSON.stringify(output,null,2)}];
 return {title,goal:String(events.find(e=>e.type==='mission.created')?.payload.prompt??''),sequence:delivered.sequence,
  simulation:executionMode(events)!=='live',
  steps:sections.map((s,i)=>({...s,id:`part-${i+1}`,excerpt:plainGraphicText(s.content).replace(/\s+/g,' ').slice(0,210)+(plainGraphicText(s.content).replace(/\s+/g,' ').length>210?'…':''),topic:graphicTopic(s.title)})),
  metrics,limitations:Array.isArray(output.limitations)?output.limitations.filter((s:unknown)=>typeof s==='string'):[],
  sources:Array.isArray(output.sources)?output.sources.filter((s:any)=>s&&typeof s.url==='string'&&safeSourceUrl(s.url)).map((s:any)=>({title:String(s.title||s.url),url:s.url})):[]};
}
const xml=(text:string)=>text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
function wrap(text:string,width=86){return text.split('\n').flatMap(line=>{const out:string[]=[];let row='';for(const word of line.split(/\s+/)){if(row.length+word.length+1>width&&row){out.push(row);row='';}for(let offset=0;offset<word.length;offset+=width){const part=word.slice(offset,offset+width);if(offset){out.push(row);row='';}row+=(row?' ':'')+part;}}if(row)out.push(row);return out.length?out:[''];});}
// A self-contained vector drawing: no foreignObject, remote assets or model calls.
export function answerGraphicSvg(model:AnswerGraphic,ar=false){
 let y=44;const nodes:string[]=[];const x=ar?924:76,anchor=ar?'end':'start';
 const text=(s:string,at:number,size=16,color='#30465f')=>`<text x="${x}" y="${at}" text-anchor="${anchor}" direction="${ar?'rtl':'ltr'}" font-family="Arial,sans-serif" font-size="${size}" fill="${color}">${xml(s)}</text>`;
 const paragraph=(s:string,size=16,color='#30465f')=>{for(const line of wrap(s,Math.min(86,Math.floor(840/(size*.65))))){nodes.push(text(line,y,size,color));y+=size+9;}y+=10;};
 paragraph(ar?'مختبر الوكلاء · الإجابة مصورة':'AGENT LAB · THE ANSWER, ILLUSTRATED',13,'#637e8b');paragraph(model.title,25,'#233f52');
 if(model.simulation)paragraph(ar?'نتيجة محاكاة تعليمية':'CLASSROOM SIMULATION OUTPUT',13,'#936831');
 paragraph(ar?'مقتطفات موجزة بترتيب الإجابة. اقرأ النص الكامل للتفاصيل. الأسهم لا تثبت تنفيذ المقترحات.':'Short excerpts in answer order. Read the full answer for details. Arrows do not prove proposed actions were performed.',13,'#6a7e8d');
 if(model.goal){paragraph(ar?'السؤال الأصلي':'ORIGINAL QUESTION',12,'#637e8b');paragraph(model.goal,16);}
 if(model.metrics.length)paragraph(model.metrics.map(m=>`${m.label}: ${m.value}`).join('    ·    '),19,'#2c756b');
 for(const [i,s] of model.steps.entries()){
  if(i){nodes.push(`<path d="M500 ${y-9}v21m-6-6 6 6 6-6" fill="none" stroke="#7c9fa7" stroke-width="2"/>`);y+=30;}
  const top=y-24,index=nodes.length;nodes.push('');
  paragraph(/^[\d٠-٩]+[.)]/.test(s.title)?s.title:`${i+1}. ${s.title}`,21,'#254c61');paragraph(s.excerpt,15);
  nodes[index]=`<rect x="48" y="${top}" width="904" height="${y-top}" rx="15" fill="${i%2?'#f0f6f8':'#f4f6fc'}" stroke="#cedde6"/>`;y+=24;
 }
 if(model.limitations.length){paragraph(ar?'قيود يجب تذكرها':'LIMITATIONS TO KEEP IN VIEW',14,'#936831');model.limitations.forEach(v=>paragraph(v,14,'#7b613b'));}
 if(model.sources.length){paragraph(ar?'المصادر المرفقة':'ATTACHED SOURCES',14);model.sources.forEach(s=>{paragraph(s.title,14);paragraph(s.url,12,'#476f92');});}
 paragraph(ar?'مستخرج محلياً من الإجابة المعتمدة. الاعتماد ليس تحققاً مستقلاً من كل حقيقة.':'Locally extracted from the approved answer. Approval is not an independent fact check.',12,'#6a7e8d');
 return {width:1000,height:y+20,svg:`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${y+20}" viewBox="0 0 1000 ${y+20}" role="img" aria-label="${xml(model.title)}"><rect width="100%" height="100%" fill="#fff"/>${nodes.join('')}</svg>`};
}
