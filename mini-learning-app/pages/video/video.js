// pages/video/video.js
const session = require('../../utils/session');
Page({
  data: { src: 'https://www.w3schools.com/html/mov_bbb.mp4', percent: 0, duration: 0, currentTime: 0, manual: false },
  onTimeUpdate(e) {
    const d = e.detail.duration || 0;
    const t = e.detail.currentTime || 0;
    const p = d > 0 ? Math.min(100, Math.round((t / d) * 100)) : 0;
    this.setData({ percent: p, duration: d, currentTime: t });
  },
  onEnded() { this.setData({ percent: 100 }); },
  onSlider(e) { this.setData({ percent: e.detail.value, manual: true }); },
  next() {
    const p = this.data.percent;
    session.setDraft({ videoCompletion: p });
    wx.navigateTo({ url: '/pages/photo/photo' });
  },
});
