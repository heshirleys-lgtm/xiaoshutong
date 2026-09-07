// utils/session.js —— 跨页面暂存本次学习过程数据
const KEY = 'sessionDraft';
const DIMS = [
  { key: 'information_extraction', name: '信息提取' },
  { key: 'reasoning', name: '推理判断' },
  { key: 'association', name: '联想迁移' },
  { key: 'critical', name: '批判质疑' },
  { key: 'expression', name: '表达组织' },
  { key: 'resilience', name: '坚持韧性' },
];
function getDraft() {
  return wx.getStorageSync(KEY) || {};
}
function setDraft(patch) {
  const d = Object.assign(getDraft(), patch);
  wx.setStorageSync(KEY, d);
  return d;
}
function clearDraft() {
  wx.removeStorageSync(KEY);
}
// 小程序临时文件 -> base64 dataURL
function fileToBase64(filePath, mime) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: 'base64',
      success: (res) => resolve('data:' + (mime || 'application/octet-stream') + ';base64,' + res.data),
      fail: reject,
    });
  });
}
module.exports = { DIMS, getDraft, setDraft, clearDraft, fileToBase64 };
