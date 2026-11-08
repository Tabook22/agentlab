import { describe, it, expect } from 'vitest';
import { citationParts, safeSourceUrl } from './citations';
describe('public research citations',()=>{
  it('renders API citation metadata as links without revealing provider markers',()=>{
    expect(citationParts('Findings [1]',[{start_index:9,end_index:12,url:'https://example.org/study',title:'Study'}])).toEqual([{text:'Findings '},{text:'Study',url:'https://example.org/study'},{text:''}]);
  });
  it('keeps unsafe schemes and credential URLs out of links',()=>{
    expect(safeSourceUrl('javascript:alert(1)')).toBe(false);
    expect(safeSourceUrl('https://user:secret@example.org')).toBe(false);
    expect(citationParts('[Study](https://user:secret@example.org)')[1].url).toBeUndefined();
  });
  it('supports inline source links in final reports as text and safe anchors',()=>{
    expect(citationParts('Use [Study](https://example.org/paper).')[1]).toEqual({text:'Study',url:'https://example.org/paper'});
  });
});
