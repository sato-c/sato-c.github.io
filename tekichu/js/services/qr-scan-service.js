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
  static lastDetect = '';

  /**
   * スキャン開始。2つのQRを読み取ったらコールバック
   * @param {Function} callback - (code1, code2) => void
   */
  static start(callback) {
    if (typeof jsQR === 'undefined') {
      throw new Error('jsQRライブラリが読み込まれていません');
    }

    this.onComplete = callback;
    this.scannedCodes = [];
    this.scanning = true;
    this.frameCount = 0;
    this.lastDetect = '';
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

    // ヘッダー
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

    // ビデオ
    this.video = document.createElement('video');
    this.video.className = 'qr-scanner-video';
    this.video.setAttribute('playsinline', '');
    this.video.setAttribute('autoplay', '');
    this.video.setAttribute('muted', '');
    this.overlay.appendChild(this.video);

    // Canvas（非表示、解析用）
    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'none';
    this.overlay.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

    // ガイド枠
    const guide = document.createElement('div');
    guide.className = 'qr-scanner-guide';
    this.overlay.appendChild(guide);

    // ステータス表示
    this.statusEl = document.createElement('div');
    this.statusEl.className = 'qr-scanner-status';
    this.statusEl.textContent = '馬券のQRコードにカメラを向けてください（1/2）';
    this.overlay.appendChild(this.statusEl);

    // デバッグ表示（開発中のみ、後で消す）
    this.debugEl = document.createElement('div');
    this.debugEl.style.cssText =
      'position:absolute;top:50px;left:8px;right:8px;color:#0f0;font-size:11px;' +
      'font-family:monospace;background:rgba(0,0,0,0.6);padding:6px;border-radius:4px;' +
      'z-index:3;max-height:120px;overflow:auto;word-break:break-all;';
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

      // videoが再生可能になるまで待つ
      await new Promise((resolve) => {
        this.video.onloadedmetadata = () => {
          resolve();
        };
      });
      await this.video.play();

      this._debug(`カメラOK: ${this.video.videoWidth}x${this.video.videoHeight}`);

      // 少し待ってからスキャン開始
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
        this.canvas.width = vw;
        this.canvas.height = vh;
        this.ctx.drawImage(this.video, 0, 0, vw, vh);

        const imageData = this.ctx.getImageData(0, 0, vw, vh);

        try {
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'attemptBoth',
          });

          if (code && code.data) {
            this._debug(`検出: "${code.data.substring(0, 40)}..." (${code.data.length}文字)`);
            this._handleCode(code.data);
          }
        } catch (e) {
          this._debug('jsQRエラー: ' + e.message);
        }
      }

      // 30フレームごとにデバッグ更新
      if (this.frameCount % 30 === 0) {
        this._debug(`スキャン中... frame:${this.frameCount} video:${vw}x${vh} ready:${this.video.readyState} codes:${this.scannedCodes.length}`);
      }
    } else if (this.frameCount % 60 === 0) {
      this._debug(`ビデオ待機中... readyState:${this.video.readyState}`);
    }

    this.animFrame = requestAnimationFrame(() => this._scanLoop());
  }

  static _handleCode(data) {
    // まず生データを記録
    this.lastDetect = data;

    // 数字のみ抽出
    const cleaned = data.replace(/\D/g, '');

    // 95桁チェック
    if (cleaned.length !== 95) {
      this._debug(`桁数不一致: ${cleaned.length}桁 (95桁必要) raw:${data.substring(0, 50)}`);
      // 95桁でなくてもステータスに反映（デバッグ用）
      this.statusEl.textContent = `QR検出: ${cleaned.length}桁 (95桁必要)`;
      return;
    }

    // 既に同じコードを読んでいたら無視
    if (this.scannedCodes.includes(cleaned)) return;

    this.scannedCodes.push(cleaned);
    this._debug(`QR${this.scannedCodes.length}読取OK: ${cleaned.substring(0, 30)}...`);

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
      this.debugEl.textContent = msg;
    }
  }
}
