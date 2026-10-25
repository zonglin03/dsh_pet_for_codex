import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { startGateway } from './gateway.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const runtime = path.join(root, '.runtime');
fs.mkdirSync(runtime, { recursive: true });
const sessionsRoot = process.env.CODEX_PET_SESSIONS || path.join(os.homedir(), '.codex', 'sessions');
const petRuntime = process.env.CODEX_PET_RUNTIME || path.join(os.homedir(), '.dsh', 'dsh-pet', 'standalone-runtime.json');
const petId = process.env.CODEX_PET_ID || 'main';
const usageOwner = 'Codex 用量';
const usageLabel = '查看剩余用量';
const clip = (s, n) => Array.from(String(s).replace(/\s+/g, ' ').trim()).slice(0, n).join('');
const log = (message) => console.log(`${new Date().toISOString()} ${message}`);

export function mapEvent(e) {
  const p = e.payload || {};
  if (e.type === 'event_msg') {
    if (p.type === 'task_started') return { state: 'thinking', task: 'Codex 正在思考' };
    if (p.type === 'task_complete') return { state: 'success', task: 'Codex 已完成', text: p.last_agent_message, done: true };
    if (['turn_aborted', 'task_aborted'].includes(p.type)) return { state: 'waiting', task: 'Codex 已暂停', done: true };
    if (p.type === 'error') return { state: 'error', task: 'Codex 执行出错', done: true };
  }
  if (e.type !== 'response_item') return null;
  if (['function_call', 'custom_tool_call'].includes(p.type)) {
    const name = String(p.name || '工具').split('.').pop();
    return { state: 'working', task: `Codex · ${name}` };
  }
  if (['function_call_output', 'custom_tool_call_output'].includes(p.type)) return { state: 'thinking', task: 'Codex 正在处理工具结果' };
  if (p.type === 'message' && p.role === 'assistant' && ['commentary', 'final'].includes(p.phase)) {
    const text = (p.content || []).filter(x => ['output_text', 'text'].includes(x.type)).map(x => x.text || '').join('\n');
    if (!text) return null;
    return p.phase === 'final'
      ? { state: 'success', task: 'Codex 已完成', text, done: true }
      : { state: 'working', task: clip(text, 40), text };
  }
  return null;
}

export function formatUsage(rates, timestamp) {
  if (!rates || !rates.length) return 'Codex 剩余用量暂不可用，请先在 Codex 中完成一次对话。';
  const lines = ['Codex 剩余用量'];
  const date = seconds => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(seconds * 1000));
  for (const rate of rates) {
    for (const window of [rate.primary, rate.secondary]) {
      if (!window || !Number.isFinite(window.used_percent)) continue;
      const minutes = window.window_minutes;
      const label = minutes === 10080 ? '周额度' : minutes === 300 ? '5 小时额度' : `${minutes ?? '?'} 分钟额度`;
      const remaining = Math.max(0, Math.min(100, 100 - window.used_percent));
      const prefix = rate.limit_id && rate.limit_id !== 'codex' ? `${rate.limit_name || rate.limit_id} · ` : '';
      lines.push(`${prefix}${label}：剩余 ${Math.round(remaining * 10) / 10}%`);
      if (Number.isFinite(window.resets_at)) lines.push(`重置：${date(window.resets_at)}（北京时间）`);
    }
  }
  if (lines.length === 1) lines.push('当前未提供额度百分比');
  if (timestamp) lines.push(`数据更新：${date(Date.parse(timestamp) / 1000)}`);
  return lines.join('\n');
}

function latestRates(file) {
  const size = fs.statSync(file).size;
  const offset = Math.max(0, size - 512 * 1024);
  const fd = fs.openSync(file, 'r');
  const data = Buffer.alloc(size - offset);
  try { fs.readSync(fd, data, 0, data.length, offset); } finally { fs.closeSync(fd); }
  const lines = data.toString('utf8').split('\n');
  for (let i = lines.length - 1; i >= (offset ? 1 : 0); i--) {
    try {
      const e = JSON.parse(lines[i]);
      if (e.type === 'event_msg' && e.payload?.type === 'token_count' && e.payload.rate_limits) return e;
    } catch {}
  }
  return null;
}

