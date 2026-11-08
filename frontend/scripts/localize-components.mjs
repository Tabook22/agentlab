import ts from 'typescript';import fs from 'node:fs';
const names=fs.readdirSync('src').filter(n=>n.endsWith('.tsx')&&!['i18n.tsx','Robot.tsx'].includes(n));
for(const name of names){const file='src/'+name;let text=fs.readFileSync(file,'utf8');if(text.includes("import { Translate"))continue;
 const sf=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),edits=[];
 const hasJsx=node=>{let found=false;function walk(n){if(ts.isJsxElement(n)||ts.isJsxSelfClosingElement(n)||ts.isJsxFragment(n))found=true;else ts.forEachChild(n,walk);}walk(node);return found;};
 function visit(n){if(ts.isReturnStatement(n)&&n.expression&&hasJsx(n.expression)){edits.push({start:n.expression.getStart(sf),end:n.expression.end});return;}ts.forEachChild(n,visit);}visit(sf);
 for(const e of edits.sort((a,b)=>b.start-a.start))text=text.slice(0,e.start)+'<Translate>{'+text.slice(e.start,e.end)+'}</Translate>'+text.slice(e.end);
 if(edits.length)fs.writeFileSync(file,"import { Translate } from './i18n';\n"+text);
}
