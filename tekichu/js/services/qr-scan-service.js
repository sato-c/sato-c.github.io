/**
 * QRScanService - カメラでQRコードを読み取る
 * jsQR（CDN）を使用
 */

export class QRScanService {
  static overlay = null;
  static video = null;
  static canvas = null;
  static ctx = null;
  static stream = null;
  static scanning = false;
  static scannedCodes = [];
  static onComplete = null;
  static animFrame = null;
  static statusEl = null;
  static debugEl = null;
  static frameCount = 0;
  static scanProfiles = [
    { maxDim: 1280, cropRatio: 1.0 },
    { maxDim: 960, cropRatio: 1.0 },
    { maxDim: 960, cropRatio: 0.8 },
    { maxDim: 640, cropRatio: 1.0 },
  ];

  static start(callback) {
    if (typeof jsQR === 'undefined') {
      throw new Error('jsQRライブラリが読み込まれていません');
    }

    this.onComplete = callback;
    this.scannedCodes = [];
    this.scanning = true;
    this.frameCount = 0;
    this._createUI();
    this._startCamera();
  }

  static stop() {
    this.scanning = false;
    if (this.animFrame) {
      cancelAnimationFrame(this.animFrame);
      this.animFrame = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
      this.overlay = null;
    }
  }

  static _createUI() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'qr-scanner-overlay';

    const header = document.createElement('div');
    header.className = 'qr-scanner-header';

    const title = document.createElement('span');
    title.textContent = '馬券QR読取';
    header.appendChild(title);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'qr-scanner-close';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => this.stop());
    header.appendChild(closeBtn);

    this.overlay.appendChild(header);

    this.video = document.createElement('video');
    this.video.className = 'qr-scanner-video';
    this.video.setAttribute('playsinline', '');
    this.video.setAttribute('autoplay', '');
    this.video.setAttribute('muted', '');
    this.overlay.appendChild(this.video);

    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'none';
    this.overlay.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

    const guide = document.createElement('div');
    guide.className = 'qr-scanner-guide';
    this.overlay.appendChild(guide);

    this.statusEl = document.createElement('div');
    this.statusEl.className = 'qr-scanner-status';
    this.statusEl.textContent = '馬券のQRコードにカメラを向けてください（1/2）';
    this.overlay.appendChild(this.statusEl);

    this.debugEl = document.createElement('div');
    this.debugEl.style.cssText =
      'position:absolute;top:50px;left:8px;right:8px;color:#0f0;font-size:11px;' +
      'font-family:monospace;background:rgba(0,0,0,0.6);padding:6px;border-radius:4px;' +
      'z-index:3;max-height:150px;overflow:auto;word-break:break-all;';
    this.debugEl.textContent = '初期化中...';
    this.overlay.appendChild(this.debugEl);

    document.body.appendChild(this.overlay);
  }

  static async _startCamera() {
    try {
      this._debug('カメラ起動中...');
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      this.video.srcObject = this.stream;

      await new Promise((resolve) => {
        this.video.onloadedmetadata = () => resolve();
      });
      await this.video.play();

      this._debug(`camera ready ${this.video.videoWidth}x${this.video.videoHeight}`);
      setTimeout(() => this._scanLoop(), 500);
    } catch (e) {
      console.error('カメラ起動失敗:', e);
      this._debug('カメラエラー: ' + e.message);
      this.statusEl.textContent = 'カメラを起動できません: ' + e.message;
    }
  }

  static _scanLoop() {
    if (!this.scanning) return;

    this.frameCount++;

    if (this.video.readyState >= this.video.HAVE_CURRENT_DATA) {
      const vw = this.video.videoWidth;
      const vh = this.video.videoHeight;

      if (vw > 0 && vh > 0) {
        try {
          const code = this._detectFromFrame(vw, vh);

          // デバッグ: ピクセル値+jsQR結果を1行で
          if (this.frameCount % 60 === 1) {
            const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
            const d = imageData.data;
            const sw = imageData.width;
            const sh = imageData.height;
            const mid = (Math.floor(sh / 2) * sw + Math.floor(sw / 2)) * 4;
            const black = d[0] === 0 && d[1] === 0 && d[2] === 0 &&
              d[mid] === 0 && d[mid + 1] === 0 && d[mid + 2] === 0;
            const dataLen = typeof code?.data === 'string' ? code.data.length : 0;
            const ret = code === null ? 'null'
              : code === undefined ? 'undef'
              : dataLen > 0 ? `found:${dataLen}ch`
              : 'found-empty';
            this._debug(
              `f:${this.frameCount} ${vw}→${sw}x${sh} black:${black} mid:${d[mid]},${d[mid+1]},${d[mid+2]} jsQR:${ret}`
            );
          }

          if (code && code.data) {
            this._debug(`検出! "${code.data.substring(0, 50)}..." (${code.data.length}文字)`);
            this._handleCode(code.data);
          }
        } catch (e) {
          this._debug('jsQRエラー: ' + e.message);
        }
      }
    }

    this.animFrame = requestAnimationFrame(() => this._scanLoop());
  }

  static _detectFromFrame(vw, vh) {
    for (const profile of this.scanProfiles) {
      const { maxDim, cropRatio } = profile;
      const scale = Math.min(1, maxDim / Math.max(vw, vh));
      const srcW = Math.floor(vw * cropRatio);
      const srcH = Math.floor(vh * cropRatio);
      const srcX = Math.floor((vw - srcW) / 2);
      const srcY = Math.floor((vh - srcH) / 2);
      const dstW = Math.max(1, Math.floor(srcW * scale));
      const dstH = Math.max(1, Math.floor(srcH * scale));

      this.canvas.width = dstW;
      this.canvas.height = dstH;
      this.ctx.imageSmoothingEnabled = false;
      this.ctx.drawImage(this.video, srcX, srcY, srcW, srcH, 0, 0, dstW, dstH);

      const imageData = this.ctx.getImageData(0, 0, dstW, dstH);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'attemptBoth',
      });
      if (code && typeof code.data === 'string' && code.data.length > 0) {
        return code;
      }
    }
    return null;
  }

  static _handleCode(data) {
    const cleaned = data.replace(/\D/g, '');

    if (cleaned.length !== 95) {
      this._debug(`桁数: ${cleaned.length} (95必要) raw:"${data.substring(0, 60)}"`);
      this.statusEl.textContent = `QR検出: ${cleaned.length}桁 (95桁必要)`;
      return;
    }

    if (this.scannedCodes.includes(cleaned)) return;

    this.scannedCodes.push(cleaned);
    this._debug(`QR${this.scannedCodes.length} OK: ${cleaned.substring(0, 30)}...`);

    if (this.scannedCodes.length === 1) {
      this.statusEl.textContent = '1つ目読取OK！もう1つのQRに向けてください（2/2）';
      this.statusEl.classList.add('qr-scanner-status--ok');
      this.overlay.classList.add('qr-scanner-overlay--flash');
      setTimeout(() => this.overlay.classList.remove('qr-scanner-overlay--flash'), 200);
    }

    if (this.scannedCodes.length >= 2) {
      this.statusEl.textContent = '読取完了！';
      const cb = this.onComplete;
      const codes = [...this.scannedCodes];
      setTimeout(() => {
        this.stop();
        if (cb) cb(codes[0], codes[1]);
      }, 500);
    }
  }

  static _debug(msg) {
    console.log('[QR]', msg);
    if (this.debugEl) {
      const time = new Date().toLocaleTimeString('ja', { hour12: false });
      this.debugEl.textContent = `${time} ${msg}`;
    }
  }
}
