// Cliente mínimo del Chrome DevTools Protocol con el WebSocket nativo de Node 24.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CANDIDATOS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
];

export function buscarNavegador() {
  return CANDIDATOS.find((r) => r && existsSync(r)) || null;
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

export async function lanzar(ruta) {
  const perfil = mkdtempSync(join(tmpdir(), 'meso-cdp-'));
  const proc = spawn(ruta, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${perfil}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--disable-gpu', '--hide-scrollbars', '--mute-audio', '--allow-file-access-from-files', 'about:blank'
  ], { stdio: 'ignore' });
  let puerto = null;
  for (let i = 0; i < 200 && !puerto; i++) {
    try { puerto = readFileSync(join(perfil, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim(); } catch { await esperar(50); }
  }
  if (!puerto) { proc.kill(); throw new Error('El navegador no abrió el puerto de depuración'); }
  const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${puerto}/json/version`)).json();
  const ws = new WebSocket(webSocketDebuggerUrl);
  await new Promise((ok, mal) => { ws.onopen = ok; ws.onerror = mal; });

  let siguiente = 0;
  const pendientes = new Map();
  const oyentes = new Set();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id !== undefined && pendientes.has(m.id)) {
      const { ok, mal } = pendientes.get(m.id);
      pendientes.delete(m.id);
      m.error ? mal(new Error(m.error.message)) : ok(m.result);
    } else if (m.method) {
      for (const f of oyentes) f(m);
    }
  };
  const enviar = (method, params = {}, sessionId) => new Promise((ok, mal) => {
    const id = ++siguiente;
    pendientes.set(id, { ok, mal });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

  async function nuevaPagina() {
    const { targetId } = await enviar('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await enviar('Target.attachToTarget', { targetId, flatten: true });
    const s = (method, params) => enviar(method, params, sessionId);
    const eventos = [];
    const esperando = [];
    oyentes.add((m) => {
      if (m.sessionId !== sessionId) return;
      eventos.push(m);
      for (const w of esperando.slice()) if (w.metodo === m.method) { esperando.splice(esperando.indexOf(w), 1); w.ok(m.params); }
    });
    await s('Page.enable');
    await s('Runtime.enable');
    await s('Log.enable');
    return {
      s,
      eventos,
      evento: (metodo, ms = 15000) => new Promise((ok, mal) => {
        const w = { metodo, ok };
        esperando.push(w);
        setTimeout(() => { const i = esperando.indexOf(w); if (i >= 0) { esperando.splice(i, 1); mal(new Error('Tiempo agotado esperando ' + metodo)); } }, ms);
      }),
      async evaluar(expr) {
        const r = await s('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error('Error al evaluar: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
        return r.result.value;
      },
      async cerrar() { await enviar('Target.closeTarget', { targetId }); }
    };
  }

  async function cerrar() {
    try { await enviar('Browser.close'); } catch { /* ya cerrado */ }
    ws.close();
    await esperar(300);
    try { proc.kill(); } catch { /* nada */ }
    try { rmSync(perfil, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* bloqueado en Windows */ }
  }

  return { nuevaPagina, cerrar };
}
