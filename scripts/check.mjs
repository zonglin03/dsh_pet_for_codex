import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
for(const file of fs.readdirSync(root).filter(x=>x.endsWith('.mjs'))){
  const result=spawnSync(process.execPath,['--check',path.join(root,file)],{encoding:'utf8'});
  if(result.status!==0)throw Error(result.stderr);
}
const html=fs.readFileSync(path.join(root,'console.html'),'utf8');
new Function(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
console.log('JavaScript syntax checks passed.');
