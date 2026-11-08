import React from 'react';
import {expect,test} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {Robot,avatarCharacter} from './Robot';

test('leader identity is explicit and cannot be confused with a purple worker',()=>{
 expect(avatarCharacter({leader:true,role:'Researcher'}).personality).toBe('leader');
 const html=renderToStaticMarkup(<><Robot leader/><Robot color="purple" role="Designer"/></>);
 expect((html.match(/data-personality="leader"/g)??[]).length).toBe(1);
 expect(html).toContain('data-personality="inventor"');
});
test('personality follows the same role across layouts, languages and name changes',()=>{
 expect(avatarCharacter({role:'Researcher',identity:'a'}).personality).toBe('explorer');
 expect(avatarCharacter({role:'باحث',identity:'a'}).personality).toBe('explorer');
 expect(avatarCharacter({role:'Analyst',identity:'b'}).personality).toBe('analyst');
 expect(avatarCharacter({role:'Reviewer',identity:'c'}).personality).toBe('reviewer');
 expect(avatarCharacter({role:'Writer',identity:'d'}).personality).toBe('storyteller');
 expect(avatarCharacter({identity:'stable-id'})).toEqual(avatarCharacter({identity:'stable-id'}));
});
test('multiple avatars preserve activity flags independently',()=>{
 const html=renderToStaticMarkup(<><Robot role="Researcher" active/><Robot role="Researcher"/></>);
 expect((html.match(/avatar-explorer working/g)??[]).length).toBe(1);
});
