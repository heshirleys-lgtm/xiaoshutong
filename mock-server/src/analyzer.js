'use strict';
/**
 * 6 维学习能力分析引擎
 * 维度：信息提取 / 推理判断 / 联想迁移 / 批判质疑 / 表达组织 / 坚持韧性
 *
 * 设计：
 *  - analyze() 为统一入口，mode 可切 'mock'（默认，零依赖可复现）或 'llm'（预留真实大模型接口）
 *  - mock 模式用「启发式信号检测 + 种子随机」保证结果稳定、可复现、可解释
 *  - llm 模式预留 OpenAI 兼容调用骨架，未配置 key 时自动回退 mock，保证不崩
 */

// ---------- 工具 ----------
function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededRandom(seedStr) {
  let a = hashStr(seedStr) || 1;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function levelOf(score) {
  if (score >= 85) return '优秀';
  if (score >= 55) return '良好';
  return '待提升';
}

// 从文本抽取「关键字/短语」：先按标点分段，再在段内滑窗取 2/3 字短语，
// 过滤功能词边界碎片，去重。英文按单词。
function extractKeywords(text) {
  if (!text) return [];
  const segs = text.split(/[，。！？、；：\s,.;:!?]/).filter(Boolean);
  const set = new Set();
  segs.forEach((seg) => {
    // 2-gram：两侧字符都不能是功能词，避免"和乌""样最"类噪声
    for (let i = 0; i + 1 < seg.length; i++) {
      const g = seg.slice(i, i + 2);
      if (!/[一-龥]/.test(g)) continue;
      if (FUNCTION.has(g[0]) || FUNCTION.has(g[1])) continue;
      if (STOP.has(g)) continue;
      set.add(g);
    }
    // 3-gram：更有信息量，整体保留
    for (let i = 0; i + 2 < seg.length; i++) {
      const g = seg.slice(i, i + 3);
      if (!/[一-龥]/.test(g)) continue;
      if (STOP.has(g)) continue;
      set.add(g);
    }
  });
  const en = (text.toLowerCase().match(/[a-z]{3,}/g) || []);
  en.forEach((w) => set.add(w));
  return [...set];
}

function countSignals(text, patterns) {
  if (!text) return 0;
  let n = 0;
  for (const p of patterns) {
    const m = text.match(p);
    if (m) n += m.length;
  }
  return n;
}

function splitSentences(text) {
  if (!text) return [];
  return text.split(/[。！？!?\n;；]+/).map((s) => s.trim()).filter(Boolean);
}

// 单字功能词（用于过滤噪声 2-gram，如"和乌""样最"）
const FUNCTION = new Set('的了是在和我你们它们有个这那也就都很不会把被给对与及或但而因所让使要去来上下里中后前说看做起想知到过又还最比被将应'.split(''));
// 整词停用词
const STOP = new Set(['我们', '他们', '自己', '这个', '那个', '这些', '那些', '这样', '就是', '觉得', '好像', '然后', '一个', '没有', '不是', '还是', '怎么', '时候', '东西', '进行', '通过', '以及', '对于', '这种', '一种', '一些', '已经', '可能', '什么', '妈妈']);

// ---------- 各维度信号词 ----------
const SIGNALS = {
  reasoning: [/因为/g, /所以/g, /因此/g, /由此/g, /这说明/g, /意味着/g, /推测/g, /如果[^\n]{0,20}?就/g, /我认为/g, /由此可[见知]/g, /换句话说/g, /说明[了白]/g, /得出/g],
  association: [/就像/g, /类似/g, /比如/g, /例如/g, /我记得/g, /在生活中/g, /平时/g, /以前/g, /联想/g, /迁移/g, /让我想到/g, /想到/g, /和[一這那]?样/g, /实际[上中]/g, /运用/g, /联系/g],
  critical: [/为什么/g, /是不是/g, /不对/g, /怀疑/g, /然而/g, /但是/g, /有没有可能/g, /真的吗/g, /存疑/g, /未必/g, /换个角度/g, /反过来/g, /值得商榷/g, /真的对吗/g, /不一定/g],
  expression: [/首先/g, /其次/g, /最后/g, /一方面/g, /另一方面/g, /总的[来而]说/g, /第一/g, /第二/g, /先[，,]/g, /然后/g, /接下来/g, /总结/g, /我的看法/g],
};

// 信号数 → 分数（儿童短回答场景，2 个信号即达良好）
function scoreFromSignals(count, rnd) {
  return clamp(Math.round(30 + Math.min(count, 5) * 14 + (rnd() - 0.5) * 6), 0, 100);
}

// ---------- Mock 分析 ----------
function analyzeMock(input) {
  const { pageText = '', transcript = '', videoCompletion = 0, exerciseAccuracy = 0, meta = {} } = input;
  const seed = (meta.childId || 'x') + '|' + (meta.sessionId || 'x') + '|' + (meta.question || '');
  const rnd = seededRandom(seed);

  const sentences = splitSentences(transcript);
  const transcriptLen = transcript.length;

  // 1) 信息提取：页面关键字在回答中的覆盖度
  const pageKeywords = extractKeywords(pageText).filter((k) => !STOP.has(k));
  const matched = pageKeywords.filter((k) => transcript.includes(k));
  const coverage = pageKeywords.length ? matched.length / pageKeywords.length : 0.5;
  const infoScore = clamp(Math.round(coverage * 70 + 30 + (rnd() - 0.5) * 8), 0, 100);

  // 2) 推理判断
  const rCount = countSignals(transcript, SIGNALS.reasoning);
  const reasoningScore = scoreFromSignals(rCount, rnd);

  // 3) 联想迁移
  const aCount = countSignals(transcript, SIGNALS.association);
  const associationScore = scoreFromSignals(aCount, rnd);

  // 4) 批判质疑
  const cCount = countSignals(transcript, SIGNALS.critical);
  const criticalScore = scoreFromSignals(cCount, rnd);

  // 5) 表达组织：句子数、连接词、平均句长、词汇丰富度
  const uniqueRatio = transcriptLen ? new Set(transcript.split('')).size / transcriptLen : 0;
  const eCount = countSignals(transcript, SIGNALS.expression);
  const avgLen = sentences.length ? transcriptLen / sentences.length : 0;
  // 平均句长过短（碎句）扣分，理想区间 8~25 字
  const lenBonus = avgLen >= 8 && avgLen <= 30 ? Math.min((avgLen - 8) * 1.5, 18) : (avgLen < 8 ? -10 : 8);
  const expressionScore = clamp(
    Math.round((sentences.length >= 3 ? 38 : sentences.length === 2 ? 26 : 12) + Math.min(eCount, 4) * 5 + lenBonus + uniqueRatio * 14 + (rnd() - 0.5) * 5),
    0, 100
  );

  // 6) 坚持韧性：视频完成度 + 练习正确率 + 重试/时长
  const retries = meta.retries || 0;
  const durationSec = meta.durationSec || 0;
  const persistence = clamp((retries > 0 ? 15 : 0) + (durationSec > 30 ? 10 : 0) + (rnd() - 0.3) * 10, 0, 30);
  const resilienceScore = clamp(
    Math.round(videoCompletion * 0.4 + exerciseAccuracy * 0.3 + persistence),
    0, 100
  );

  const scores = {
    information_extraction: buildDimension('information_extraction', '信息提取', infoScore, {
      coverage: +coverage.toFixed(2), matched: matched.length, total: pageKeywords.length,
    }),
    reasoning: buildDimension('reasoning', '推理判断', reasoningScore, { signals: rCount }),
    association: buildDimension('association', '联想迁移', associationScore, { signals: aCount }),
    critical: buildDimension('critical', '批判质疑', criticalScore, { signals: cCount }),
    expression: buildDimension('expression', '表达组织', expressionScore, {
      sentences: sentences.length, structureSignals: eCount, uniqueRatio: +uniqueRatio.toFixed(2),
    }),
    resilience: buildDimension('resilience', '坚持韧性', resilienceScore, {
      videoCompletion, exerciseAccuracy, retries, durationSec,
    }),
  };

  const overall = Math.round(
    (infoScore + reasoningScore + associationScore + criticalScore + expressionScore + resilienceScore) / 6
  );

  const suggestions = buildSuggestions(scores);

  return { scores, overall, suggestions };
}

function buildDimension(key, name, score, evidence) {
  return {
    key,
    name,
    score,
    level: levelOf(score),
    evidence,
    insight: insightFor(key, score, evidence),
  };
}

// 维度洞察文案（家长视角、可解释）
function insightFor(key, score, ev) {
  const lv = levelOf(score);
  const map = {
    information_extraction: {
      优秀: `孩子能准确抓住书本要点，覆盖关键信息 ${ev.matched}/${ev.total} 个，提取能力强。`,
      良好: `孩子基本抓住了主要内容，但仍有部分关键信息（${ev.total - ev.matched} 个）未提及，可引导其更细致地阅读。`,
      待提升: `孩子对页面关键信息的提取较弱，仅覆盖 ${ev.matched}/${ev.total} 个要点，建议先陪读、指读关键词。`,
    },
    reasoning: {
      优秀: `孩子能基于内容做出合理推断，逻辑链条清晰（检测到 ${ev.signals} 处推理表达）。`,
      良好: `孩子有一些推理意识（${ev.signals} 处），可多问"为什么会这样"来强化。`,
      待提升: `孩子多在复述，较少主动推断（仅 ${ev.signals} 处），建议用"如果…会怎样"类问题启发。`,
    },
    association: {
      优秀: `孩子能主动联系生活经验与其他知识（${ev.signals} 处联想），迁移能力突出。`,
      良好: `孩子有少量联想（${ev.signals} 处），可鼓励多举生活例子。`,
      待提升: `孩子较少把知识和生活联系起来（${ev.signals} 处），建议多做"你见过类似的吗"讨论。`,
    },
    critical: {
      优秀: `孩子会主动质疑与追问（${ev.signals} 处），具备可贵批判性思维萌芽。`,
      良好: `孩子偶有质疑（${ev.signals} 处），可保护并引导这种"为什么"。`,
      待提升: `孩子基本接受信息、较少提问（${ev.signals} 处），建议示范"有没有别的可能"。`,
    },
    expression: {
      优秀: `回答结构清晰（${ev.structureSignals} 处连接词、${ev.sentences} 句），表达有条理。`,
      良好: `表达尚可（${ev.sentences} 句），可引导用"首先/其次"让逻辑更顺。`,
      待提升: `表达较零散（${ev.sentences} 句），建议练习"先说结论再展开"。`,
    },
    resilience: {
      优秀: `视频完成度 ${ev.videoCompletion}%、练习正确率 ${ev.exerciseAccuracy}%，且坚持投入，韧性很好。`,
      良好: `视频 ${ev.videoCompletion}%、练习 ${ev.exerciseAccuracy}%，整体有坚持，偶尔需鼓励。`,
      待提升: `视频 ${ev.videoCompletion}%、练习 ${ev.exerciseAccuracy}%${ev.retries ? `、重试 ${ev.retries} 次` : ''}，建议拆分任务、及时肯定小进步。`,
    },
  };
  return (map[key] && map[key][lv]) || '';
}

function buildSuggestions(scores) {
  const out = [];
  Object.values(scores).forEach((d) => {
    if (d.level === '待提升') {
      out.push(`【${d.name}】${d.insight} 家长可重点陪伴练习。`);
    } else if (d.level === '优秀') {
      out.push(`【${d.name}】表现优秀，可适度增加挑战性任务保持兴趣。`);
    }
  });
  if (!out.length) out.push('各维度均处于良好水平，保持当前陪伴节奏即可。');
  return out;
}

// ---------- LLM 模式（预留，未配置自动回退 mock）----------
async function analyzeLLM(input) {
  const apiKey = process.env.OPENAI_API_KEY;
  const base = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  if (!apiKey) return analyzeMock(input); // 回退
  // 真实调用骨架（按需启用，不阻塞 mock 演示）
  const prompt = buildLLMPrompt(input);
  try {
    const resp = await fetch(base + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [{ role: 'system', content: '你是儿童学习力评估专家，严格返回 JSON。' }, { role: 'user', content: prompt }],
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
输入：
- 书本页文本：${input.pageText}
- 孩子语音回答：${input.transcript}
- 视频观看完成度：${input.videoCompletion}%
- 练习正确率：${input.exerciseAccuracy}%
返回 JSON：{"scores":{维度key:{score,insight}},"overall":int}`; // key 用中文维度名
}

function parseLLMResult() { return analyzeMock(arguments[0]); } // 占位：真实解析见接入文档

// ---------- 统一入口 ----------
async function analyze(input) {
  const mode = input.meta && input.meta.mode; // 'mock' | 'llm'
  if (mode === 'llm') return analyzeLLM(input);
  return analyzeMock(input);
}

module.exports = { analyze, analyzeMock, levelOf };
