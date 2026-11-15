// Export the actual role symbols without a browser or model calls.
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {writeFile} from 'node:fs/promises';
const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'});
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
try{
 const {Robot,avatarCharacter}=await server.ssrLoadModule('/src/Robot.tsx');
 const roles=['Master Agent','Researcher','Data preparation','Analyst','Weather data','Visualization','Builder','Reviewer','Writer','Organizer','Designer','Advisor','Task worker'];
 const tiles=roles.map((role,index)=>{
  const leader=index===0,agent=avatarCharacter({leader,role});
  const markup=renderToStaticMarkup(React.createElement(Robot,{leader,role}));
  const svgs=[...markup.matchAll(/<svg[^>]*>([\s\S]*?)<\/svg>/g)];
  const machine=svgs[0][1],symbol=svgs[1][1];
  const row=Math.floor(index/4),count=Math.min(4,roles.length-row*4);
  const x=(1440-count*340)/2+(index%4)*340,y=132+row*232;
  return `<g transform="translate(${x} ${y})"><rect width="320" height="208" rx="14" fill="#ffffff" stroke="#dbe3ec"/><g class="${leader?'avatar-leader':''}" style="color:${agent.dark};--agent-tone:${agent.dark};--agent-surface:${agent.light};--agent-accent:${agent.color}"><svg x="111" y="8" width="98" height="106" viewBox="0 0 100 108" fill="none">${machine}</svg><rect x="147" y="84" width="26" height="24" rx="4" fill="${agent.light}" stroke="${agent.color}"/><svg x="151" y="87" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${agent.dark}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${symbol}</svg></g><text x="160" y="133" text-anchor="middle" font-family="Segoe UI,sans-serif" font-size="17" font-weight="600" fill="#263b55">${escape(role)}</text><text x="160" y="158" text-anchor="middle" font-family="Segoe UI,sans-serif" font-size="13" fill="#50667d">${escape(agent.title)}</text><text x="160" y="185" text-anchor="middle" font-family="Segoe UI,sans-serif" font-size="11" fill="#63768c">${escape(agent.trait)}</text></g>`;
 });
 const height=154+Math.ceil(roles.length/4)*232;
 await writeFile('../agent-characters-preview.svg',`<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="${height}" viewBox="0 0 1440 ${height}"><style>.agent-shell{fill:#dce5eb;stroke:#7e94a4;stroke-width:1.5}.agent-shoulders{fill:var(--agent-surface);stroke:#9caebb;stroke-width:1.5}.avatar-leader .agent-shell{fill:#435a70;stroke:#263e53}.avatar-leader .agent-shoulders{fill:#2e455b;stroke:#233a4f}</style><rect width="100%" height="100%" fill="#f6f8fb"/><text x="42" y="46" font-family="Segoe UI,sans-serif" font-size="12" letter-spacing="2" fill="#667a92">AGENT LAB · ROLE SYMBOLS</text><text x="40" y="83" font-family="Segoe UI,sans-serif" font-size="30" font-weight="600" fill="#253a53">Clear roles. Professional identities.</text><text x="42" y="112" font-family="Segoe UI,sans-serif" font-size="14" fill="#61758c">Professional machine avatars with task-specific modules, used throughout the workflow.</text>${tiles.join('')}</svg>`);
 console.log('Exported agent-characters-preview.svg');
}finally{await server.close();}
