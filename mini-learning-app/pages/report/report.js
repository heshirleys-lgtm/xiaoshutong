// pages/report/report.js
const { request } = require('../../utils/request');
const session = require('../../utils/session');
const DIMS = session.DIMS;
Page({
  data: { loading: true, report: null, dims: [], overall: 0, video: 0, exercise: 0, suggestions: [], pageTitle: '', transcript: '' },
  onLoad(q) {
    if (!q.sessionId) { this.setData({ loading: false }); return; }
    request('/api/report?sessionId=' + q.sessionId, 'GET').then((res) => {
      if (!res.ok) throw new Error(res.msg);
      const r = res.report;
      const dims = DIMS.map((d) => Object.assign({ name: d.name }, r.scores[d.key])).filter((x) => x.score != null);
      this.setData({
        loading: false, report: r, dims,
        overall: r.overall, video: r.videoCompletion, exercise: r.exerciseAccuracy,
        suggestions: r.suggestions || [], pageTitle: r.pageTitle || '', transcript: r.transcript || '',
      });
      this.drawRadar(dims);
    }).catch((e) => { this.setData({ loading: false }); wx.showToast({ title: e.message, icon: 'none' }); });
  },
  fillClass(score) { return score >= 85 ? 'fill-good' : score >= 55 ? 'fill-warn' : 'fill-bad'; },
  levelClass(lv) { return 'lv-' + lv; },
  drawRadar(dims) {
    try {
      const q = wx.createSelectorQuery();
      q.select('#radar').fields({ node: true, size: true }).exec((res) => {
        if (!res[0]) return;
        const canvas = res[0].node; const ctx = canvas.getContext('2d');
        const w = res[0].width, h = res[0].height;
        const dpr = (wx.getWindowInfo && wx.getWindowInfo().pixelRatio) || 2;
        canvas.width = w * dpr; canvas.height = h * dpr; ctx.scale(dpr, dpr);
        const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 28;
        const n = dims.length; const labels = dims.map((d) => d.name);
        ctx.clearRect(0, 0, w, h);
        // 网格
        for (let g = 1; g <= 3; g++) {
          ctx.beginPath();
          for (let i = 0; i <= n; i++) {
            const ang = -Math.PI / 2 + (i % n) * 2 * Math.PI / n;
            const r = R * g / 3;
            const x = cx + r * Math.cos(ang), y = cy + r * Math.sin(ang);
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
          }
          ctx.strokeStyle = '#e6ebf2'; ctx.stroke();
        }
        // 数据多边形
        ctx.beginPath();
        dims.forEach((d, i) => {
          const ang = -Math.PI / 2 + i * 2 * Math.PI / n;
          const r = R * (d.score / 100);
          const x = cx + r * Math.cos(ang), y = cy + r * Math.sin(ang);
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.fillStyle = 'rgba(47,124,246,0.25)'; ctx.fill();
        ctx.strokeStyle = '#2f7cf6'; ctx.lineWidth = 2; ctx.stroke();
        // 标签
        ctx.fillStyle = '#6b7785'; ctx.font = '11px sans-serif';
        dims.forEach((d, i) => {
          const ang = -Math.PI / 2 + i * 2 * Math.PI / n;
          const x = cx + (R + 14) * Math.cos(ang), y = cy + (R + 14) * Math.sin(ang);
          ctx.textAlign = 'center'; ctx.fillText(d.name, x, y + 4);
        });
      });
    } catch (e) { /* 雷达可选，失败不影响条形展示 */ }
  },
  openProfile() { wx.navigateTo({ url: '/pages/profile/profile' }); },
});
