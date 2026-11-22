import {formatDateTime} from './i18n';
import type {StudioRun,StudioSummary} from './studioApi';
export function SavedActivities({runs,run,busy,onOpen,ar}:{runs:StudioSummary[];run:StudioRun|null;busy:boolean;onOpen:(id:string)=>void;ar:boolean}){
 return runs.length?<label className="studio-saved">{ar?'أنشطة محفوظة في المختبر المشترك':'Saved in this shared lab'}<select disabled={busy} value={run?.id??''} onChange={e=>onOpen(e.target.value)} aria-label={ar?'افتح نشاطًا محفوظًا':'Open a saved activity'}><option value="" disabled>{ar?'اختر نشاطًا':'Choose an activity'}</option>{runs.map(row=><option key={row.id} value={row.id}>{formatDateTime(row.created_at,ar?'ar':'en')} · {row.status==='COMPLETED'?(ar?'مكتمل':'Complete'):ar?'قيد التدريب':'In progress'} · {row.id.slice(0,6)}</option>)}</select></label>:null;
}
