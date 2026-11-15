import type {CSSProperties} from 'react';
import {ChartColumn,ChartNoAxesCombined,CloudSun,Code2,Database,FilePenLine,FileSearch,Layers,LifeBuoy,ListTree,Network,PenTool,ShieldCheck,type LucideIcon} from 'lucide-react';
import './avatars.css';

// Keep the shared component API stable across all mission and replay views.
export type AvatarPersonality='explorer'|'analyst'|'maker'|'reviewer'|'storyteller'|'organizer'|'inventor'|'helper'|'weather'|'visualizer'|'preparer'|'generalist';
type AgentIdentity={title:string;ar:string;trait:string;traitAr:string;color:string;light:string;dark:string;symbol:string};
const identities:Record<AvatarPersonality,AgentIdentity>={
 explorer:{title:'Research',ar:'البحث',trait:'Search · evidence · sources',traitAr:'بحث · أدلة · مصادر',color:'#4a7979',light:'#edf5f4',dark:'#285454',symbol:'file-search'},
 analyst:{title:'Data analysis',ar:'تحليل البيانات',trait:'Calculations · patterns · conclusions',traitAr:'حسابات · أنماط · استنتاجات',color:'#5574a0',light:'#edf2f8',dark:'#345174',symbol:'chart-column'},
 preparer:{title:'Data preparation',ar:'إعداد البيانات',trait:'Inputs · collection · organization',traitAr:'مدخلات · جمع · تنظيم',color:'#5d7c86',light:'#edf4f6',dark:'#3e6370',symbol:'database'},
 maker:{title:'Development',ar:'التطوير',trait:'Implementation · tools · building',traitAr:'تنفيذ · أدوات · بناء',color:'#63738a',light:'#f0f3f7',dark:'#405067',symbol:'code'},
 reviewer:{title:'Quality review',ar:'مراجعة الجودة',trait:'Criteria · checks · corrections',traitAr:'معايير · فحوص · تصحيحات',color:'#58806b',light:'#eef5f1',dark:'#365f48',symbol:'shield-check'},
 storyteller:{title:'Writing & explanation',ar:'الكتابة والشرح',trait:'Drafting · synthesis · communication',traitAr:'صياغة · تلخيص · شرح',color:'#677996',light:'#eff2f8',dark:'#465a78',symbol:'file-pen'},
 organizer:{title:'Planning',ar:'التخطيط',trait:'Tasks · dependencies · scheduling',traitAr:'مهام · اعتماديات · جدولة',color:'#6e7e76',light:'#f0f4f1',dark:'#4a5d50',symbol:'list-tree'},
 inventor:{title:'Design',ar:'التصميم',trait:'Structure · concepts · prototypes',traitAr:'هيكلة · مفاهيم · نماذج أولية',color:'#817b97',light:'#f3f1f7',dark:'#5d5378',symbol:'pen-tool'},
 helper:{title:'Guidance',ar:'الإرشاد',trait:'Questions · clarification · support',traitAr:'أسئلة · توضيح · دعم',color:'#6a8490',light:'#f0f5f7',dark:'#45616e',symbol:'life-buoy'},
 weather:{title:'Weather data',ar:'بيانات الطقس',trait:'Observations · measurements · summaries',traitAr:'رصد · قياسات · ملخصات',color:'#6b879b',light:'#f0f5f8',dark:'#48687e',symbol:'cloud-sun'},
 visualizer:{title:'Visualization',ar:'عرض البيانات',trait:'Charts · comparisons · presentation',traitAr:'رسوم · مقارنات · عرض',color:'#6a819c',light:'#eff3f8',dark:'#435d7b',symbol:'chart-combined'},
 generalist:{title:'Task worker',ar:'وكيل المهمة',trait:'Assigned task · scoped inputs · output',traitAr:'مهمة محددة · مدخلات · مخرجات',color:'#788592',light:'#f1f4f7',dark:'#4c5d6b',symbol:'layers'},
};
const leaderIdentity:AgentIdentity={title:'Team coordinator',ar:'منسق الفريق',trait:'Delegation · review · approval',traitAr:'توزيع المهام · مراجعة · اعتماد',color:'#526582',light:'#edf1f7',dark:'#24354d',symbol:'network'};
const symbols:Record<AvatarPersonality|'leader',LucideIcon>={leader:Network,explorer:FileSearch,analyst:ChartColumn,preparer:Database,maker:Code2,reviewer:ShieldCheck,storyteller:FilePenLine,organizer:ListTree,inventor:PenTool,helper:LifeBuoy,weather:CloudSun,visualizer:ChartNoAxesCombined,generalist:Layers};
export function avatarCharacter({leader=false,role='',personality}:{leader?:boolean;role?:string;identity?:string;personality?:AvatarPersonality}={}){
 if(leader)return {personality:'leader' as const,...leaderIdentity};
 const normalized=role.normalize('NFKC').replace(/[\u064b-\u065f\u0670]/g,'');
 const rules:[RegExp,AvatarPersonality][]=[
  [/review|verif|test|check|valid|audit|مراجع|تدقيق|اختبار|تحقق/i,'reviewer'],
  [/weather|meteorolog|forecast|طقس|أرصاد|ارصاد/i,'weather'],
  [/visual|chart|graph|dashboard|رسوم|مخطط|لوحة.*بيانات|عرض.*بيانات/i,'visualizer'],
  [/build|develop|engineer|code|implement|مبرمج|مهندس|تطوير/i,'maker'],
  [/data preparation|data collection|data ingestion|جمع.*بيانات|إعداد.*بيانات|تحضير.*بيانات|تحميل.*بيانات/i,'preparer'],
  [/writ|edit|teach|explain|communicat|story|lesson|كاتب|محرر|شرح|تعليم|درس/i,'storyteller'],
  [/plan|organiz|coordinat|schedul|منظم|تنظيم|تخطيط|تنسيق/i,'organizer'],
  [/design|creativ|idea|invent|مصمم|تصميم|إبداع/i,'inventor'],
  [/research|search|source|discover|explor|باحث|بحث|مصادر/i,'explorer'],
  [/analy|data|math|calcul|statist|محلل|تحليل|بيانات|حساب/i,'analyst'],
  [/advis|support|assist|help|مساعد|مستشار|دعم/i,'helper'],
 ];
 const key=personality??rules.find(([pattern])=>pattern.test(normalized))?.[1]??'generalist';
 return {personality:key,...identities[key]};
}

type Props={color?:string;active?:boolean;small?:boolean;leader?:boolean;identity?:string;role?:string;personality?:AvatarPersonality};
export function Robot({color='blue',active=false,small=false,leader=false,identity='',role='',personality}:Props){
 const agent=avatarCharacter({leader,role,identity,personality});
 const Icon=symbols[agent.personality];
 return <div className={`robot agent-avatar ${color} avatar-${agent.personality} ${active?'working':''} ${small?'small':''}`} data-personality={agent.personality} data-role-symbol={agent.symbol} style={{'--agent-tone':agent.dark,'--agent-surface':agent.light,'--agent-accent':agent.color} as CSSProperties} aria-hidden="true">
  <span className="agent-emblem-frame"><Icon className="agent-role-symbol" strokeWidth={1.7}/><span className="agent-emblem-status"/></span>
 </div>;
}
