'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const store = require('./src/store');
const analyzer = require('./src/analyzer');
const { ocrMock } = require('./src/ocr');
const { sttMock } = require('./src/stt');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  let file = pathname === '/' ? '/preview.html' : pathname;
  const fp = path.join(PUBLIC_DIR, file);
  if (!fp.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('forbidden'); }
  if (!fs.existsSync(fp) || !fs.statSync(fp).isFile()) { res.writeHead(404); return res.end('not found'); }
  const ext = path.extname(fp);
  const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' }[ext] || 'text/plain';
  res.writeHead(200, { 'Content-Type': mime + '; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  fs.createReadStream(fp).pipe(res);
}

function nowId(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

async function buildReportFromMedia({ photo, voice, videoCompletion, exerciseAccuracy, question, meta }) {
  const ocr = ocrMock(photo || '');
  const stt = sttMock(voice || '');
  const analysis = await analyzer.analyze({
    pageText: ocr.text,
    transcript: stt.text,
    videoCompletion: +videoCompletion || 0,
    exerciseAccuracy: +exerciseAccuracy || 0,
    meta: Object.assign({ question: question || ocr.title }, meta || {}),
  });
  return { ocr, stt, analysis };
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const { pathname, query } = parsed;
  const method = req.method;

  if (method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*' }); return res.end(); }

  try {
    // 1) 纯分析（无需真实媒体，供 Web 预览/调试）
    if (pathname === '/api/analyze' && method === 'POST') {
      const b = await readBody(req);
      const analysis = await analyzer.analyze({
        pageText: b.pageText || '',
        transcript: b.transcript || '',
        videoCompletion: +b.videoCompletion || 0,
        exerciseAccuracy: +b.exerciseAccuracy || 0,
        meta: { childId: b.childId, sessionId: b.sessionId, question: b.question, mode: b.mode },
      });
      return sendJSON(res, 200, { ok: true, analysis });
    }

    // 2) 完整会话提交（拍照+语音+视频+练习 → 报告+入库）
    if (pathname === '/api/session/submit' && method === 'POST') {
      const b = await readBody(req);
      if (!b.childId) return sendJSON(res, 400, { ok: false, msg: 'childId 必填' });
      const child = store.upsertChild(b.childId, b.childName);
      const { ocr, stt, analysis } = await buildReportFromMedia({
        photo: b.photo, voice: b.voice,
        videoCompletion: b.videoCompletion, exerciseAccuracy: b.exerciseAccuracy,
        question: b.question,
        meta: { childId: b.childId, sessionId: nowId('s'), retries: b.retries, durationSec: b.durationSec, mode: b.mode },
      });
      const sessionId = nowId('s');
      const session = {
        id: sessionId, childId: b.childId, createdAt: new Date().toISOString(),
        question: b.question || ocr.title, videoCompletion: +b.videoCompletion || 0,
        exerciseAccuracy: +b.exerciseAccuracy || 0,
        pageTitle: ocr.title, pageText: ocr.text, transcript: stt.text,
        scores: analysis.scores, overall: analysis.overall, suggestions: analysis.suggestions,
      };
      store.saveSession(session);
      return sendJSON(res, 200, { ok: true, sessionId, report: session });
    }

    // 3) 报告查询
    if (pathname === '/api/report' && method === 'GET') {
      const s = store.getSession(query.sessionId);
      if (!s) return sendJSON(res, 404, { ok: false, msg: '报告不存在' });
      return sendJSON(res, 200, { ok: true, report: s });
    }

    // 4) 儿童信息库
    if (pathname.startsWith('/api/child/') && method === 'GET') {
      const childId = pathname.split('/').pop();
      const profile = store.getChildProfile(childId);
      if (!profile) return sendJSON(res, 404, { ok: false, msg: '儿童不存在' });
      return sendJSON(res, 200, { ok: true, profile });
    }

    // 5) 儿童列表
    if (pathname === '/api/children' && method === 'GET') {
      return sendJSON(res, 200, { ok: true, children: store.listChildren() });
    }

    // 静态资源
    if (method === 'GET') return serveStatic(req, res, pathname);

    res.writeHead(404); res.end('not found');
  } catch (e) {
    sendJSON(res, 500, { ok: false, msg: String(e && e.message || e) });
  }
});

server.listen(PORT, () => {
  console.log(`✅ Mock 后端已启动: http://localhost:${PORT}`);
  console.log(`   报告Web预览: http://localhost:${PORT}/preview.html`);
});
