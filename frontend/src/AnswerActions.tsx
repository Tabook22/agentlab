import { apiBase } from './apiBase';
import {useEffect,useRef,useState} from 'react';
import {Check,Clipboard,Download,FileText,FileType2,LoaderCircle,RotateCcw,Sparkles,X} from 'lucide-react';
import {useLanguage} from './i18n';
import {answerPlainText,reusablePrompt,type AnswerPackage} from './answerPackage';
import './answerActions.css';

export function AnswerActions({missionId}:{missionId:string}){
 const {language}=useLanguage(),ar=language==='ar';
 const [data,setData]=useState<AnswerPackage|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(''),[prompt,setPrompt]=useState<string|null>(null),[manual,setManual]=useState<string|null>(null);
 const manualRef=useRef<HTMLTextAreaElement>(null),editorRef=useRef<HTMLTextAreaElement>(null),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;let alive=true;fetch(`${apiBase}/missions/${missionId}/answer/package`).then(async response=>{const body=await response.json();if(!response.ok)throw Error(body.detail||'The approved answer is unavailable.');if(alive)setData(body);}).catch(cause=>{if(alive)setError(cause.message);});return()=>{alive=false;mounted.current=false;};},[missionId]);
 useEffect(()=>{if(manual!==null){manualRef.current?.focus();manualRef.current?.select();}},[manual]);
 useEffect(()=>{if(prompt!==null)editorRef.current?.focus();},[prompt===null]);
 async function copy(text:string,rich=false){
  setNotice('');setError('');
  try{
   const reading=document.querySelector('#mission-answer .answer-reading');
   if(rich&&reading&&typeof ClipboardItem!=='undefined'&&navigator.clipboard?.write){
    const clone=reading.cloneNode(true) as HTMLElement;clone.querySelector('.answer-contents')?.remove();clone.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));clone.querySelectorAll('table').forEach(node=>node.setAttribute('style','border-collapse:collapse;width:100%;margin:12px 0'));clone.querySelectorAll('th,td').forEach(node=>node.setAttribute('style','border:1px solid #ddd;padding:8px;text-align:start;vertical-align:top'));clone.querySelectorAll('th').forEach(node=>node.setAttribute('style','border:1px solid #ddd;padding:8px;text-align:start;background:#eee7f5'));
    const escape=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
    const html=`<div style="font-family:Arial;font-size:11pt;line-height:1.5"><h1>${escape(data!.title)}</h1><h2>${ar?'الهدف الأصلي':'Original goal'}</h2><p dir="auto">${escape(data!.goal)}</p>${clone.innerHTML}${data!.limitations.length?`<h2>${ar?'القيود':'Limitations'}</h2><ul>${data!.limitations.map(v=>`<li>${escape(v)}</li>`).join('')}</ul>`:''}${data!.sources.length?`<h2>${ar?'المصادر':'Sources'}</h2><ul>${data!.sources.map(s=>`<li><a href="${escape(s.url)}">${escape(s.title)}</a> - ${escape(s.url)}</li>`).join('')}</ul>`:''}</div>`;
    try{await navigator.clipboard.write([new ClipboardItem({'text/plain':new Blob([text],{type:'text/plain'}),'text/html':new Blob([html],{type:'text/html'})})]);}
    catch{await navigator.clipboard.writeText(text);}
   }else await navigator.clipboard.writeText(text);
   if(mounted.current)setNotice(ar?'تم النسخ. يمكنك لصقه في تطبيق آخر.':'Copied. You can paste it into another application.');
  }catch{setManual(text);setNotice(ar?'حدد النص وانسخه باستخدام Ctrl+C.':'Select the text and press Ctrl+C to copy.');}
 }
 async function download(format:'pdf'|'docx',variant:'answer'|'prompt'){
  setBusy(`${variant}-${format}`);setError('');setNotice('');
  try{
   const response=await fetch(`${apiBase}/missions/${missionId}/answer/export`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({format,variant,...(variant==='prompt'?{prompt_text:prompt}:{})})});
   if(!response.ok){const body=await response.json();throw Error(body.detail||'Could not export the document.');}
   const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;const fileTitle=(data?.title||'mission').replace(/[^\p{L}\p{N}-]+/gu,'-').replace(/^-+|-+$/g,'').slice(0,70);a.download=`${fileTitle||'mission'}-${variant}.${format}`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
   if(mounted.current)setNotice(ar?'تم تجهيز الملف وتنزيله.':'Your document has been downloaded.');
  }catch(cause){if(mounted.current)setError(cause instanceof Error?cause.message:'Could not export the document.');}finally{if(mounted.current)setBusy('');}
 }
 const disabled=!data||!!busy;
 return <section className="answer-actions" aria-label={ar?'استخدام الإجابة وتصديرها':'Use and export your answer'}>
  <div className="answer-actions-heading"><span className="answer-actions-mark"><Download size={21}/></span><div><strong>{ar?'إجابتك جاهزة للاستخدام':'Your answer, ready to use'}</strong><p>{ar?'انسخها أو احفظ تقريراً منسقاً أو حوّلها إلى موجّه قابل لإعادة الاستخدام.':'Copy it, save a formatted report, or turn it into a reusable prompt.'}</p></div></div>
  <div className="answer-action-buttons"><button type="button" disabled={disabled} onClick={()=>void copy(answerPlainText(data!),true)}><Clipboard size={16}/>{ar?'نسخ الإجابة':'Copy answer'}</button><button type="button" disabled={disabled} onClick={()=>void download('pdf','answer')}>{busy==='answer-pdf'?<LoaderCircle size={16} className="export-spinner"/>:<FileType2 size={16}/>}PDF</button><button type="button" disabled={disabled} onClick={()=>void download('docx','answer')}>{busy==='answer-docx'?<LoaderCircle size={16} className="export-spinner"/>:<FileText size={16}/>}Word</button><button type="button" className="answer-convert" disabled={disabled} onClick={()=>setPrompt(reusablePrompt(data!,language))}><Sparkles size={16}/>{ar?'تحويل إلى موجّه':'Turn into a prompt'}</button></div>
  <small>{ar?'النسخ والتصدير محليان، دون رسوم API إضافية. يُحفظ الهدف والمصادر والقيود مع التقرير.':'Copy and export are local, with no additional API charges. Reports include the goal, sources and limitations.'}</small>
  {error&&<p role="alert" className="answer-export-error">{error}</p>}{notice&&<p role="status" className="answer-export-notice"><Check size={15}/>{notice}</p>}
  {manual!==null&&<div className="answer-manual-copy"><button type="button" onClick={()=>setManual(null)} aria-label={ar?'إغلاق النسخ اليدوي':'Close manual copy'}><X size={15}/></button><label htmlFor="answer-manual-copy">{ar?'انسخ النص باستخدام Ctrl+C':'Copy this text with Ctrl+C'}</label><textarea id="answer-manual-copy" ref={manualRef} readOnly dir="auto" value={manual}/></div>}
  {prompt!==null&&<section className="answer-prompt-editor" aria-label={ar?'موجّه قابل لإعادة الاستخدام':'Reusable prompt editor'}><header><div><span>{ar?'من الحل إلى الخطوة التالية':'FROM SOLUTION TO NEXT ACTION'}</span><h3>{ar?'راجع موجّهك وعدّله':'Review and refine your prompt'}</h3></div><button type="button" aria-label={ar?'إغلاق محرر الموجّه':'Close prompt editor'} onClick={()=>setPrompt(null)} disabled={!!busy}><X size={17}/></button></header><p>{ar?'هذه مسودة مستخلصة من الإجابة المعتمدة، وليست نتيجة جديدة معتمدة من القائد. عدّلها قبل إعطائها لأي أداة ذكاء اصطناعي.':'This draft is derived from the approved answer. It is not a new Master-approved result. Edit it before using it with another AI tool.'}</p><label htmlFor="answer-reusable-prompt">{ar?'الموجّه القابل للتحرير':'Editable prompt'}</label><textarea id="answer-reusable-prompt" ref={editorRef} dir="auto" value={prompt} onChange={e=>setPrompt(e.target.value)} maxLength={60000} disabled={!!busy}/><div className="answer-prompt-tools"><button type="button" disabled={!!busy||!prompt.trim()} onClick={()=>void copy(prompt)}><Clipboard size={15}/>{ar?'نسخ الموجّه':'Copy prompt'}</button><button type="button" disabled={!!busy||!prompt.trim()} onClick={()=>void download('pdf','prompt')}><FileType2 size={15}/>{ar?'تنزيل PDF':'Download PDF'}</button><button type="button" disabled={!!busy||!prompt.trim()} onClick={()=>void download('docx','prompt')}><FileText size={15}/>{ar?'تنزيل Word':'Download Word'}</button><button type="button" className="prompt-reset" disabled={!!busy} onClick={()=>setPrompt(reusablePrompt(data!,language))}><RotateCcw size={14}/>{ar?'استعادة المسودة الأصلية':'Reset draft'}</button></div></section>}
 </section>;
}
