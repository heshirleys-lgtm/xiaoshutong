'use strict';
/**
 * 6 维学习能力分析引擎
 * 维度：信息提取 / 推理判断 / 联想迁移 / 批判质疑 / 表达组织 / 坚持韧性
 *
 * 核心思路（v2，实体级关联分析）：
 *  不再做机械的信号词计数，而是先从「书本页文本」抽取关键概念，
 *  再逐条与「孩子回答」比对，得到：命中 / 遗漏 / 回答新增（推断·联想·其他），
 *  每个维度的分数与洞察文案都直接引用这些真实概念，做到可解释、可复现。
 *
 * 设计：
 *  - analyze() 为统一入口，mode 可切 'mock'（默认，零依赖可复现）或 'llm'（预留真实大模型接口）
 *  - mock 模式完全由输入决定，不含随机数，同样输入必得同样结果
 *  - llm 模式预留 OpenAI 兼容调用骨架，未配置 key 时自动回退 mock，保证不崩
 */

// ---------- 工具 ----------
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function levelOf(score) {
  if (score >= 85) return '优秀';
  if (score >= 55) return '良好';
  return '待提升';
}

// ---------- 中文虚词 / 停用词 / 谓语 ----------
// 虚词作为切分边界：遇到即断开，避免跨词边界产生碎片
const FUNC = '的了着是在和我你您他她它们这那哪就都也再又还已把被给对与及或但而因所让使向从到过上下里中内外前后时得嘛呀呢吧啊'.split('');
// 谓语词：把过长的块切成「主语 / 宾语」两个要点
const PRED = ['包括', '包含', '分为', '组成', '变成', '形成', '位于', '属于', '表示', '说明', '讲述', '描写', '出现', '存在', '需要', '可以', '能够', '长着', '披着', '告诉', '有', '是', '叫', '讲', '说', '提到', '描述', '介绍'];
const STOP = new Set(['我们', '他们', '它们', '自己', '这个', '那个', '这些', '那些', '这样', '那样', '就是', '觉得', '好像', '然后', '一个', '没有', '不是', '还是', '怎么', '时候', '东西', '进行', '通过', '以及', '对于', '这种', '一种', '一些', '已经', '可能', '因为', '所以', '但是', '于是', '而且', '虽然', '不过', '接着', '还有', '的话', '什么', '可以', '应该', '需要', '非常', '特别', '一定', '知道', '看见', '发现', '最后', '开始', '一起', '出来', '过去', '现在', '这样子', '有点', '比较', '真的', '分别', '出现', '存在', '为什么', '这一页', '那一页', '一页', '这页', '那页', '这篇', '这篇课文', '什么样', '怎么样']);
// 纯功能词构成的碎片（以才会 / 也就 等）
const FUNC_ONLY = /^[以才就会也还再将又都就很太更最其之于由被把让使给对向从到过上下里中内外前后时地得着了而是和与你我他她它们这那哪]+$/;

// ---------- 文本切分 ----------
const PUNC_RE = /[，。！？、；：\s,.;:!?…—\-""''（）()《》【】]/;

function splitSegs(t) {
  return (t || '').split(PUNC_RE).filter(Boolean);
}

function splitSentences(t) {
  return (t || '').split(/[。！？!?\n;；]+/).map((s) => s.trim()).filter(Boolean);
}

