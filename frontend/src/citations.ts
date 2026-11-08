export function safeSourceUrl(value:string):boolean {
  try {const url=new URL(value);return ['https:','http:'].includes(url.protocol)&&!!url.hostname&&!url.username&&!url.password;} catch{return false;}
}
export type CitationPart={text:string;url?:string};
export function citationParts(text:string,annotations:any[]=[]):CitationPart[] {
  if(annotations.length){
    const chars=Array.from(text),parts:CitationPart[]=[];let cursor=0;
    for(const note of [...annotations].sort((a,b)=>a.start_index-b.start_index)){
      if(!Number.isInteger(note.start_index)||!Number.isInteger(note.end_index)||note.start_index<cursor||note.end_index<=note.start_index||note.end_index>chars.length||!safeSourceUrl(note.url)) continue;
      parts.push({text:chars.slice(cursor,note.start_index).join('')},{text:note.title||'Source',url:note.url});cursor=note.end_index;
    }
    parts.push({text:chars.slice(cursor).join('')});return parts;
  }
  const parts:CitationPart[]=[];const pattern=/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g;let cursor=0;
  for(const match of text.matchAll(pattern)){
    parts.push({text:text.slice(cursor,match.index)});
    parts.push(safeSourceUrl(match[2])?{text:match[1],url:match[2]}:{text:match[0]});cursor=match.index!+match[0].length;
  }
  parts.push({text:text.slice(cursor)});return parts;
}
