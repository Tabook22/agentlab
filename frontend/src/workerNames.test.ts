import {expect,test} from 'vitest';
import {normalizeWorkerName,workerNamesError} from './workerNames';
test('Arabic and English names are preserved and normalized for uniqueness',()=>{
 expect(workerNamesError(['الباحث أحمد','My Editor'])).toBe('');
 expect(normalizeWorkerName('  Ａｌｉ  ')).toBe('Ali');
 for(const names of [['same','SAME'],['','Editor'],['a'.repeat(61)],['New\nName'],['Ａ','A']])expect(workerNamesError(names)).not.toBe('');
});
