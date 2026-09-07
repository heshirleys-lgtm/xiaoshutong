'use strict';
/**
 * 儿童信息库持久化层
 * 当前用 JSON 文件实现（零依赖、保证可跑）。
 * 预留 SQLite 切换点：只需替换本文件的 read/write 与 query 实现，
 * 上层 store API 不变即可迁移到 SQLite。
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readDB() {
  ensureDir();
  if (!fs.existsSync(DB_FILE)) return { children: {}, sessions: {} };
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    // 损坏则备份并重开
    const bak = DB_FILE + '.bak.' + Date.now();
    fs.copyFileSync(DB_FILE, bak);
    return { children: {}, sessions: {} };
  }
}

function writeDB(db) {
  ensureDir();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
}

const store = {
  /** 获取或创建儿童档案 */
  upsertChild(childId, childName) {
    const db = readDB();
    if (!db.children[childId]) {
      db.children[childId] = {
        id: childId,
        name: childName || childId,
        createdAt: new Date().toISOString(),
        sessionIds: [],
      };
    } else if (childName && !db.children[childId].name) {
      db.children[childId].name = childName;
    }
    writeDB(db);
    return db.children[childId];
  },

  /** 保存一次学习会话（含6维评分） */
  saveSession(session) {
    const db = readDB();
    db.sessions[session.id] = session;
    const child = db.children[session.childId];
    if (child && !child.sessionIds.includes(session.id)) {
      child.sessionIds.push(session.id);
    }
    writeDB(db);
    return session;
  },

  /** 取单次会话 */
  getSession(sessionId) {
    return readDB().sessions[sessionId] || null;
  },

  /** 取儿童完整档案 + 维度时序 */
  getChildProfile(childId) {
    const db = readDB();
    const child = db.children[childId];
    if (!child) return null;
    const sessions = child.sessionIds
      .map((id) => db.sessions[id])
      .filter(Boolean)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    // 维度时序
    const dimensions = ['information_extraction', 'reasoning', 'association', 'critical', 'expression', 'resilience'];
    const series = {};
    dimensions.forEach((d) => {
      series[d] = sessions.map((s) => ({
        sessionId: s.id,
        at: s.createdAt,
        question: s.question,
        score: s.scores[d] ? s.scores[d].score : null,
      }));
    });
    const latest = sessions[sessions.length - 1] || null;
    return {
      id: child.id,
      name: child.name,
      createdAt: child.createdAt,
      sessionCount: sessions.length,
      latest,
      series,
      sessions: sessions.map((s) => ({
        id: s.id,
        at: s.createdAt,
        question: s.question,
        overall: s.overall,
        videoCompletion: s.videoCompletion,
        exerciseAccuracy: s.exerciseAccuracy,
      })),
    };
  },

  /** 列出所有儿童（用于调试/预览） */
  listChildren() {
    const db = readDB();
    return Object.values(db.children).map((c) => ({ id: c.id, name: c.name, sessionCount: c.sessionIds.length }));
  },
};

module.exports = store;
