import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = path.dirname(fileURLToPath(import.meta.url));
const runtime = path.join(root, '.runtime');
const stateFile = process.env.CODEX_PET_STATE_FILE || path.join(os.homedir(), '.codex', '.codex-global-state.json');
const log = text => console.log(`${new Date().toISOString()} ${text}`);

export function wantsPet(state, appRunning) {
  return appRunning && state['electron-avatar-overlay-open'] === true;
}

async function launch() {
  // Log to a file: detached pet processes must not keep the launcher's pipe open.
  const output = fs.openSync(path.join(runtime, 'auto-launch.log'), 'a');
  let child;
  try {
    child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'start.ps1')], {
      windowsHide: true, stdio: ['ignore', output, output],
    });
  } finally { fs.closeSync(output); }
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Launcher timed out')); }, 45000);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => { clearTimeout(timeout); code === 0 ? resolve() : reject(new Error(`Launcher exited ${code}; see auto-launch.log`)); });
  });
}

async function main() {
  fs.mkdirSync(runtime, { recursive: true });
  fs.rmSync(path.join(runtime, 'auto-stop'), { force: true });
  fs.writeFileSync(path.join(runtime, 'auto.pid'), String(process.pid));
  let previous = false, running = false, checkAt = 0, retryAt = 0, lastError = '';
  let stopping = false;
  process.on('SIGTERM', () => { stopping = true; });
  process.on('SIGINT', () => { stopping = true; });
  log('Watching Codex Show pet switch');
  while (!stopping && !fs.existsSync(path.join(runtime, 'auto-stop'))) {
    try {
      if (Date.now() >= checkAt) {
        const result = await run('tasklist.exe', ['/FI', 'IMAGENAME eq ChatGPT.exe', '/FO', 'CSV', '/NH'], { windowsHide: true });
        running = result.stdout.toLowerCase().includes('chatgpt.exe');
        checkAt = Date.now() + 5000;
      }
      const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      const wanted = wantsPet(state, running);
      if (wanted && (!previous || (retryAt && Date.now() >= retryAt))) {
        try {
          await launch();
          log('Show pet → dsh-pet and bridge ready');
          retryAt = 0;
        } catch (error) {
          log(`Startup failed: ${error.message}`);
          retryAt = Date.now() + 10000;
        }
      }
      previous = wanted;
      lastError = '';
    } catch (error) {
      if (error.code !== 'ENOENT' && error.message !== lastError) log(`State read failed: ${error.message}`);
      lastError = error.message;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  fs.rmSync(path.join(runtime, 'auto.pid'), { force: true });
  fs.rmSync(path.join(runtime, 'auto-stop'), { force: true });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { log(error.message); process.exitCode = 1; });
