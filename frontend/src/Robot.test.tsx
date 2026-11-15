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

test('functional symbols match specific tasks before broad data roles',()=>{
 for(const [role,symbol] of [['Weather data','cloud-sun'],['Visualization','chart-combined'],['Data preparation','database'],['Data verifier','shield-check'],['Researcher','file-search'],['Writer','file-pen'],['Developer','code'],['Planner','list-tree'],['Designer','pen-tool']])expect(avatarCharacter({role}).symbol).toBe(symbol);
 expect(avatarCharacter({role:'بَاحِث'}).symbol).toBe('file-search');
 expect(avatarCharacter({role:'بيانات الطقس'}).symbol).toBe('cloud-sun');
 expect(avatarCharacter({role:'إعداد البيانات'}).symbol).toBe('database');
 expect(avatarCharacter({role:'عرض البيانات'}).symbol).toBe('chart-combined');
});

test('unknown roles remain neutral rather than acquiring an invented specialty',()=>{
 expect(avatarCharacter({role:'Custom role',identity:'one'}).symbol).toBe('layers');
 expect(avatarCharacter({role:'Custom role',identity:'two'}).symbol).toBe('layers');
 const html=renderToStaticMarkup(<Robot role="Researcher"/>);
 expect(html).toContain('data-role-symbol="file-search"');
 expect(html).toContain('agent-role-symbol');
 expect(html).not.toContain('avatar-eyes');expect(html).not.toContain('avatar-character');
 expect(avatarCharacter({leader:true}).title).toBe('Team coordinator');
});
