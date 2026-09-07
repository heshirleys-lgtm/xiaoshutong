// pages/profile/profile.js
const { request } = require('../../utils/request');
const app = getApp();
const session = require('../../utils/session');
const DIMS = session.DIMS;
Page({
  data: { loading: true, name: '', sessionCount: 0, latestOverall: '-', dims: [] },
  onShow() { this.load(); },
  load() {
    const id = app.globalData.childId;
    if (!id) { this.setData({ loading: false }); return; }
    request('/api/child/' + encodeURIComponent(id), 'GET').then((res) => {
      if (!res.ok) throw new Error(res.msg);
      const p = res.profile;
      const dims = DIMS.map((d) => {
        const series = (p.series[d.key] || []).map((x) => x.score);
        const last = series.length ? series[series.length - 1] : null;
        return { name: d.name, series, last };
      });
      this.setData({
        loading: false, name: p.name, sessionCount: p.sessionCount,
        latestOverall: p.latest ? p.latest.overall : '-', dims,
      });
    }).catch((e) => { this.setData({ loading: false }); wx.showToast({ title: e.message, icon: 'none' }); });
  },
  fillClass(s) { return s == null ? '' : s >= 85 ? 'fill-good' : s >= 55 ? 'fill-warn' : 'fill-bad'; },
});
