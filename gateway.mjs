import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { CodexClient } from './codex-client.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const runtime = path.join(root, '.runtime');
const stateFile = path.join(runtime, 'conversation.json');
const tokenFile = path.join(runtime, 'gateway-token');
const clip = (s,n) => Array.from(String(s || '').replace(/\s+/g,' ').trim()).slice(0,n).join('');

export async function startGateway(petRequest, formatUsage) {
  fs.mkdirSync(runtime,{recursive:true});
  if (!fs.existsSync(tokenFile)) fs.writeFileSync(tokenFile,randomBytes(32).toString('base64url'),{mode:0o600});
  const token = fs.readFileSync(tokenFile,'utf8').trim();
  const port = Number(process.env.CODEX_PET_GATEWAY_PORT || 3081);
  const client = new CodexClient();
  const items = new Map();
  const defaultWorkspace = process.env.CODEX_PET_WORKSPACE || path.join(root,'workspace');
  if(!fs.existsSync(stateFile))fs.mkdirSync(defaultWorkspace,{recursive:true});
  let saved = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile,'utf8').replace(/^\uFEFF/,'')) : { threadId:null, cwd:defaultWorkspace };
  let loaded = false, loading = null, active = null, started = false, busy = false, lastError = null, messages = [], requests = [], rateLimits = null;
  const persist = () => fs.writeFileSync(stateFile,JSON.stringify(saved,null,2));
  const bubble = text => petRequest('/broadcast?pet=main&surface=desktop','POST',{text:clip(text,400),duration:25000,anim:false});
  const status = (state,task) => petRequest('/work-status','POST',{state,task:clip(task,40)});
  const push = (role,text) => { messages.push({role,text,time:new Date().toISOString()}); if(messages.length>100)messages.shift(); };
  async function connect() { await client.connect(); }
  async function loadConversation() {
    await connect();
    if (loaded) return;
    const params = {cwd:saved.cwd,sandbox:'workspace-write',approvalPolicy:'on-request',approvalsReviewer:'user'};
    if(saved.threadId) {
      await client.call('thread/resume',{...params,threadId:saved.threadId,excludeTurns:true});
      const history=await client.call('thread/read',{threadId:saved.threadId,includeTurns:true});
      const restored=[];
      for(const turn of history.thread.turns||[])for(const item of turn.items||[]){
        if(item.type==='agentMessage')restored.push({role:'assistant',text:item.text,id:item.id});
        if(item.type==='userMessage')restored.push({role:'user',text:(item.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n'),id:item.id});
      }
      messages=restored.slice(-100);
    }
    else {
      const result = await client.call('thread/start',{...params,developerInstructions:'你通过 DSH 桌宠与用户交互。用中文回答，简洁说明进度；遵循用户任务，执行需要的工作。不要自动发送外部消息。'});
      saved.threadId = result.thread.id; persist();
      await client.call('thread/name/set',{threadId:saved.threadId,name:'DSH 桌宠'});
    }
    loaded=true;
  }
  async function conversation() {
    if(!loading)loading=loadConversation().finally(()=>{loading=null;});
    return loading;
  }
  async function submit(text) {
    if(busy) throw new Error('Codex 正在处理任务，请完成或停止当前任务后再发送。');
    if(typeof text!=='string'||!text.trim()||text.length>32768)throw new Error('请输入有效任务（不超过 32768 字符）。');
    busy=true; started=false; lastError=null;
    try {
      await conversation(); push('user',text);
      await status('thinking','Codex 正在处理桌宠任务');
      const result = await client.call('turn/start',{threadId:saved.threadId,input:[{type:'text',text}]});
      if(busy)active=result.turn.id;
      return '已交给 Codex。进度与结果会显示在桌宠气泡；完整回复和审批请打开 Codex 控制台。';
    } catch(error) {busy=false;lastError=error.message;throw error;}
  }
  client.on('disconnected',()=>{loaded=false;busy=false;active=null;requests=[];lastError='Codex 连接已断开，下次操作将重新连接。';});
  client.on('request',msg=>{
    requests.push({id:msg.id,method:msg.method,params:{...msg.params,item:items.get(msg.params?.itemId)}});
    void status('waiting','Codex 等待你的确认').catch(()=>{});
    void bubble('Codex 需要确认或补充信息，请右键 → Codex 控制台处理。').catch(()=>{});
  });
  client.on('notification',msg=>{
    const p=msg.params||{};
    if(msg.method==='account/rateLimits/updated'){rateLimits=p;return;}
    if(p.threadId!==saved.threadId)return;
    if(msg.method==='error'){lastError=p.error?.message||'Codex 返回错误';}
    if(msg.method==='turn/started'){busy=true;started=true;active=p.turn.id;}
    if(msg.method==='item/agentMessage/delta') {
      let last=messages.at(-1);
      if(last?.id!==p.itemId){last={role:'assistant',text:'',id:p.itemId,time:new Date().toISOString()};messages.push(last);}
      last.text+=p.delta;
    }
    if(msg.method==='item/started') {
      if(p.item?.id)items.set(p.item.id,p.item);
      const kind=p.item?.type;
      if(['commandExecution','fileChange','mcpToolCall'].includes(kind))void status('working',`Codex · ${kind}`).catch(()=>{});
    }
    if(msg.method==='item/completed'&&p.item?.type==='agentMessage'){
      const existing=messages.find(x=>x.id===p.item.id);
      if(existing)existing.text=p.item.text;else messages.push({role:'assistant',text:p.item.text,id:p.item.id,time:new Date().toISOString()});
      void bubble(p.item.text).catch(()=>{});
    }
    if(msg.method==='turn/completed') {
      busy=false;started=false;active=null;requests=[];items.clear();
      const state=p.turn.status==='completed'?'success':p.turn.status==='interrupted'?'waiting':'error';
      if(p.turn.status==='completed')lastError=null;
      else if(p.turn.error)lastError=p.turn.error.message;
      void status(state,state==='success'?'Codex 桌宠任务已完成':state==='waiting'?'Codex 任务已停止':'Codex 任务失败').catch(()=>{});
      if(lastError)void bubble(lastError).catch(()=>{});
    }
  });
  async function interrupt() {
    for(let i=0;busy&&!started&&i<100;i++)await new Promise(resolve=>setTimeout(resolve,100));
    if(!busy)return;
    if(!active||!started)throw new Error('Codex 任务尚未开始，请稍后再停止。');
    await client.call('turn/interrupt',{threadId:saved.threadId,turnId:active});
  }
  async function usage() {
    await connect();const result=await client.call('account/rateLimits/read');rateLimits=result;
    const buckets=Object.values(result.rateLimitsByLimitId||{codex:result.rateLimits}).filter(Boolean).map(r=>({limit_id:r.limitId,limit_name:r.limitName,primary:r.primary&&{used_percent:r.primary.usedPercent,window_minutes:r.primary.windowDurationMins,resets_at:r.primary.resetsAt},secondary:r.secondary&&{used_percent:r.secondary.usedPercent,window_minutes:r.secondary.windowDurationMins,resets_at:r.secondary.resetsAt}}));
    const text=formatUsage(buckets,new Date().toISOString());await bubble(text);return text;
  }
  const open = url => execFile('rundll32.exe',['url.dll,FileProtocolHandler',url],{windowsHide:true},()=>{});
  const url=`http://127.0.0.1:${port}/#${token}`;
  function json(res,code,value){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
  const server=http.createServer(async(req,res)=>{
    try {
      if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host))return json(res,403,{error:'Invalid host'});
      const pathname=new URL(req.url,`http://127.0.0.1:${port}`).pathname;
      if(req.method==='GET'&&pathname==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(fs.readFileSync(path.join(root,'console.html')));return;}
      const auth=String(req.headers.authorization||'');const expected=`Bearer ${token}`;
      if(auth.length!==expected.length||!timingSafeEqual(Buffer.from(auth),Buffer.from(expected)))return json(res,401,{error:'需要本机访问令牌，请从桌宠菜单打开。'});
      if(req.headers.origin && req.headers.origin!==`http://${req.headers.host}`)return json(res,403,{error:'Invalid origin'});
      let body={};
      if(req.method==='POST'){
        const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>131072)throw new Error('Request too large');chunks.push(chunk);}
        body=JSON.parse(Buffer.concat(chunks).toString()||'{}');
      }
      if(pathname==='/api/state'&&req.method==='GET'){
        if(saved.threadId&&!loaded)await conversation();
        return json(res,200,{threadId:saved.threadId,cwd:saved.cwd,busy,active,lastError,messages,requests,rateLimits});
      }
      if(pathname==='/api/send'&&req.method==='POST')return json(res,200,{ok:true,text:await submit(body.text)});
      if(pathname==='/api/stop'&&req.method==='POST'){await interrupt();return json(res,200,{ok:true});}
      if(pathname==='/api/usage'&&req.method==='POST')return json(res,200,{ok:true,text:await usage()});
      if(pathname==='/api/reply'&&req.method==='POST'){
        const pending=requests.find(x=>x.id===body.id);if(!pending)throw new Error('确认已失效。');
        if(!body.result||typeof body.result!=='object')throw new Error('无效确认内容。');
        client.reply(pending.id,body.result);requests=requests.filter(x=>x.id!==pending.id);return json(res,200,{ok:true});
      }
      if(pathname==='/api/new'&&req.method==='POST'){
        if(busy)throw new Error('请先停止当前任务。');
        if(!path.isAbsolute(body.cwd)||!fs.statSync(body.cwd).isDirectory())throw new Error('请选择有效的绝对工作目录。');
        saved={threadId:null,cwd:body.cwd};persist();loaded=false;messages=[];requests=[];lastError=null;return json(res,200,{ok:true});
      }
      if(pathname==='/v1/chat/completions'&&req.method==='POST'){
        const last=body.messages?.filter(x=>x.role==='user').at(-1);
        const input=typeof last?.content==='string'?last.content.split('\n\n[配图] 回复结尾可选附一张表情包')[0]:'';
        const text=await submit(input);
        res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});
        res.end(`data: ${JSON.stringify({id:'dsh-codex',object:'chat.completion.chunk',choices:[{index:0,delta:{content:text},finish_reason:null}]})}\n\ndata: ${JSON.stringify({id:'dsh-codex',object:'chat.completion.chunk',choices:[{index:0,delta:{},finish_reason:'stop'}]})}\n\ndata: [DONE]\n\n`);return;
      }
      json(res,404,{error:'Not found'});
    }catch(error){json(res,400,{ok:false,error:error.message,message:error.message});}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  fs.writeFileSync(path.join(runtime,'gateway.json'),JSON.stringify({port,pid:process.pid}));
  return {token,port,url,submit,usage,interrupt,open:()=>open(url),openThread:()=>saved.threadId?open(`codex://threads/${saved.threadId}`):open(url),isBusy:()=>busy,close:()=>{client.close();server.close();fs.rmSync(path.join(runtime,'gateway.json'),{force:true});}};
}
