'use strict';
/**
 * OCR Mock：图片(base64) → 书本页文本
 * 真实环境替换为 腾讯云/百度 OCR 等；此处按图片哈希从样例页池中取，保证可复现且多样。
 */
const SAMPLE_PAGES = [
  {
    title: '《小蝌蚪找妈妈》第12页',
    text: '小蝌蚪游啊游，遇见了鲤鱼妈妈。鲤鱼妈妈告诉它：你的妈妈有四条腿，宽宽的嘴巴。小蝌蚪继续往前找，又遇见了乌龟。乌龟说：你的妈妈眼睛鼓鼓的，披着绿衣服。最后，小蝌蚪找到了青蛙妈妈，原来自己也会变成青蛙。',
  },
  {
    title: '《植物的呼吸》科学页',
    text: '植物也要呼吸。白天，叶子在阳光下进行光合作用，制造养料并释放氧气。夜晚没有阳光，植物只进行呼吸作用，吸收氧气放出二氧化碳。所以卧室里不宜摆放太多植物过夜。',
  },
  {
    title: '《分数的初步》数学页',
    text: '把一个披萨平均分成4份，每一份就是它的四分之一，写作1/4。分母4表示平均分成几份，分子1表示取了几份。两张四分之一拼起来是二分之一。分数越大，表示取的份数越多。',
  },
  {
    title: '《水的三态》常识页',
    text: '水在常温下是液态。加热到100摄氏度会变成气态的水蒸气；遇冷到0摄氏度会结成固态的冰。云、雨、雪都是水在不同温度下的不同样子。自然界的水一直在循环。',
  },
];

function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function ocrMock(imageBase64) {
  const idx = hashStr(imageBase64 || 'empty') % SAMPLE_PAGES.length;
  const page = SAMPLE_PAGES[idx];
  return { title: page.title, text: page.text, pageIndex: idx };
}

module.exports = { ocrMock, SAMPLE_PAGES };
