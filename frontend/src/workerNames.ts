export function normalizeWorkerName(name:string){return name.normalize('NFKC').trim();}
export function workerNamesError(names:string[]):string {
 const clean=names.map(normalizeWorkerName);
 if(clean.some(name=>!name||Array.from(name).length>60||/[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}]/u.test(name)))return 'Use 1–60 visible characters for each worker name.';
 if(new Set(clean.map(name=>name.toLocaleLowerCase())).size!==clean.length)return 'Give each worker a different name.';
 return '';
}
