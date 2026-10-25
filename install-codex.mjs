import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const home=path.join(os.homedir(),'.dsh','dsh-pet');
const rt=JSON.parse(fs.readFileSync(path.join(home,'standalone-runtime.json'),'utf8'));
const gateway=JSON.parse(fs.readFileSync(path.join(root,'.runtime/gateway.json'),'utf8'));
const token=fs.readFileSync(path.join(root,'.runtime/gateway-token'),'utf8').trim();
const file=path.join(home,'standalone-ai.json');
const backup=path.join(home,'standalone-ai.before-codex.json');
if(fs.existsSync(file)&&!fs.existsSync(backup)){
  fs.copyFileSync(file,backup);
  const identity=execFileSync('whoami.exe',['/user','/fo','csv','/nh'],{windowsHide:true,encoding:'utf8'});
  const sid=identity.match(/\bS-1-\d+(?:-\d+)+\b/)[0];
  execFileSync('icacls.exe',[backup,'/inheritance:r','/grant:r',`*${sid}:F`],{windowsHide:true,stdio:'ignore'});
}
const res=await fetch(`http://127.0.0.1:${rt.port}/standalone-ai/settings`,{method:'POST',headers:{'Content-Type':'application/json','X-DSH-Pet-Token':rt.token},body:JSON.stringify({protocol:'openai-compatible',baseUrl:`http://127.0.0.1:${gateway.port}/v1`,model:'codex-local',apiKey:token,enabled:true,automaticWhispers:false,timeoutMs:60000})});
const result=await res.json();
if(!res.ok)throw Error(result.error||'DSH settings save failed');
const sprite=path.join(rt.pluginRoot,'runtime','electron-helper','sprite.js');
let source=fs.readFileSync(sprite,'utf8');
const before=source;
source=source.replace("label: OPEN_TARGET === 'desktop' ? '打开软件' : '打开网站',","label: 'Codex 控制台',");
source=source.replace("{ label: '对话', action: 'chat' }","{ label: '询问 Codex', action: 'chat' }");
source=source.replace("if (window.petBridge) window.petBridge.openDshSite(ORIGIN); // 系统默认浏览器打开（等效 Ctrl+点击链接）","S.postAction(BASE + '/menu/click', { owner: 'Codex 用量', label: 'Codex 控制台', pet: this.pet.id }).catch(() => {});");
source=source.replace('S.buildMoreBranch(this.menuItems)','S.buildMoreBranch(this.menuItems.filter(item => item.label !== \'Codex 控制台\' && item.label !== \'查看剩余用量\'))');
if(source!==before){fs.writeFileSync(sprite,source);await fetch(`http://127.0.0.1:${rt.port}/dsh-pet-7340/reload`,{method:'POST',headers:{'Content-Type':'application/json','X-DSH-Pet-Token':rt.token},body:'{}'});}
console.log('DSH chat now routes to the signed-in local Codex; automatic AI whispers disabled.');