// ---------- 实词块切分：标点 → 虚词 → 谓语递归 ----------
function splitBlocks(text) {
  const out = [];
  splitSegs(text).forEach((seg) => {
    let cur = '';
    for (const ch of seg) {
      if (FUNC.indexOf(ch) >= 0) {
        if (cur.length >= 2) out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    if (cur.length >= 2) out.push(cur);
  });
  return out;
}

function splitByPred(block) {
  let best = -1;
  let bestLen = 0;
  for (const p of PRED) {
    const i = block.indexOf(p);
    if (i < 0) continue;
    const right = block.slice(i + p.length);
    if (right.length < 2) continue;              // 右半过短则不切
    if (best < 0 || i < best) { best = i; bestLen = p.length; }
  }
  if (best >= 0) {
    const parts = [];
    if (best > 0) parts.push(block.slice(0, best));
    parts.push(block.slice(best + bestLen));
    return parts;
  }
  return [block];
}

function refineBlocks(blocks) {
  let parts = blocks.slice();
  let guard = 0;
  while (guard++ < 5) {
    let changed = false;
    const next = [];
    parts.forEach((p) => {
      if (p.length > 4) {
        const sp = splitByPred(p);
        // 切成两块，或只剩右半（谓语在开头）都算发生变化
        if (sp.length > 1 || (sp.length === 1 && sp[0] !== p)) {
          changed = true;
          next.push(...sp);
        } else {
          next.push(p);
        }
      } else {
        next.push(p);
      }
    });
    parts = next;
    if (!changed) break;
  }
  // 兜底：仍过长的块截取前 4 字作为核心要点
  return parts
    .filter((p) => p.length >= 2)
    .map((p) => {
      if (p.length <= 6) return p;
      let s = p.slice(0, 4);
      if (/[妈爸子儿们]$/.test(s) && s.length > 3) s = s.slice(0, 3);
      return s;
    });
}

// ---------- 关键概念抽取 ----------
function extractConcepts(text, topN) {
  if (!text || !text.trim()) return [];
  const blocks = refineBlocks(splitBlocks(text));
  const df = new Map();
  blocks.forEach((b) => df.set(b, (df.get(b) || 0) + 1));
  const first = blocks[0] || '';
  const scored = [];
  df.forEach((c, g) => {
    if (STOP.has(g)) return;
    if (/^[这那此该其]/.test(g)) return;          // 指示代词开头
    if (FUNC_ONLY.test(g)) return;                // 纯功能词碎片
    let s = c * 3;                                // 出现频次
    s += (g.length >= 3 && g.length <= 5) ? 3 : (g.length <= 2 ? 1 : 2);
    if (first.indexOf(g) >= 0) s += 1.5;          // 首段加权
    if (/[0-9A-Za-z]/.test(g)) s += 1.5;          // 数字/术语加权
    scored.push({ g, s });
  });
  scored.sort((a, b) => b.s - a.s);
  const picked = [];
  for (const it of scored) {
    let dup = false;
    for (const p of picked) {
      if (p.g.indexOf(it.g) >= 0 || it.g.indexOf(p.g) >= 0) { dup = true; break; }
    }
    if (dup) continue;
    picked.push(it);
    if (picked.length >= topN) break;
  }
  return picked.map((p) => p.g);
}

// ---------- 各维度信号词 ----------
const SIG = {
  reasoning: [/因为/, /所以/, /因此/, /由此/, /这说明/, /意味着/, /推测/, /推断/, /我认为/, /由此可见/, /换句话说/, /说明/, /得出/, /如果.{0,12}就/],
  association: [/就像/, /类似/, /比如/, /例如/, /我记得/, /在生活中/, /平时/, /以前/, /联想/, /想到/, /和.{0,3}一样/, /实际[上中]/, /运用/, /联系/, /我家/, /我养/, /见过/],
  critical: [/为什么/, /是不是/, /不对/, /怀疑/, /然而/, /但是/, /有没有可能/, /真的吗/, /存疑/, /未必/, /换个角度/, /反过来/, /值得商榷/, /不一定/, /难道/, /奇怪/],
  expression: [/首先/, /其次/, /再次/, /最后/, /一方面/, /另一方面/, /总的[来而]说/, /第一/, /第二/, /先[，,]/, /然后/, /接下来/, /总结/, /我的看法/, /接着/],
};

function countSig(text, pats) {
  if (!text) return 0;
  let n = 0;
  for (const p of pats) {
    const m = text.match(new RegExp(p.source, 'g'));
    if (m) n += m.length;
  }
  return n;
}

// ---------- 新增概念的语境归类（推断 / 联想 / 其他）----------
function contextNear(text, concept, radius) {
  const i = text.indexOf(concept);
  if (i < 0) return '';
  return text.slice(Math.max(0, i - radius), i + concept.length + radius);
}

function classifyNovel(novel, transcript) {
  const inf = [];
  const ass = [];
  const other = [];
  novel.forEach((c) => {
    const ctx = contextNear(transcript, c, 14);
    if (SIG.association.some((p) => p.test(ctx))) ass.push(c);
    else if (SIG.reasoning.some((p) => p.test(ctx))) inf.push(c);
    else other.push(c);
  });
  return { inf, ass, other };
}

// ---------- 关联分析：书本概念 ↔ 回答 ----------
function linkAnalysis(pageText, transcript) {
  const page = (pageText || '').trim();
  const ans = (transcript || '').trim();
  const concepts = extractConcepts(page, 10);
  let hit = [];
  let miss = [];
  if (page && ans) {
    hit = concepts.filter((c) => ans.indexOf(c) >= 0);
    miss = concepts.filter((c) => ans.indexOf(c) < 0);
  } else if (page) {
    miss = concepts.slice();
  }
  const ansConcepts = extractConcepts(ans, 14);
  const novel = ansConcepts.filter((c) => {
    if (page.indexOf(c) >= 0) return false;       // 书本原文已出现 → 复述
    for (const pc of concepts) {                   // 与书本关键概念互为包含 → 仍属复述
      if (c.indexOf(pc) >= 0 || pc.indexOf(c) >= 0) return false;
    }
    return true;
  });
  const rate = concepts.length ? hit.length / concepts.length : 0;
  return { concepts, hit, miss, novel, rate };
}

// ---------- 洞察文案（引用真实概念）----------
function insightFor(key, score, ev) {
  const L = ev.link;
  const C = ev.cls;
  const j = (arr, n) => (arr || []).slice(0, n || 3).join('、');
  const q = (s) => `「${s}」`;
  const m = {
    information_extraction() {
      const t = L.concepts.length;
      if (!t) return '未提供书本页文本，暂无法评估信息提取。';
      if (score >= 85) return `孩子准确抓住了本页 ${L.hit.length}/${t} 个关键概念（${j(L.hit, 4)}），信息提取很到位。`;
      if (score >= 55) return `覆盖了 ${L.hit.length}/${t} 个关键概念${L.miss.length ? `，遗漏了${q(j(L.miss, 3))}` : ''}，可引导再读一遍找全要点。`;
      return `仅覆盖 ${L.hit.length}/${t} 个关键概念${L.miss.length ? `，${q(j(L.miss, 3))}都没提到` : ''}，建议陪读时圈画关键词。`;
    },
    reasoning() {
      if (score >= 85) return `回答有 ${ev.rSig} 处推理表达${C.inf.length ? `，并推出${q(j(C.inf, 3))}等书本外的结论` : ''}，逻辑链条清晰。`;
      if (score >= 55) return `有 ${ev.rSig} 处推理痕迹${C.inf.length ? `（如${q(j(C.inf, 2))}）` : ''}，可继续追问「为什么会这样」来加深。`;
      return `以复述为主（推理表达 ${ev.rSig} 处），暂未发现基于内容的推断，建议用「如果…会怎样」引导。`;
    },
    association() {
      if (score >= 85) return `能把内容与生活经验、已有知识联系起来（${ev.aSig} 处联想信号${C.ass.length ? `，提到${q(j(C.ass, 3))}` : ''}），迁移能力突出。`;
      if (score >= 55) return `出现了 ${ev.aSig} 处联想${C.ass.length ? `（${q(j(C.ass, 2))}）` : ''}，可鼓励多举生活中的例子。`;
      return `较少把知识与生活联系（${ev.aSig} 处），建议多问「你见过类似的吗」。`;
    },
    critical() {
      if (score >= 85) return `主动提出 ${ev.qCount} 个疑问、${ev.cSig} 处质疑表达，批判性思维萌芽明显，值得保护。`;
      if (score >= 55) return `有 ${ev.qCount} 处提问、${ev.cSig} 处质疑，可继续鼓励这种「为什么」。`;
      return `基本接受书本信息，较少提问或质疑（${ev.qCount} 处疑问），建议示范「有没有别的可能」。`;
    },
    expression() {
      if (score >= 85) return `回答共 ${ev.sentences} 句，使用 ${ev.eSig} 处连接词，表达有条理、层次清楚。`;
      if (score >= 55) return `表达基本完整（${ev.sentences} 句），可引导用「首先/其次/最后」让逻辑更顺。`;
      return `表达较零散（${ev.sentences} 句，平均句长偏短），建议练习「先说结论，再讲原因」。`;
    },
    resilience() {
      if (score >= 85) return `视频完成度 ${ev.videoCompletion}%、练习正确率 ${ev.exerciseAccuracy}%，全程坚持投入，学习韧性很好。`;
      if (score >= 55) return `视频 ${ev.videoCompletion}%、练习 ${ev.exerciseAccuracy}%，整体能坚持，偶尔需要鼓励。`;
      return `视频 ${ev.videoCompletion}%、练习 ${ev.exerciseAccuracy}%，投入度有待提升，建议拆分任务、及时肯定小进步。`;
    },
  };
  return m[key] ? m[key]() : '';
}

// ---------- Mock 分析（完全由输入决定，无随机数）----------
function analyzeMock(input) {
  const pageText = input.pageText || '';
  const transcript = input.transcript || '';
  const videoCompletion = +input.videoCompletion || 0;
  const exerciseAccuracy = +input.exerciseAccuracy || 0;
  const meta = input.meta || {};

  const link = linkAnalysis(pageText, transcript);
  const cls = classifyNovel(link.novel, transcript);
  const sentences = splitSentences(transcript);
  const tlen = transcript.length;
  const rSig = countSig(transcript, SIG.reasoning);
  const aSig = countSig(transcript, SIG.association);
  const cSig = countSig(transcript, SIG.critical);
  const eSig = countSig(transcript, SIG.expression);
  const qCount = (transcript.match(/[？?]/g) || []).length;
  const avgLen = sentences.length ? tlen / sentences.length : (tlen || 0);
  const uniq = tlen ? new Set(transcript.split('')).size / tlen : 0;

  const ev = {
    link, cls, rSig, aSig, cSig, qCount, eSig,
    sentences: sentences.length,
    videoCompletion,
    exerciseAccuracy,
  };

  // 1) 信息提取：书本关键概念在回答中的命中率
  const infoScore = pageText.trim() ? clamp(Math.round(20 + link.rate * 80), 0, 100) : 0;

  // 2) 推理判断：推理信号 + 书本外推断概念
  const rEv = rSig + cls.inf.length * 1.5;
  const reasoningScore = transcript.trim() ? clamp(Math.round(28 + (Math.min(rEv, 6) / 6) * 72), 0, 100) : 0;

  // 3) 联想迁移：联想信号 + 生活/经验类外来概念
  const aEv = aSig + cls.ass.length * 1.5;
  const associationScore = transcript.trim() ? clamp(Math.round(28 + (Math.min(aEv, 6) / 6) * 72), 0, 100) : 0;

  // 4) 批判质疑：质疑信号 + 疑问句
  const cEv = cSig + qCount * 1.3;
  const criticalScore = transcript.trim() ? clamp(Math.round(28 + (Math.min(cEv, 6) / 6) * 72), 0, 100) : 0;

  // 5) 表达组织：句数 + 连接词 + 平均句长 + 用字丰富度
  const lenBonus = avgLen >= 10 && avgLen <= 35 ? Math.min((avgLen - 10) * 1.2, 16) : (avgLen < 10 ? -12 : 6);
  const expressionScore = transcript.trim()
    ? clamp(Math.round((sentences.length >= 3 ? 36 : sentences.length === 2 ? 26 : 12) + Math.min(eSig, 4) * 5 + lenBonus + uniq * 16), 0, 100)
    : 0;

  // 6) 坚持韧性：视频完成度 + 练习正确率 + 重试/时长
  const retries = meta.retries || 0;
  const dur = meta.durationSec || 0;
  const resilienceScore = clamp(Math.round(videoCompletion * 0.45 + exerciseAccuracy * 0.35 + (retries > 0 ? 12 : 0) + (dur > 30 ? 8 : 0)), 0, 100);

  const defs = [
    ['information_extraction', '信息提取', infoScore],
    ['reasoning', '推理判断', reasoningScore],
    ['association', '联想迁移', associationScore],
    ['critical', '批判质疑', criticalScore],
    ['expression', '表达组织', expressionScore],
    ['resilience', '坚持韧性', resilienceScore],
  ];

  const scores = {};
  defs.forEach((d) => {
    scores[d[0]] = {
      key: d[0],
      name: d[1],
      score: d[2],
      level: levelOf(d[2]),
      evidence: {},
      insight: insightFor(d[0], d[2], ev),
    };
  });

  const overall = Math.round(
    (infoScore + reasoningScore + associationScore + criticalScore + expressionScore + resilienceScore) / 6
  );

  // 建议：针对最弱的两个维度给出可执行动作
  const ACTION = {
    information_extraction: '陪读时先让孩子圈出「谁、在哪、做了什么」，再复述一遍。',
    reasoning: '读完问一句「为什么会这样？你是怎么知道的？」，要求给出依据。',
    association: '问「这让你想到生活中的什么？」，鼓励举一个自己见过的例子。',
    critical: '示范提问：「书上说的就一定对吗？有没有别的可能？」',
    expression: '让孩子用「首先…然后…最后…」重说一遍，先说结论再讲理由。',
    resilience: '把任务拆成小段，每完成一段及时肯定，逐步拉长专注时间。',
  };
  const order = defs.slice().sort((a, b) => a[2] - b[2]);
  const suggestions = [];
  order.slice(0, 2).forEach((d) => {
    if (d[2] < 85) suggestions.push(`【${d[1]}】当前 ${d[2]} 分。${ACTION[d[0]]}`);
  });
  if (!suggestions.length) suggestions.push('各维度表现均较好，可适度增加开放性与挑战性问题，保持孩子的表达欲。');

  return { scores, overall, suggestions, link, cls };
}

// ---------- LLM 模式（预留，未配置自动回退 mock）----------
async function analyzeLLM(input) {
  const apiKey = process.env.OPENAI_API_KEY;
  const base = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  if (!apiKey) return analyzeMock(input); // 回退
  const prompt = buildLLMPrompt(input);
  try {
    const resp = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: '你是儿童学习力评估专家，严格返回 JSON。' },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
      }),
    });
    const data = await resp.json();
    return parseLLMResult(data, input);
  } catch (e) {
    return analyzeMock(input);
  }
}

