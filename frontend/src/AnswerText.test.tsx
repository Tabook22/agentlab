import React from 'react';
import {expect,test} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {AnswerText} from './AnswerText';
test('reports become readable sections, emphasis, lists and tables',()=>{
 const html=renderToStaticMarkup(<AnswerText content={'## Purpose\nA **clear** plan.\n\n- First\n- Second\n\n## Costs\n| Item | Cost |\n| --- | --- |\n| Sensor | 20 |\n\n## Next steps\n1. Pilot\n2. Review'}/>);
 for(const text of ['Jump to a section','<strong>clear</strong>','<ul>','<ol>','<table>','scope="col"','answer-section-0'])expect(html).toContain(text);
 expect(html).not.toContain('## Purpose');expect(html).not.toContain('**clear**');
});
test('HTML stays text and only validated public source URLs become links',()=>{
 const html=renderToStaticMarkup(<AnswerText content={'<script>alert(1)</script>\n\n[Study](https://example.org/study) [Bad](javascript:alert(1))'}/>);
 expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>');
 expect(html).toContain('href="https://example.org/study"');expect(html).not.toContain('href="javascript:');
});
test('code blocks and block quotes preserve their text',()=>{
 const html=renderToStaticMarkup(<AnswerText content={'```\nconst x = 2;\n```\n\n> Proposed design, not a tested finding.'}/>);
 expect(html).toContain('<pre><code>const x = 2;</code></pre>');expect(html).toContain('<blockquote>Proposed design');
});
