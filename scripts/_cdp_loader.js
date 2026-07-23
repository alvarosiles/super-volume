#!/usr/bin/env node
/**
 * _cdp_loader.js — helper interno de 2-test-extension.sh
 *
 * Puerto a Node.js de _cdp_loader.py (misma lógica y mismos pasos: activar
 * Developer mode en chrome://extensions vía CDP y cargar la extensión con
 * Extensions.loadUnpacked). Se usa cuando el sistema no tiene un intérprete
 * de Python 3 real disponible (solo Node), como en Windows si "python3" es
 * apenas el alias-stub de Microsoft Store.
 *
 * Sin dependencias externas: implementa a mano el handshake y framing de
 * WebSocket (RFC 6455) sobre un socket TCP crudo (net.createConnection),
 * igual que hacía la versión en Python.
 */
'use strict';

const net = require('net');
const crypto = require('crypto');

class CDP {
  constructor(wsUrl) {
    if (!wsUrl.startsWith('ws://')) throw new Error(wsUrl);
    const rest = wsUrl.slice('ws://'.length);
    const slashIdx = rest.indexOf('/');
    const hostPort = slashIdx === -1 ? rest : rest.slice(0, slashIdx);
    this.path = slashIdx === -1 ? '/' : rest.slice(slashIdx);
    const [host, portStr] = hostPort.split(':');
    this.host = host;
    this.port = Number(portStr || 80);

    this.sock = null;
    this._id = 0;
    this._buf = Buffer.alloc(0);
    this._waiters = [];
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.sock = net.createConnection({ host: this.host, port: this.port }, () => {
        const key = crypto.randomBytes(16).toString('base64');
        const req =
          `GET ${this.path} HTTP/1.1\r\n` +
          `Host: ${this.host}:${this.port}\r\n` +
          `Upgrade: websocket\r\nConnection: Upgrade\r\n` +
          `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`;
        this.sock.write(req);
      });

      let handshakeDone = false;
      let handshakeBuf = Buffer.alloc(0);

      this.sock.on('data', (chunk) => {
        if (!handshakeDone) {
          handshakeBuf = Buffer.concat([handshakeBuf, chunk]);
          const idx = handshakeBuf.indexOf('\r\n\r\n');
          if (idx === -1) return;
          const header = handshakeBuf.slice(0, idx).toString();
          if (!header.split('\r\n')[0].includes('101')) {
            reject(new Error(`Handshake WebSocket fallido: ${header.slice(0, 200)}`));
            return;
          }
          handshakeDone = true;
          this._buf = handshakeBuf.slice(idx + 4);
          this._processBuffer();
          resolve();
          return;
        }
        this._buf = Buffer.concat([this._buf, chunk]);
        this._processBuffer();
      });

      this.sock.on('error', reject);
    });
  }

  _processBuffer() {
    for (;;) {
      if (this._buf.length < 2) return;
      const b1 = this._buf[1];
      const masked = (b1 & 0x80) !== 0;
      let length = b1 & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (this._buf.length < offset + 2) return;
        length = this._buf.readUInt16BE(offset);
        offset += 2;
      } else if (length === 127) {
        if (this._buf.length < offset + 8) return;
        length = Number(this._buf.readBigUInt64BE(offset));
        offset += 8;
      }
      let maskKey = null;
      if (masked) {
        if (this._buf.length < offset + 4) return;
        maskKey = this._buf.slice(offset, offset + 4);
        offset += 4;
      }
      if (this._buf.length < offset + length) return;
      let payload = this._buf.slice(offset, offset + length);
      if (masked) {
        const unmasked = Buffer.alloc(payload.length);
        for (let i = 0; i < payload.length; i++) unmasked[i] = payload[i] ^ maskKey[i % 4];
        payload = unmasked;
      }
      this._buf = this._buf.slice(offset + length);

      let msg;
      try {
        msg = JSON.parse(payload.toString('utf8'));
      } catch (_err) {
        continue; // frame no-JSON (no debería pasar en CDP), lo ignoramos
      }
      this._dispatch(msg);
    }
  }

  _dispatch(msg) {
    const idx = this._waiters.findIndex((w) => w.id === msg.id);
    if (idx === -1) return; // evento sin solicitud asociada: lo ignoramos
    const [w] = this._waiters.splice(idx, 1);
    if (msg.error) w.reject(new Error(JSON.stringify(msg.error)));
    else w.resolve(msg.result || {});
  }

  _sendFrame(text) {
    const payload = Buffer.from(text, 'utf8');
    const length = payload.length;
    const mask = crypto.randomBytes(4);
    const masked = Buffer.alloc(length);
    for (let i = 0; i < length; i++) masked[i] = payload[i] ^ mask[i % 4];

    let header;
    if (length <= 125) {
      header = Buffer.from([0x81, 0x80 | length]);
    } else if (length <= 65535) {
      header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 0x80 | 126;
      header.writeUInt16BE(length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x81;
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(length), 2);
    }
    this.sock.write(Buffer.concat([header, mask, masked]));
  }

  call(method, params, timeoutMs = 15000) {
    this._id += 1;
    const id = this._id;
    this._sendFrame(JSON.stringify({ id, method, params: params || {} }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this._waiters.findIndex((w) => w.id === id);
        if (idx !== -1) this._waiters.splice(idx, 1);
        reject(new Error(`Sin respuesta a ${method}`));
      }, timeoutMs);
      this._waiters.push({
        id,
        resolve: (r) => { clearTimeout(timer); resolve(r); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
    });
  }

  close() {
    if (this.sock) this.sock.destroy();
  }
}

