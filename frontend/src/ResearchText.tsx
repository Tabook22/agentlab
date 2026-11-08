import { Translate } from './i18n';
import { citationParts, safeSourceUrl } from './citations';
export function ResearchText({content,citations=[]}:{content:string;citations?:any[]}) {
  return <Translate>{<p className="content-artifact">{citationParts(content,citations).map((part,i)=>part.url?<a key={i} href={part.url} target="_blank" rel="noopener noreferrer">{part.text}</a>:<span key={i}>{part.text}</span>)}</p>}</Translate>;
}
export function ResearchSources({sources=[]}:{sources?:{url:string;title:string}[]}) {
  const valid=sources.filter(source=>safeSourceUrl(source.url));
  if(!valid.length)return null;
  return <Translate>{<details className="research-sources" open><summary>Research sources · {valid.length} links</summary><ul>{valid.map(source=><li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title||new URL(source.url).hostname}</a><small>{new URL(source.url).hostname}</small></li>)}</ul><small>Retrieved references support the research brief. Relevance and local applicability still require review.</small></details>}</Translate>;
}
