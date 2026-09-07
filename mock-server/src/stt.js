'use strict';
/**
 * STT Mock：语音(base64) → 文字
 * 真实环境替换为 微信同声传译/讯飞/Whisper 等；此处按音频哈希从样例回答池中取。
 * 样例刻意覆盖不同能力水平，便于演示 6 维评分差异。
 */
const SAMPLE_TRANSCRIPTS = [
  // 高水平：信息全、有推理、有联想、有质疑、有条理
  '首先，小蝌蚪找妈妈的时候，鲤鱼说妈妈有四条腿、宽宽的嘴巴，乌龟说妈妈眼睛鼓鼓的、披绿衣服。由此我推测青蛙和乌龟不一样，青蛙没有壳。这让我想到我养的小金鱼，它也没有腿。不过我有点怀疑，为什么小蝌蚪自己会变样子呢？',
  // 中水平：信息基本、少量推理、少联想
  '小蝌蚪遇见了鲤鱼妈妈和乌龟，它们告诉小蝌蚪妈妈长什么样。最后小蝌蚪找到了青蛙妈妈。我觉得小蝌蚪很可爱，因为一直在找妈妈。',
  // 待提升：复述为主、缺推理与质疑、表达零散
  '小蝌蚪找妈妈。它看见了鲤鱼。然后又看见了乌龟。最后找到了。完了。',
  // 数学页高水平回答
  '这张页讲分数。把一个披萨平均分成4份，每一份是四分之一，写作1/4。分母4表示分成几份，分子1表示取几份。两张四分之一拼起来是二分之一。如果分成8份，那每一份更小，这说明分母越大每份越小，我觉得这个和切蛋糕一样。',
];

function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function sttMock(audioBase64) {
  const idx = hashStr(audioBase64 || 'empty') % SAMPLE_TRANSCRIPTS.length;
  return { text: SAMPLE_TRANSCRIPTS[idx], clipIndex: idx };
}

module.exports = { sttMock, SAMPLE_TRANSCRIPTS };
