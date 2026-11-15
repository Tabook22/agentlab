import {safeSourceUrl} from './citations';
import type {LabEvent} from './events';
export type ResourceKind='video'|'paper'|'book'|'article'|'podcast'|'tool'|'course';
export type LearningResource={url:string;title:string;kind:ResourceKind;why:string;how_to_use:string;level:string;access:string;creator?:string;year?:string};
export type ResourceState={status:string;phase?:string;message?:string;introduction?:string;items:LearningResource[];start_here_urls?:string[];missing_types?:ResourceKind[];limitations?:string[];checked_at?:string;provenance?:string};
export const resourceKinds:Record<ResourceKind,{en:string;ar:string}>={video:{en:'Videos & talks',ar:'فيديو ومحاضرات'},paper:{en:'Research papers',ar:'أوراق بحثية'},book:{en:'Books',ar:'كتب'},article:{en:'Articles & magazines',ar:'مقالات ومجلات'},podcast:{en:'Podcasts',ar:'بودكاست'},tool:{en:'Tools & applications',ar:'أدوات وتطبيقات'},course:{en:'Courses & tutorials',ar:'دورات ودروس'}};
export function safeResources(state:ResourceState):ResourceState{
 const seen=new Set<string>();const items=(state.items??[]).filter(item=>item&&resourceKinds[item.kind]&&safeSourceUrl(item.url)&&!seen.has(item.url)&&(seen.add(item.url),true));
 return {...state,items,start_here_urls:(state.start_here_urls??[]).filter(url=>seen.has(url))};
}
export function recordedResources(events:LabEvent[]):ResourceState{
 const complete=events.findLast(e=>e.type==='mission.completed');
 const event=events.findLast(e=>e.type.startsWith('answer.resources_')&&e.sequence>(complete?.sequence??Infinity));
 return event?.payload.resources?safeResources(event.payload.resources):{status:'not_searched',items:[]};
}
