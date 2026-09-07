// pages/index/index.js
const app = getApp();
Page({
  data: { childId: '', childName: '', saved: false },
  onShow() {
    const id = app.globalData.childId;
    const name = app.globalData.childName;
    this.setData({ childId: id, childName: name, saved: !!id });
  },
  onIdInput(e) { this.setData({ childId: e.detail.value }); },
  onNameInput(e) { this.setData({ childName: e.detail.value }); },
  saveChild() {
    const id = (this.data.childId || '').trim();
    const name = (this.data.childName || '').trim();
    if (!id) { wx.showToast({ title: '请填写儿童ID', icon: 'none' }); return; }
    app.globalData.childId = id;
    app.globalData.childName = name || id;
    wx.setStorageSync('child', { id, name: name || id });
    this.setData({ saved: true });
    wx.showToast({ title: '已保存', icon: 'success' });
  },
  startLearning() {
    if (!app.globalData.childId) { wx.showToast({ title: '请先填写儿童信息', icon: 'none' }); return; }
    require('../../utils/session').clearDraft();
    wx.navigateTo({ url: '/pages/video/video' });
  },
  openProfile() {
    if (!app.globalData.childId) { wx.showToast({ title: '请先填写儿童信息', icon: 'none' }); return; }
    wx.navigateTo({ url: '/pages/profile/profile' });
  },
});
