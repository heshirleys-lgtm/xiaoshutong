// pages/photo/photo.js
const session = require('../../utils/session');
const { fileToBase64 } = session;
Page({
  data: { taken: false, photoPath: '', error: '' },
  onLoad() {
    this.cameraCtx = wx.createCameraContext();
  },
  takePhoto() {
    this.cameraCtx.takePhoto({
      quality: 'high',
      success: (res) => {
        this.setData({ taken: true, photoPath: res.tempImagePath });
        fileToBase64(res.tempImagePath, 'image/png').then((b64) => {
          session.setDraft({ photo: b64 });
        }).catch((e) => wx.showToast({ title: '读取图片失败', icon: 'none' }));
      },
      fail: () => wx.showToast({ title: '拍照失败，请重试', icon: 'none' }),
    });
  },
  retake() { this.setData({ taken: false, photoPath: '' }); },
  next() {
    if (!this.data.taken) { wx.showToast({ title: '请先拍照', icon: 'none' }); return; }
    wx.navigateTo({ url: '/pages/voice/voice' });
  },
  onError(e) { this.setData({ error: e.detail.errMsg || '相机不可用' }); },
});
