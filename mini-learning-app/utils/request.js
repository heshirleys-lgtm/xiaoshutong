// utils/request.js —— 封装后端请求
const app = getApp();
function request(path, method, data) {
  const base = (app && app.globalData.apiBase) || 'http://127.0.0.1:3000';
  return new Promise((resolve, reject) => {
    wx.request({
      url: base + path,
      method: method || 'GET',
      data: data || {},
      header: { 'Content-Type': 'application/json' },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
        else reject(new Error('HTTP ' + res.statusCode + ' ' + JSON.stringify(res.data)));
      },
      fail: (err) => reject(new Error('网络错误: ' + err.errMsg)),
    });
  });
}
module.exports = { request };