function buildLLMPrompt(input) {
  return `请基于以下学习过程数据，对 6 个维度各给 0-100 分与一句家长视角的洞察。
维度：信息提取、推理判断、联想迁移、批判质疑、表达组织、坚持韧性。
评分时必须以「书本文本中的关键概念是否被孩子回答命中」作为信息提取的核心依据，
并区分孩子是单纯复述，还是做出了推断、联想或质疑。
输入：
- 书本页文本：${input.pageText}
- 孩子语音回答：${input.transcript}
- 视频观看完成度：${input.videoCompletion}%
- 练习正确率：${input.exerciseAccuracy}%
返回 JSON：{"scores":{维度key:{score,insight}},"overall":int}`;
}

function parseLLMResult(data, input) {
  // 占位：真实项目在此解析大模型返回；失败时回退 mock，保证不崩
  try {
    const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!content) return analyzeMock(input);
    return analyzeMock(input);
  } catch (e) {
    return analyzeMock(input);
  }
}

// ---------- 统一入口 ----------
async function analyze(input) {
  const mode = input.meta && input.meta.mode; // 'mock' | 'llm'
  if (mode === 'llm') return analyzeLLM(input);
  return analyzeMock(input);
}

module.exports = { analyze, analyzeMock, levelOf, extractConcepts, linkAnalysis };
