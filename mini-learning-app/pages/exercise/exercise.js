// pages/exercise/exercise.js
const session = require('../../utils/session');
const { request } = require('../../utils/request');
const app = getApp();
const QUESTIONS = [
  { q: '拍照环节的目的是？', options: ['随便拍一张', '拍下与学习内容对应的书本页', '拍自己', '拍桌面'], answer: 1 },
  { q: '语音回答更看重？', options: ['声音大小', '说得多长', '对页面信息的理解与想法', '语速快慢'], answer: 2 },
  { q: '家长报告主要帮助？', options: ['代替孩子学习', '了解孩子 6 维能力并针对性陪伴', '打分排名', '布置更多作业'], answer: 1 },
];
Page({
  data: { questions: QUESTIONS, picks: {}, accuracy: 0, submitting: false },
  onPick(e) {
    const idx = e.currentTarget.dataset.q;
    const opt = e.currentTarget.dataset.o;
    const picks = Object.assign({}, this.data.picks);
    picks[idx] = opt;
    this.setData({ picks });
  },
  computeAccuracy() {
    const picks = this.data.picks;
    let correct = 0;
    this.data.questions.forEach((item, i) => { if (picks[i] === item.answer) correct++; });
    return Math.round((correct / this.data.questions.length) * 100);
  },
  async submit() {
    if (Object.keys(this.data.picks).length < this.data.questions.length) {
      wx.showToast({ title: '请完成所有练习', icon: 'none' });
      return;
    }
    const accuracy = this.computeAccuracy();
    this.setData({ submitting: true });
    const draft = session.getDraft();
    const payload = {
      childId: app.globalData.childId,
      childName: app.globalData.childName,
      videoCompletion: draft.videoCompletion || 0,
      exerciseAccuracy: accuracy,
      photo: draft.photo,
      voice: draft.voice,
      question: '开放语音问答（关于所拍书本页）',
      durationSec: draft.durationSec || 0,
      retries: draft.retries || 0,
    };
    try {
      const res = await request('/api/session/submit', 'POST', payload);
      if (!res.ok) throw new Error(res.msg);
      session.clearDraft();
      wx.redirectTo({ url: '/pages/report/report?sessionId=' + res.sessionId });
    } catch (e) {
      wx.showToast({ title: '提交失败: ' + e.message, icon: 'none' });
      this.setData({ submitting: false });
    }
  },
});
