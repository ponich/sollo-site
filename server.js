const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');
const { build, DIST_DIR } = require('./scripts/build');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || undefined;
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const DATA_DIR = path.join(__dirname, 'data');
const LEADS_FILE = path.join(DATA_DIR, 'leads.json');
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.json', '.svg', '.xml', '.txt']);
const MAX_BODY_BYTES = 16 * 1024;
const LEADS_PER_IP_PER_HOUR = 10;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

const recentLeadsByIp = new Map();
let leadsWriteQueue = Promise.resolve();

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': MIME_TYPES['.json'] });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('too_large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function normalizeUaPhone(raw) {
  const digits = raw.replace(/\D/g, '');
  if (/^380\d{9}$/.test(digits)) return `+${digits}`;
  if (/^0\d{9}$/.test(digits)) return `+38${digits}`;
  return null;
}

function validateLead(input) {
  const lead = {
    name: cleanText(input.name, 80),
    phone: normalizeUaPhone(cleanText(input.phone, 30)),
    city: cleanText(input.city, 80),
    message: cleanText(input.message, 1500),
    context: cleanText(input.context, 1500),
    contactVia: ['phone', 'telegram', 'viber'].includes(input.contactVia) ? input.contactVia : 'phone',
  };
  const errors = {};
  if (lead.name.length < 2) errors.name = 'Вкажіть ім\'я';
  if (!lead.phone) errors.phone = 'Вкажіть номер у форматі 0XX XXX XX XX';
  return { lead, errors };
}

function clientIp(req) {
  if (TRUST_PROXY) {
    const forwarded = req.headers['cf-connecting-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (forwarded) return forwarded;
  }
  return req.socket.remoteAddress || 'unknown';
}

function isRateLimited(ip) {
  const hourAgo = Date.now() - 60 * 60 * 1000;
  const timestamps = (recentLeadsByIp.get(ip) || []).filter((t) => t > hourAgo);
  recentLeadsByIp.set(ip, timestamps);
  if (timestamps.length >= LEADS_PER_IP_PER_HOUR) return true;
  timestamps.push(Date.now());
  return false;
}

async function readJsonFile(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

function appendLead(lead) {
  leadsWriteQueue = leadsWriteQueue.then(async () => {
    const leads = await readJsonFile(LEADS_FILE, []);
    leads.push(lead);
    await fs.writeFile(LEADS_FILE, JSON.stringify(leads, null, 2));
  });
  return leadsWriteQueue;
}

async function notifyTelegram(lead) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  const contactLabels = { phone: 'дзвінок', telegram: 'Telegram', viber: 'Viber' };
  const lines = [
    `Нова заявка #${lead.id}`,
    `Ім'я: ${lead.name}`,
    `Телефон: ${lead.phone}`,
    `Зв'язок: ${contactLabels[lead.contactVia]}`,
    lead.city && `Місто: ${lead.city}`,
    lead.context && `Інтерес:\n${lead.context}`,
    lead.message && `Коментар:\n${lead.message}`,
  ].filter(Boolean);
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: lines.join('\n') }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      console.error(`Telegram notification failed: ${response.status} ${body.description || ''}`);
    }
  } catch (error) {
    console.error('Telegram notification failed:', error.message);
  }
}

async function handleCreateLead(req, res) {
  const ip = clientIp(req);
  let input;
  try {
    input = JSON.parse(await readBody(req));
  } catch {
    sendJson(res, 400, { error: 'Некоректний запит' });
    return;
  }
  if (cleanText(input.website, 200)) {
    sendJson(res, 200, { ok: true });
    return;
  }
  const { lead, errors } = validateLead(input);
  if (Object.keys(errors).length > 0) {
    sendJson(res, 422, { error: 'Перевірте поля форми', fields: errors });
    return;
  }
  if (isRateLimited(ip)) {
    sendJson(res, 429, { error: 'Забагато заявок. Зателефонуйте нам, будь ласка.' });
    return;
  }
  const savedLead = { id: Date.now().toString(36), createdAt: new Date().toISOString(), ...lead };
  await appendLead(savedLead);
  notifyTelegram(savedLead);
  sendJson(res, 201, { ok: true, id: savedLead.id });
}

async function readFileOrNull(file) {
  try {
    return await fs.readFile(file);
  } catch {
    return null;
  }
}

function sendFile(req, res, status, filePath, content, cacheControl) {
  const ext = path.extname(filePath).toLowerCase();
  const headers = {
    'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    'Cache-Control': cacheControl,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    Vary: 'Accept-Encoding',
  };
  let body = content;
  // Video needs byte ranges: iPhone Safari refuses to play an mp4 that can't be fetched in parts
  if (ext === '.mp4' && status === 200) {
    headers['Accept-Ranges'] = 'bytes';
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (range && (range[1] || range[2])) {
      const size = content.length;
      let start = range[1] ? Number(range[1]) : size - Number(range[2]);
      let end = range[1] && range[2] ? Number(range[2]) : size - 1;
      start = Math.max(0, start);
      end = Math.min(end, size - 1);
      if (start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end();
        return;
      }
      body = content.subarray(start, end + 1);
      headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
      headers['Content-Length'] = body.length;
      res.writeHead(206, headers);
      res.end(req.method === 'HEAD' ? undefined : body);
      return;
    }
  }
  if (COMPRESSIBLE.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    body = zlib.gzipSync(content);
    headers['Content-Encoding'] = 'gzip';
  }
  headers['Content-Length'] = body.length;
  res.writeHead(status, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
}

async function serveStatic(req, res, url) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (!path.extname(pathname) && !pathname.endsWith('/')) {
    res.writeHead(301, { Location: `${pathname}/${url.search}` }).end();
    return;
  }
  const filePath = path.resolve(DIST_DIR, `.${pathname}`, pathname.endsWith('/') ? 'index.html' : '');
  if (filePath !== DIST_DIR && !filePath.startsWith(DIST_DIR + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  const content = await readFileOrNull(filePath);
  if (content) {
    const immutable = url.searchParams.has('v') && /\.(css|js)$/.test(filePath);
    sendFile(req, res, 200, filePath, content, immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate');
    return;
  }
  const notFoundFile = path.join(DIST_DIR, '404.html');
  sendFile(req, res, 404, notFoundFile, (await readFileOrNull(notFoundFile)) || Buffer.from('Not found'), 'no-cache');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/api/leads' && req.method === 'POST') {
      await handleCreateLead(req, res);
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }
    await serveStatic(req, res, url);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) sendJson(res, 500, { error: 'Помилка сервера' });
  }
});

build().then((pageCount) => {
  server.listen(PORT, HOST, () => {
    console.log(`Нікітченко і партнери: http://${HOST || 'localhost'}:${PORT} (${pageCount} сторінок)`);
    const telegramReady = Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
    console.log(telegramReady ? 'Telegram: заявки надсилаються в чат' : 'Telegram: вимкнено, заявки лише у data/leads.json');
  });
});