const DEEP_QUERY_JS = `
function deepQuery(root, selector) {
  const direct = root.querySelector(selector);
  if (direct) return direct;
  for (const el of root.querySelectorAll('*')) {
    if (el.shadowRoot) {
      const found = deepQuery(el.shadowRoot, selector);
      if (found) return found;
    }
  }
  return null;
}
function deepQueryAll(root, selector) {
  let results = Array.from(root.querySelectorAll(selector));
  for (const el of root.querySelectorAll('*')) {
    if (el.shadowRoot) results = results.concat(deepQueryAll(el.shadowRoot, selector));
  }
  return results;
}
`;

async function httpJson(url) {
  const res = await fetch(url);
  return res.json();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDevtools(port, attempts = 40, delay = 500) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await httpJson(`http://127.0.0.1:${port}/json/version`);
    } catch (_err) {
      await sleep(delay);
    }
  }
  throw new Error('El puerto de depuración de Chrome nunca respondió');
}

async function getFirstPage(port) {
  const tabs = await httpJson(`http://127.0.0.1:${port}/json/list`);
  const page = tabs.find((t) => t.type === 'page');
  if (!page) throw new Error('No se encontró ninguna pestaña abierta');
  return page;
}

/** Activa 'Developer mode' en chrome://extensions si está apagado. */
async function ensureDeveloperMode(c) {
  await c.call('Page.navigate', { url: 'chrome://extensions/' });
  await sleep(1200);

  const checkJs = `${DEEP_QUERY_JS}
  (function() {
    const t = deepQuery(document, '#devMode');
    if (!t) return JSON.stringify({found: false});
    const r = t.getBoundingClientRect();
    return JSON.stringify({found: true, checked: t.checked, x: r.x + r.width / 2, y: r.y + r.height / 2});
  })()
  `;
  const evalRes = await c.call('Runtime.evaluate', { expression: checkJs, returnByValue: true });
  const result = JSON.parse(evalRes.result.value);
  if (!result.found) {
    throw new Error("No se encontró el interruptor 'Developer mode' (¿cambió chrome://extensions?)");
  }

  if (result.checked) {
    console.log('Developer mode ya estaba activado.');
    return;
  }

  const { x: cx, y: cy } = result;
  await c.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx, y: cy });
  await c.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', clickCount: 1 });
  await c.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx, y: cy, button: 'left', clickCount: 1 });
  await sleep(1000);
  console.log('Developer mode activado.');
}

async function main() {
  const port = Number(process.argv[2]);
  const rootDir = process.argv[3];
  const targetUrl = process.argv[4];

  await waitForDevtools(port);
  await sleep(1000);
  const page = await getFirstPage(port);

  const c = new CDP(page.webSocketDebuggerUrl);
  await c.connect();
  await c.call('Page.enable');
  await c.call('Runtime.enable');

  await ensureDeveloperMode(c);

  const ver = await httpJson(`http://127.0.0.1:${port}/json/version`);
  const browserC = new CDP(ver.webSocketDebuggerUrl);
  await browserC.connect();

  let extId;
  try {
    const result = await browserC.call('Extensions.loadUnpacked', { path: rootDir });
    extId = result.id;
  } catch (err) {
    console.error(`ERROR: Extensions.loadUnpacked no funcionó (${err.message}).`);
    console.error('Tu versión de Chrome puede no soportar este método CDP.');
    console.error("Carga la extensión a mano: chrome://extensions -> 'Cargar descomprimida'.");
    process.exit(1);
  }
  browserC.close();
  console.log(`Super Volume cargada. ID: ${extId}`);

  // Confirmar que no hay errores de manifest antes de seguir.
  await c.call('Page.navigate', { url: 'chrome://extensions/' });
  await sleep(1000);
  const checkJs2 = `${DEEP_QUERY_JS}
  (function() {
    const items = deepQueryAll(document, 'extensions-item');
    const sv = items.find(i => i.data && i.data.id === '${extId}');
    if (!sv) return JSON.stringify({found: false});
    return JSON.stringify({
      found: true,
      manifestErrors: (sv.data.manifestErrors || []).length,
      runtimeErrors: (sv.data.runtimeErrors || []).length
    });
  })()
  `;
  const evalRes2 = await c.call('Runtime.evaluate', { expression: checkJs2, returnByValue: true });
  const info = JSON.parse(evalRes2.result.value);
  if (info.found && info.manifestErrors > 0) {
    console.error(`AVISO: la extensión tiene ${info.manifestErrors} error(es) de manifest. Revisa chrome://extensions.`);
  }

  await c.call('Page.navigate', { url: targetUrl });
  c.close();
  console.log(`Abriendo: ${targetUrl}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
