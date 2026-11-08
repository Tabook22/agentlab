// Export the actual React avatars as a contact sheet without a browser or API calls.
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {writeFile} from 'node:fs/promises';
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
try{
 const {Robot,avatarCharacter}=await server.ssrLoadModule('/src/Robot.tsx');
 const roles=['Master Agent','Researcher','Analyst','Builder','Reviewer','Writer','Organizer','Designer','Advisor'];
 const tiles=roles.map((role,index)=>{
  const leader=index===0,character=avatarCharacter({leader,role});
  const markup=renderToStaticMarkup(React.createElement(Robot,{leader,role}),{identifierPrefix:`character-${index}-`});
  const art='<g transform="translate(106 14) scale(1.125)" fill="none">'+markup.match(/<svg[^>]*>([\s\S]*)<\/svg>/)[1]+'</g>';
  const x=40+(index%3)*378,y=144+Math.floor(index/3)*284;
  return `<g transform="translate(${x} ${y})"><rect width="356" height="264" rx="24" fill="${leader?'#f1eafa':'white'}" stroke="${leader?'#cbb4df':'#e4deed'}"/>${leader?'<rect x="125" y="6" width="106" height="3" rx="1.5" fill="#c5a05c"/>':''}${art}<text x="178" y="197" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="18" font-weight="600" fill="#403350">${role}</text><text x="178" y="220" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="14" fill="${character.dark}">${character.title}</text><text x="178" y="242" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="11" fill="#80768d">${character.trait}</text></g>`;
 });
 await writeFile('../agent-characters-preview.svg',`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1020" viewBox="0 0 1200 1020"><rect width="1200" height="1020" fill="#f8f6fc"/><text x="44" y="47" font-family="Segoe UI, sans-serif" font-size="12" letter-spacing="3" fill="#9374ad">AGENT LAB · THE CHARACTERS</text><text x="42" y="90" font-family="Segoe UI, sans-serif" font-size="34" font-weight="600" fill="#3e3050">A thoughtful leader. A team full of character.</text><text x="44" y="118" font-family="Segoe UI, sans-serif" font-size="15" fill="#82758f">Distinct silhouettes, expressions and accessories — the avatars used in your application.</text>${tiles.join('')}</svg>`);
 console.log('Exported agent-characters-preview.svg');
}finally{await server.close();}
