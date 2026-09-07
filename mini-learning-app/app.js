// app.js
App({
  globalData: {
    // 儿童ID：真实环境从登录态获取，这里用本地存储模拟
    childId: '',
    childName: '',
    // 后端地址：微信开发者工具中可用 127.0.0.1；
    // 真机预览需改为电脑局域网 IP（如 http://192.168.1.10:3000），并在后台「不校验合法域名」
    apiBase: 'http://127.0.0.1:3000',
  },
  onLaunch() {
    const saved = wx.getStorageSync('child');
    if (saved) {
      this.globalData.childId = saved.id;
      this.globalData.childName = saved.name;
    }
  },
});
