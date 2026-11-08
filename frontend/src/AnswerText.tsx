import {Fragment,type ReactNode} from 'react';
import {List} from 'lucide-react';
import {citationParts} from './citations';
import {useLanguage} from './i18n';

function emphasis(text:string):ReactNode[]{
 const pattern=/\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`|\*([^*\n]+)\*/g;
 const parts:ReactNode[]=[];let cursor=0;
 for(const match of text.matchAll(pattern)){
  parts.push(text.slice(cursor,match.index));
  parts.push(match[1]||match[2]?<strong key={match.index}>{match[1]??match[2]}</strong>:match[3]?<code key={match.index}>{match[3]}</code>:<em key={match.index}>{match[4]}</em>);
  cursor=match.index!+match[0].length;
 }
 parts.push(text.slice(cursor));return parts;
}
function inline(text:string){return citationParts(text).map((part,i)=>part.url?<a key={i} href={part.url} target="_blank" rel="noopener noreferrer">{emphasis(part.text)}</a>:<Fragment key={i}>{emphasis(part.text)}</Fragment>);}
function cells(line:string){return line.trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(cell=>cell.trim());}
const heading=(line:string)=>/^(#{1,6})\s+(.+)$/.exec(line);
const item=(line:string)=>/^\s*(?:([-*+])|\d+[.)])\s+(.+)$/.exec(line);
export function AnswerText({content}:{content:string}){
 const {language}=useLanguage(),ar=language==='ar';
 const lines=content.replace(/\r\n?/g,'\n').split('\n'),blocks:ReactNode[]=[],sections:{id:string;title:string;depth:number}[]=[];
 let i=0;
 while(i<lines.length){
  const line=lines[i];if(!line.trim()){i++;continue;}
  const h=heading(line);
  if(h){const id=`answer-section-${i}`;sections.push({id,title:h[2],depth:h[1].length});const Tag=`h${Math.max(3,Math.min(6,h[1].length+1))}` as 'h3'|'h4'|'h5'|'h6';blocks.push(<Tag id={id} key={i}>{inline(h[2])}</Tag>);i++;continue;}
  if(line.trim().startsWith('```')){const start=i;const code=[];i++;while(i<lines.length&&!lines[i].trim().startsWith('```'))code.push(lines[i++]);if(i<lines.length)i++;blocks.push(<pre key={start}><code>{code.join('\n')}</code></pre>);continue;}
  if(/^\s*(?:---+|\*\*\*+)\s*$/.test(line)){blocks.push(<hr key={i++}/>);continue;}
  if(i+1<lines.length&&line.includes('|')&&cells(lines[i+1]).length>=2&&cells(lines[i+1]).every(cell=>/^:?-{3,}:?$/.test(cell))){const start=i,headers=cells(line),rows:string[][]=[];i+=2;while(i<lines.length&&lines[i].trim()&&lines[i].includes('|'))rows.push(cells(lines[i++]));blocks.push(<div className="answer-table" key={start}><table><thead><tr>{headers.map((cell,n)=><th key={n} scope="col">{inline(cell)}</th>)}</tr></thead><tbody>{rows.map((row,n)=><tr key={n}>{row.map((cell,c)=><td key={c}>{inline(cell)}</td>)}</tr>)}</tbody></table></div>);continue;}
  const list=item(line);
  if(list){const start=i,ordered=!list[1],items:string[]=[];while(i<lines.length){const next=item(lines[i]);if(!next||!next[1]!==ordered)break;items.push(next[2]);i++;}const Tag=ordered?'ol':'ul';blocks.push(<Tag key={start}>{items.map((text,n)=><li key={n}>{inline(text)}</li>)}</Tag>);continue;}
  if(/^>\s?/.test(line)){const start=i,quote=[];while(i<lines.length&&/^>\s?/.test(lines[i]))quote.push(lines[i++].replace(/^>\s?/,''));blocks.push(<blockquote key={start}>{inline(quote.join('\n'))}</blockquote>);continue;}
  const start=i,text=[line];i++;
  while(i<lines.length&&lines[i].trim()&&!heading(lines[i])&&!item(lines[i])&&!/^(?:```|>|---+$)/.test(lines[i])&&!(i+1<lines.length&&lines[i].includes('|')&&cells(lines[i+1]).every(cell=>/^:?-{3,}:?$/.test(cell))))text.push(lines[i++]);
  blocks.push(<p key={start}>{inline(text.join('\n'))}</p>);
 }
 const topLevel=Math.min(...sections.map(section=>section.depth));
 const navigation=sections.filter(section=>section.depth===topLevel);
 return <div className="answer-reading" dir="auto">{navigation.length>2&&<nav className="answer-contents" aria-label={ar?'أقسام الإجابة':'Answer sections'}><strong><List size={15}/>{ar?'انتقل إلى القسم':'Jump to a section'}</strong><div>{navigation.map(section=><a href={`#${section.id}`} key={section.id}>{section.title.replace(/\*\*/g,'')}</a>)}</div></nav>}{blocks}</div>;
}
