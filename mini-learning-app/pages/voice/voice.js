// pages/voice/voice.js
const session = require('../../utils/session');
const { fileToBase64 } = session;
Page({
  data: {
    recording: false,
    recorded: false,
    seconds: 0,
    question: '请看着刚才拍下的那一页，用语音说说：这一页讲了什么？你有什么想法、联系或疑问？',
  },
  onLoad() { this.recorder = wx.getRecorderManager(); this.bindRecorder(); },
  bindRecorder() {
    this.recorder.onStop((res) => {
      clearInterval(this.timer);
      this.setData({ recording: false, recorded: true, audioPath: res.tempFilePath, seconds: this.data.seconds });
      fileToBase64(res.tempFilePath, 'audio/mp3').then((b64) => {
        session.setDraft({ voice: b64, durationSec: this.data.seconds });
      }).catch(() => wx.showToast({ title: '读取录音失败', icon: 'none' }));
    });
    this.recorder.onError(() => wx.showToast({ title: '录音出错', icon: 'none' }));
  },
  startRecord() {
    wx.authorize({ scope: 'scope.record', success: () => this.doStart(), fail: () => wx.showToast({ title: '请授权麦克风', icon: 'none' }) });
  },
  doStart() {
    this.setData({ recording: true, recorded: false, seconds: 0 });
    this.recorder.start({ duration: 60000, format: 'mp3' });
    this.timer = setInterval(() => this.setData({ seconds: this.data.seconds + 1 }), 1000);
  },
  stopRecord() { this.recorder.stop(); },
  playback() {
    if (!this.data.audioPath) return;
    const ctx = wx.createInnerAudioContext();
    ctx.src = this.data.audioPath;
    ctx.play();
  },
  next() {
    if (!this.data.recorded) { wx.showToast({ title: '请先完成语音回答', icon: 'none' }); return; }
    wx.navigateTo({ url: '/pages/exercise/exercise' });
  },
});
