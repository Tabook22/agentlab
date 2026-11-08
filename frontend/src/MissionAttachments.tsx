import {useRef,useState} from 'react';
import {Check,ChevronDown,FileText,Image,LoaderCircle,Paperclip,ScanText,Trash2,UploadCloud} from 'lucide-react';
import {HelpButton} from './Help';
import {useLanguage} from './i18n';
import {attachmentAccept,attachmentProblem,type MissionAttachment} from './attachments';
import './attachments.css';

export function MissionAttachments({files,onChange,comments,available,disabled,onBusy,onLive}:{files:MissionAttachment[];onChange:(files:MissionAttachment[])=>void;comments:string;available:boolean;disabled:boolean;onBusy:(busy:boolean)=>void;onLive:()=>void}){
 const {language}=useLanguage(),ar=language==='ar';const input=useRef<HTMLInputElement>(null);
 const [busy,setBusy]=useState(''),[error,setError]=useState(''),[dragging,setDragging]=useState(false);
 function working(value:string){setBusy(value);onBusy(!!value);}
 async function upload(incoming:File[]){
  if(disabled||busy||!incoming.length)return;
  if(files.length+incoming.length>5){setError(ar?'اختر خمسة مرفقات كحد أقصى.':'Choose up to five attachments.');return;}
  if(incoming.some(file=>file.size>10*1024*1024)){setError(ar?'الحد الأقصى لكل ملف 10 ميجابايت.':'Each file can be up to 10 MB.');return;}
  let next=[...files];working('upload');setError('');onLive();
  try{for(const file of incoming){const response=await fetch(`/api/attachments?filename=${encodeURIComponent(file.name)}`,{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Attachment-Upload':'mission-composer'},body:file});const body=await response.json();if(!response.ok)throw Error(typeof body.detail==='string'?body.detail:'Could not read this file.');next=[...next,body];onChange(next);}}
  catch(cause){setError(cause instanceof Error?cause.message:'Could not upload the file.');}finally{working('');if(input.current)input.current.value='';}
 }
 async function read(file:MissionAttachment){
  working(file.id);setError('');
  let polling=false,finished=false;
  const timer=window.setInterval(async()=>{if(polling||finished)return;polling=true;try{const r=await fetch(`/api/attachments/${file.id}`);if(r.ok){const latest=await r.json();if(!finished)onChange(files.map(item=>item.id===file.id?latest:item));}}catch{}finally{polling=false;}},1500);
  try{const response=await fetch(`/api/attachments/${file.id}/read`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({comments})});const body=await response.json();finished=true;if(!response.ok)throw Error(typeof body.detail==='string'?body.detail:'Visual reading failed.');onChange(files.map(item=>item.id===file.id?body:item));}
  catch(cause){setError(cause instanceof Error?cause.message:'Visual reading failed.');const latest=await fetch(`/api/attachments/${file.id}`).then(r=>r.ok?r.json():null).catch(()=>null);if(latest)onChange(files.map(item=>item.id===file.id?latest:item));}
  finally{finished=true;window.clearInterval(timer);working('');}
 }
 async function remove(file:MissionAttachment){
  working('remove');setError('');try{const response=await fetch(`/api/attachments/${file.id}`,{method:'DELETE'});if(!response.ok&&response.status!==409)throw Error('Could not remove this attachment.');onChange(files.filter(item=>item.id!==file.id));}catch(cause){setError(cause instanceof Error?cause.message:'Could not remove this attachment.');}finally{working('');}
 }
 const readingCost=files.reduce((n,file)=>n+(file.reading_usage.estimated_cost_usd??0),0),problem=attachmentProblem(files);
 return <section className={`mission-attachments ${dragging?'is-dragging':''}`} aria-label={ar?'مصادر المهمة':'Mission source attachments'} onDragOver={e=>{e.preventDefault();if(!disabled&&!busy)setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);void upload(Array.from(e.dataTransfer.files));}}>
  <div className="attachments-heading"><span><Paperclip size={17}/><strong>{ar?'أرفق مصادر مهمتك':'Add your source material'}</strong><HelpButton topic="attachments"/></span><button type="button" disabled={disabled||!!busy||files.length>=5} onClick={()=>input.current?.click()}>{busy==='upload'?<LoaderCircle size={15} className="attachment-spinner"/>:<UploadCloud size={16}/>} {ar?'إضافة ملفات أو صور':'Add files or images'}</button></div>
  <input ref={input} type="file" accept={attachmentAccept} multiple aria-label={ar?'اختر مصادر المهمة':'Choose mission source files'} className="attachment-file-input" disabled={disabled||!!busy} onChange={e=>void upload(Array.from(e.target.files??[]))}/>
  <p className="attachments-help">{ar?'اسحب ملفاً هنا أو اختره. اكتب أو سجّل تعليماتك أعلاه ليعرف القائد كيف يستخدمه.':'Drop files here or choose them. Type or record your instructions above so the master knows how to use them.'}</p><small>{ar?'TXT، PDF، DOCX وصور · حتى 5 ملفات، 10 ميجابايت لكل ملف':'TXT, PDF, DOCX & images · up to 5 files, 10 MB each'}</small>
  {files.length>0&&<div className="attachment-cards">{files.map(file=><article key={file.id} className={`attachment-card ${file.status==='ready'?'is-ready':'needs-reading'}`}><div className="attachment-card-top"><span className="attachment-kind">{file.media_type.startsWith('image/')?<img src={`/api/attachments/${file.id}/thumbnail`} alt={file.filename}/>:<FileText size={19}/>}</span><div><strong dir="auto">{file.filename}</strong><small>{file.byte_size<1024?`${file.byte_size} B`:`${(file.byte_size/1024).toFixed(0)} KB`} · {file.page_count>0?`${file.page_count} ${ar?(file.page_count===1?'صفحة':'صفحات'):(file.page_count===1?'page':'pages')}`:ar?'مستند Word':'Word document'}</small></div><button type="button" aria-label={`${ar?'إزالة':'Remove'} ${file.filename}`} disabled={disabled||!!busy} onClick={()=>void remove(file)}><Trash2 size={15}/></button></div>
   <div className="attachment-status">{file.status==='ready'?<><Check size={14}/>{ar?'تم الاستخراج — جاهز للخطة':'Extracted — ready for planning'}<span>{file.character_count.toLocaleString()} {ar?'حرف':'characters'}</span></>:<><ScanText size={15}/>{ar?'صور أو صفحات تحتاج قراءة':'Visual content needs reading'}</>}</div>
   {file.visual_labels.length>0&&<div className="attachment-reading-progress"><span>{ar?'المحتوى المرئي':'Visual coverage'}: {file.reading_progress?.completed??0} / {file.visual_labels.length} {ar?'صورة أو صفحة':'images / pages'}</span><progress aria-label={ar?'تقدم قراءة الصور':'Visual reading progress'} value={file.reading_progress?.completed??0} max={file.visual_labels.length}/><small>{ar?'تُقرأ جميع الصور على دفعات صغيرة. تُحفظ الدفعات المكتملة عند إعادة المحاولة بنفس التعليمات.':'All illustrations are read in small batches. Completed batches are saved; retry with the same instructions to resume.'}</small></div>}
   {file.status!=='ready'&&<div className="attachment-read"><p>{ar?'تُرسل الصور أو الصفحات المصوّرة إلى OpenAI لقراءتها وفق تعليماتك. قراءة مدفوعة لا تبدأ المهمة.':'Images or scanned pages are sent to OpenAI for reading with your instructions. This paid reading does not start the mission.'}</p><button type="button" disabled={disabled||!!busy||!available||comments.trim().length<5} onClick={()=>void read(file)}>{busy===file.id?<LoaderCircle size={15} className="attachment-spinner"/>:<ScanText size={15}/>} {busy===file.id?(ar?'جارٍ القراءة…':'Reading…'):(file.reading_progress?.completed?(ar?'متابعة القراءة':'Continue reading'):(ar?'اقرأ المحتوى المرئي':'Read visual content'))}</button>{comments.trim().length<5&&<small>{ar?'أضف تعليماتك أولاً، كتابةً أو بالصوت.':'Add your instructions first, by typing or voice.'}</small>}{!available&&<small>{ar?'تحتاج القراءة البصرية مفتاح OpenAI المحفوظ.':'Visual reading needs the saved backend OpenAI key.'}</small>}</div>}
   <details className="attachment-preview"><summary>{ar?'مراجعة النص والتغطية':'Review text and coverage'}<ChevronDown size={13}/></summary>{file.text?<pre dir="auto">{file.text}</pre>:<p>{ar?'سيظهر النص بعد القراءة البصرية.':'Text will appear after visual reading.'}</p>}{file.notices.map(note=><p className="attachment-notice" dir="auto" key={note}>{note}</p>)}</details>
  </article>)}</div>}
  {!!readingCost&&<p className="attachment-cost">{ar?'تكلفة قراءة المرفقات التقديرية، منفصلة عن التنفيذ':'Estimated attachment reading cost, separate from execution'}: ${readingCost.toFixed(4)}</p>}
  {files.length>0&&<p className="attachment-preserved">{ar?'تُحفظ الملفات الأصلية محلياً. طلب الخطة يرسل تعليماتك والمحتوى المستخرج إلى OpenAI. لا يعمل الوكلاء قبل موافقتك.':'Original files stay saved locally. Asking for a plan sends your comments and extracted content to OpenAI. Workers start only after you approve the plan.'}</p>}
  {problem&&<p className="attachment-pending" role="status">{problem}</p>}{error&&<p className="attachment-error" role="alert">{error}</p>}
 </section>;
}