async function installUsageMenu() {
  const rt = JSON.parse(fs.readFileSync(petRuntime, 'utf8'));
  const file = path.join(rt.pluginRoot, 'runtime', 'electron-helper', 'sprite.js');
  let source = fs.readFileSync(file, 'utf8');
  const oldLabel = "tools.push({ label: '查看余额', action: 'show-balance' });";
  const newLabel = "tools.push({ label: '查看剩余用量', action: 'show-balance' });";
  const oldCall = 'S.postAction(BALANCE_URL)';
  const newCall = "S.postAction(BASE + '/menu/click', { owner: 'Codex 用量', label: '查看剩余用量', pet: this.pet.id })";
  if (source.includes(newLabel) && source.includes(newCall)) { log('Usage menu already installed'); return; }
  if (!source.includes(oldLabel) || !source.includes(oldCall)) throw new Error('Unknown dsh-pet menu version; no changes made');
  const backup = path.join(root, 'backups', 'sprite.js.original');
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  if (!fs.existsSync(backup)) fs.copyFileSync(file, backup);
  source = source.replace(oldLabel, newLabel).replace(oldCall, newCall);
  fs.writeFileSync(file, source);
  await request('/reload', 'POST', {});
  log('Installed remaining-usage menu; original sprite.js saved in backups');
}

export async function request(route, method = 'GET', body) {
  const rt = JSON.parse(fs.readFileSync(petRuntime, 'utf8'));
  const response = await fetch(`http://127.0.0.1:${rt.port}/dsh-pet-7340${route}`, {
    method, headers: { 'Content-Type': 'application/json', 'X-DSH-Pet-Token': rt.token },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(4000),
  });
  const value = response.status === 204 ? null : await response.json();
  if (!response.ok || value?.ok === false) throw new Error(`dsh-pet ${response.status}: ${value?.reason || value?.error || 'request rejected'}`);
  return value;
}

async function show(update) {
  await request('/work-status', 'POST', { state: update.state, task: clip(update.task, 40) });
  if (update.text) await request(`/broadcast?pet=${encodeURIComponent(petId)}&surface=desktop`, 'POST', {
    text: clip(update.text, 240), duration: update.done ? 20000 : 10000, anim: false,
  });
}

function discover(dir, result = []) {
  if (!fs.existsSync(dir)) return result;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const name = path.join(dir, item.name);
    if (item.isDirectory()) discover(name, result);
    else if (item.name.endsWith('.jsonl')) result.push({ file: name, stat: fs.statSync(name) });
  }
  return result;
}

