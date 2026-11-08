import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
const dir=path.resolve('src');const result=new Set();
const normalize=s=>s.replace(/\s+/g,' ').trim();
const attrs=new Set(['aria-label','title','placeholder','alt','label']);
function add(s){s=normalize(s);if(!/[A-Za-z]/.test(s)||s.length<2||s.startsWith('/')||s.startsWith('http')||s.includes('=>')||['POST','PATCH','DELETE'].includes(s))return;result.add(s);}
for(const file of fs.readdirSync(dir).filter(n=>/\.(tsx|ts)$/.test(n)&&!/\.test\.tsx?$/.test(n)&&!['i18n.tsx'].includes(n))){
 const source=ts.createSourceFile(file,fs.readFileSync(path.join(dir,file),'utf8'),ts.ScriptTarget.Latest,true, file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 function visit(n){
  let attr;for(let p=n.parent;p;p=p.parent){if(ts.isJsxAttribute(p)){attr=p.name.text;break;}if(ts.isFunctionLike(p))break;}
  if(attr&&!attrs.has(attr))return;
  if(ts.isJsxText(n))add(n.text);
  if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n)){
   const p=n.parent;
   if(!ts.isImportDeclaration(p)&&!ts.isExportDeclaration(p)&&!(ts.isPropertyAssignment(p)&&p.name===n)&& !n.text.startsWith('./') && (/\s/.test(n.text)||/^[A-Z][A-Za-z ]+$/.test(n.text)||attr))add(n.text);
  }
  if(ts.isTemplateExpression(n)){let text=n.head.text;n.templateSpans.forEach((span,i)=>{text+='{'+i+'}'+span.literal.text;});if(/\s/.test(text))add(text);}
  if(ts.isJsxElement(n)||ts.isJsxFragment(n)){
   let chunk='',index=0;
   function flush(){if(/[A-Za-z]{3}/.test(chunk)&&index)add(chunk);chunk='';index=0;}
   for(const child of n.children){if(ts.isJsxText(child))chunk+=child.text;else if(ts.isJsxExpression(child)&&child.expression){chunk+='{'+index+++'}';}else flush();}flush();
  }
  ts.forEachChild(n,visit);
 }
 visit(source);
}
fs.writeFileSync('scripts/ui-inventory.json',JSON.stringify([...result].sort(),null,2));
console.log(result.size+' strings');
