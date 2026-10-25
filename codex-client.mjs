import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import readline from 'node:readline';

export class CodexClient extends EventEmitter {
  constructor() { super(); this.sequence = 0; this.pending = new Map(); this.child = null; }
  async connect() {
    if (this.connecting) return this.connecting;
    this.connecting = this.initialize().catch(error => { this.connecting = null; throw error; });
    return this.connecting;
  }
  async initialize() {
    this.child = spawn(process.env.CODEX_PET_CODEX || 'codex.exe', ['app-server', '--stdio'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.stderr.on('data', () => {});
    readline.createInterface({ input: this.child.stdout }).on('line', line => {
      let msg; try { msg = JSON.parse(line); } catch { return; }
      if (msg.id !== undefined && !msg.method) {
        const pending = this.pending.get(msg.id);
        if (pending) { clearTimeout(pending.timer); this.pending.delete(msg.id); msg.error ? pending.reject(new Error(msg.error.message)) : pending.resolve(msg.result); }
      } else this.emit(msg.id !== undefined ? 'request' : 'notification', msg);
    });
    const closed = () => {
      for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('Codex connection closed')); }
      this.pending.clear(); this.child = null; this.connecting = null; this.emit('disconnected');
    };
    this.child.once('error', closed); this.child.once('exit', closed);
    await this.call('initialize', { clientInfo: { name: 'dsh_pet_codex', title: 'DSH Pet for Codex', version: '2.0.0' }, capabilities: { experimentalApi: true } });
    this.write({ method: 'initialized' });
  }
  write(message) {
    if (!this.child?.stdin.writable) throw new Error('Codex is disconnected');
    this.child.stdin.write(JSON.stringify(message) + '\n');
  }
  call(method, params = {}) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Codex ${method} timed out`)); }, 45000);
      this.pending.set(id, { resolve, reject, timer });
      try { this.write({ id, method, params }); } catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
  reply(id, result) { this.write({ id, result }); }
  close() { this.child?.kill(); }
}