async function main() {
  if (process.argv.includes('--install-ui')) { await installUsageMenu(); return; }
  if (process.argv.includes('--usage')) {
    const events = discover(sessionsRoot).map(x => latestRates(x.file)).filter(Boolean).sort((a,b) => Date.parse(b.timestamp)-Date.parse(a.timestamp));
    const latest = events[0];
    const text = formatUsage(latest ? [latest.payload.rate_limits] : [], latest?.timestamp);
    await request(`/broadcast?pet=${encodeURIComponent(petId)}&surface=desktop`, 'POST', { text, duration: 25000, anim: false });
    log(text);
    return;
  }
  if (process.argv.includes('--smoke')) {
    await show({ state: 'working', task: 'Codex 桥接测试', text: 'Codex → dsh-pet：工作状态与消息气泡已连通。' });
    const state = await request('/state');
    if (state.sections.workStatus.data.state !== 'working' || !state.pets[petId]?.say?.data) throw new Error('Readback failed');
    log('PASS: authenticated work-status + broadcast + state readback');
    return;
  }
  const files = new Map();
  const gateway = await startGateway(request, formatUsage);
  const threads = new Map();
  const rates = new Map();
  let ratesAt = null, menuRegistered = false;
  function rememberRates(event) {
    if (event.type !== 'event_msg' || event.payload?.type !== 'token_count' || !event.payload.rate_limits) return;
    const rate = event.payload.rate_limits;
    const key = rate.limit_id || 'codex';
    if (!rates.has(key) || Date.parse(event.timestamp) >= Date.parse(rates.get(key).timestamp)) rates.set(key, { rate, timestamp: event.timestamp });
    if (!ratesAt || Date.parse(event.timestamp) > Date.parse(ratesAt)) ratesAt = event.timestamp;
  }
  let scanAt = 0, lastDisplay = '', lastError = '', clearAt = 0, activeFile = null;
  fs.writeFileSync(path.join(runtime, 'bridge.pid'), String(process.pid));
  fs.rmSync(path.join(runtime, 'stop'), { force: true });
  await show({ state: 'success', task: 'Codex 桥接已连接', text: '已连接 Codex，等待新的任务或进度消息。', done: true });
  clearAt = Date.now() + 12000;
  log('Connected; watching new local Codex session events');
  let stopping = false;
  const stop = () => { stopping = true; };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  while (!stopping && !fs.existsSync(path.join(runtime, 'stop'))) {
    try {
      if (!menuRegistered) {
        await request('/menu/item', 'POST', { owner: usageOwner, labels: [usageLabel,'Codex 控制台','停止 Codex 任务','打开 Codex 会话'] });
        menuRegistered = true;
      }
      if (Date.now() >= scanAt) {
        const candidates = discover(sessionsRoot).sort((a,b) => b.stat.mtimeMs - a.stat.mtimeMs).slice(0, 20);
        for (const { file, stat } of candidates) {
          if (!files.has(file)) {
            files.set(file, { offset: scanAt ? 0 : stat.size, pending: Buffer.alloc(0) });
            const usage = latestRates(file); if (usage) rememberRates(usage);
          }
        }
        scanAt = Date.now() + 4000;
      }
      let pending = null;
      for (const [file, cursor] of files) {
        if (!fs.existsSync(file)) { files.delete(file); threads.delete(file); continue; }
        const size = fs.statSync(file).size;
        if (size < cursor.offset) { cursor.offset = 0; cursor.pending = Buffer.alloc(0); }
        if (size === cursor.offset) continue;
        const fd = fs.openSync(file, 'r');
        const bytes = Buffer.alloc(Math.min(size - cursor.offset, 1024 * 1024));
        let count;
        try { count = fs.readSync(fd, bytes, 0, bytes.length, cursor.offset); } finally { fs.closeSync(fd); }
        cursor.offset += count;
        const data = Buffer.concat([cursor.pending, bytes.subarray(0, count)]);
        let from = 0, end;
        while ((end = data.indexOf(10, from)) !== -1) {
          const line = data.subarray(from, end).toString('utf8'); from = end + 1;
          let event;
          try { event = JSON.parse(line); } catch { continue; }
          rememberRates(event);
          // Ignore stale records flushed by an old session and never replay history.
          const time = Date.parse(event.timestamp);
          if (!Number.isFinite(time) || Date.now() - time > 120000) continue;
          const update = mapEvent(event);
          if (update) {
            // Preserve a progress message when subsequent tools arrive in this batch.
            if (!update.text && pending?.text && activeFile === file && !pending.done && !update.done) update.text = pending.text;
            threads.set(file, { ...update, time, seen: Date.now() });
            if (!pending || time >= pending.time) { pending = { ...update, time }; activeFile = file; }
          }
        }
        cursor.pending = data.subarray(from);
      }
      // A final from one chat must not hide another chat that is still working.
      if (pending?.done) {
        const others = [...threads.entries()].filter(([file, u]) => file !== activeFile && !u.done && Date.now() - u.seen < 120000).sort((a,b) => b[1].time-a[1].time);
        if (others.length) { activeFile = others[0][0]; pending = others[0][1]; }
      }
      if (pending && !gateway.isBusy()) {
        const key = JSON.stringify([pending.state, pending.task, pending.text]);
        if (key !== lastDisplay) {
          await show(pending); lastDisplay = key;
          log(`Displayed ${pending.state}`);
        }
        clearAt = Date.now() + (pending.done ? 25000 : 180000);
      }
      if (clearAt && Date.now() > clearAt && !gateway.isBusy()) {
        await request('/work-status', 'DELETE'); clearAt = 0; lastDisplay = '';
        log('Returned to idle');
      }
      const result = await request(`/menu/events?owner=${encodeURIComponent(usageOwner)}`);
      const clicks = result.events || {};
      if (clicks[usageLabel]) {
        try { await gateway.usage(); }
        catch {
          await request(`/broadcast?pet=${encodeURIComponent(clicks[usageLabel])}&surface=desktop`, 'POST', {text:'实时用量获取失败。以下为本地记录：\n'+formatUsage([...rates.values()].map(x=>x.rate),ratesAt),duration:25000,anim:false});
        }
        log('Displayed remaining usage');
      }
      if(clicks['Codex 控制台'])gateway.open();
      if(clicks['打开 Codex 会话'])gateway.openThread();
      if(clicks['停止 Codex 任务']) {
        try {await gateway.interrupt();}
        catch(error){await request('/broadcast?pet=main&surface=desktop','POST',{text:error.message,duration:10000,anim:false});}
      }
      lastError = '';
    } catch (error) {
      if (error.message !== lastError) log(`Connection/read error: ${error.message}`);
      lastError = error.message;
      menuRegistered = false;
    }
    await new Promise(resolve => setTimeout(resolve, 700));
  }
  await request('/work-status', 'DELETE').catch(() => {});
  gateway.close();
  await request(`/menu/item?owner=${encodeURIComponent(usageOwner)}`, 'DELETE').catch(() => {});
  fs.rmSync(path.join(runtime, 'bridge.pid'), { force: true });
  fs.rmSync(path.join(runtime, 'stop'), { force: true });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { log(error.message); process.exitCode = 1; });
}
