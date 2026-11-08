import React, { createContext, useContext, useEffect, useState, type ReactNode, isValidElement, cloneElement, Children } from 'react';
import ar from './locales/ar.json';
export type Language='en'|'ar';
export const languageStorageKey='agent-lab-language';
export function readLanguage():Language {try{return globalThis.localStorage?.getItem(languageStorageKey)==='ar'?'ar':'en';}catch{return 'en';}}
const Context=createContext<{language:Language;setLanguage:(language:Language)=>void}>({language:'en',setLanguage:()=>{}});
export function LocaleProvider({children,initialLanguage}:{children:ReactNode;initialLanguage?:Language}){
 const [language,setState]=useState<Language>(()=>initialLanguage||readLanguage());
 const setLanguage=(value:Language)=>{try{localStorage.setItem(languageStorageKey,value);}catch{}setState(value);};
 useEffect(()=>{document.documentElement.lang=language;document.documentElement.dir=language==='ar'?'rtl':'ltr';document.title=language==='ar'?'مختبر الوكلاء — شاهد الذكاء الاصطناعي أثناء العمل':'AI Agent Lab — Watch AI at Work';},[language]);
 return <Context.Provider value={{language,setLanguage}}>{children}</Context.Provider>;
}
export const useLanguage=()=>useContext(Context);
const catalog=ar as Record<string,string>;
const normalize=(text:string)=>text.replace(/\s+/g,' ').trim();
const sentenceKeys=Object.keys(catalog).filter(key=>key.length>15&&!key.includes('{')).sort((a,b)=>b.length-a.length);
const patterns=Object.entries(catalog).filter(([key])=>/\{\d+\}/.test(key)).map(([key,value])=>{
 const slots:number[]=[];let cursor=0,pattern='';
 for(const match of key.matchAll(/\{(\d+)\}/g)){pattern+=key.slice(cursor,match.index).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(.*?)';slots.push(Number(match[1]));cursor=match.index!+match[0].length;}
 pattern+=key.slice(cursor).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 return {regex:new RegExp('^'+pattern+'$'),slots,value,specificity:key.replace(/\{\d+\}/g,'').length};
}).sort((a,b)=>b.specificity-a.specificity);
export function translateText(text:string,language:Language,depth=0):string {
 if(language==='en'||!text.trim()||depth>5)return text;
 if(/^-?\d+(\.\d+)?$/.test(text.trim())){const decimals=text.trim().split('.')[1]?.length||0;return new Intl.NumberFormat('ar-OM',{useGrouping:false,minimumFractionDigits:decimals,maximumFractionDigits:decimals}).format(Number(text));}
 const key=normalize(text);let translated=catalog[key]||catalog[key.toUpperCase()];
 if(!translated&&text.trim().includes('\n'))return text.split('\n').map(line=>translateText(line,language,depth+1)).join('\n');
 // Event summaries concatenate known action and explanation sentences. Only
 // combine translations when both portions are recognized, leaving custom prose intact.
 if(!translated){for(const sentence of sentenceKeys){const prefix=sentence+(sentence.endsWith('.')?' ':'. ');if(!key.startsWith(prefix))continue;const rest=key.slice(prefix.length),result=translateText(rest,language,depth+1);if(result!==rest){translated=catalog[sentence]+(sentence.endsWith('.')?' ':'. ')+result;break;}}}
 if(!translated){for(const pattern of patterns){const match=pattern.regex.exec(key);if(!match)continue;translated=pattern.value.replace(/\{(\d+)\}/g,(_,index)=>{const slot=pattern.slots.indexOf(Number(index));return slot<0?'':translateText(match[slot+1],language,depth+1);});break;}}
 if(!translated&&/\s·\s/.test(key))translated=key.split(' · ').map(part=>translateText(part,language,depth+1)).join(' · ');
 if(!translated)return text;
 return text.slice(0,text.length-text.trimStart().length)+translated+text.slice(text.trimEnd().length);
}
const translatedAttributes=['aria-label','aria-description','title','placeholder','alt','label'];
export function localizeTree(node:ReactNode,language:Language):ReactNode {
 if(language==='en')return node;
 if(typeof node==='string')return translateText(node,language);
 if(typeof node==='number')return new Intl.NumberFormat('ar-OM',{useGrouping:false}).format(node);
 if(Array.isArray(node))return localizeChildren(node,language);
 if(!isValidElement(node))return node;
 const element=node as React.ReactElement<Record<string,any>>;
 if(element.props.translate==='no')return element;
 // Technical evidence and editable input values must remain exact.
 if(typeof element.type==='string'&&['pre','code','textarea','script','style'].includes(element.type)){
   const attrs:Record<string,any>={};for(const name of translatedAttributes)if(typeof element.props[name]==='string')attrs[name]=translateText(element.props[name],language);
   return cloneElement(element,attrs);
 }
 const props:Record<string,any>={};
 for(const name of translatedAttributes)if(typeof element.props[name]==='string')props[name]=translateText(element.props[name],language);
 if(element.props.children!==undefined)props.children=localizeChildren(element.props.children,language);
 return cloneElement(element,props);
}
function localizeChildren(children:ReactNode,language:Language):ReactNode {
 const list=Children.toArray(children),result:ReactNode[]=[];let text='';
 const flush=()=>{if(text){result.push(translateText(text,language));text='';}};
 for(const child of list){if(typeof child==='string'||typeof child==='number')text+=String(child);else{flush();result.push(localizeTree(child,language));}}
 flush();return result;
}
export function Translate({children}:{children:ReactNode}){const {language}=useLanguage();return <>{localizeTree(children,language)}</>;}
export function formatTime(value:string,language:Language=readLanguage()){return new Date(value).toLocaleTimeString(language==='ar'?'ar-OM':'en-GB',{timeZone:'Asia/Muscat'});}
export function formatDateTime(value:string,language:Language=readLanguage()){return new Date(value).toLocaleString(language==='ar'?'ar-OM':'en-GB',{timeZone:'Asia/Muscat'});}
export function presetText(value:string,language:Language){if(language==='ar')return translateText(value,language);return Object.entries(catalog).find(([,translated])=>translated===value)?.[0]||value;}

export function flowLabels(language:Language){
 const t=(text:string)=>translateText(text,language);
 return {'node.a11yDescription.default':t('Press enter or space to select a node. Press delete to remove it and escape to cancel.'),
 'node.a11yDescription.keyboardDisabled':t('Press enter or space to select a node. You can then use the arrow keys to move the node around. Press delete to remove it and escape to cancel.'),
 'node.a11yDescription.ariaLiveMessage':({direction,x,y}:{direction:string;x:number;y:number})=>t(`Moved selected node ${direction}. New position, x: ${x}, y: ${y}`),
 'edge.a11yDescription.default':t('Press enter or space to select an edge. You can then press delete to remove it or escape to cancel.'),
 'controls.ariaLabel':t('Control Panel'),'controls.zoomIn.ariaLabel':t('Zoom In'),'controls.zoomOut.ariaLabel':t('Zoom Out'),
 'controls.fitView.ariaLabel':t('Fit View'),'controls.interactive.ariaLabel':t('Toggle Interactivity'),
 'minimap.ariaLabel':t('Mini Map'),'handle.ariaLabel':t('Handle')};
}
