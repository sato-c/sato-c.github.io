/**
 * QRScanService - カメラでJRA馬券のQR(95桁x2)を読む
 *
 * 設計方針:
 * - まず95桁かどうかを判定
 * - 95桁を「前半(ヘッダーあり) / 後半(フィラー寄り) / 不明」に分類
 * - 同じ側(front+front, back+back)は2枚目として受け付けない
 * - 2枚揃ったらそのままコールバックへ渡す（順序最終判定は上位で実施）
 */

export class QRScanService {
  static overlay = null;
  static video = null;
  static canvas = null;
  static ctx = null;
  static stream = null;
  static scanning = false;
  static onComplete = null;
  static onStop = null;
  static stopNotified = false;
  static animFrame = null;
  static statusEl = null;
  static debugEl = null;

  static frameCount = 0;
  static scanBusy = false;
  static barcodeDetector = null;
  static debugHistory = [];

  static firstHalf = null;  // { code, role, meta }
  static secondHalf = null; // { code, role, meta }

  static scanProfiles = [
    { maxDim: 1280, cropRatio: 1.0 },
    { maxDim: 960, cropRatio: 1.0 },
    { maxDim: 960, cropRatio: 0.8 },
    { maxDim: 640, cropRatio: 1.0 },
  ];

  static start(callback, options = {}) {
    if (typeof jsQR === 'undefined') {
      throw new Error('jsQRライブラリが読み込まれていません');
    }

    this.onComplete = callback;
    this.onStop = typeof options.onStop === 'function' ? options.onStop : null;
    this.stopNotified = false;
    this.debugHistory = [];
    this.firstHalf = null;
    this.secondHalf = null;
    this.scanning = true;
    this.frameCount = 0;
    this.scanBusy = false;

    this._createUI();
    this._startCamera();
  }

  static stop(reason = 'cancelled') {
    this._notifyStop(reason);
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
    closeBtn.addEventListener('click', () => this.stop('cancelled'));
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
    this.statusEl.textContent = '馬券のQRコードを読んでください（1/2）';
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
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      this.video.srcObject = this.stream;

      await new Promise((resolve) => {
        this.video.onloadedmetadata = () => resolve();
      });
      await this.video.play();
      await this._initNativeDetector();

      this._debug(`camera ready ${this.video.videoWidth}x${this.video.videoHeight}`);
      setTimeout(() => this._scanLoop(), 400);
    } catch (e) {
      this._debug('カメラエラー: ' + e.message);
      this.statusEl.textContent = 'カメラを起動できません: ' + e.message;
    }
  }

  static async _scanLoop() {
    if (!this.scanning) return;
    if (this.scanBusy) {
      this.animFrame = requestAnimationFrame(() => this._scanLoop());
      return;
    }
    this.scanBusy = true;
    this.frameCount++;

    try {
      if (this.video.readyState >= this.video.HAVE_CURRENT_DATA) {
        const vw = this.video.videoWidth;
        const vh = this.video.videoHeight;
        if (vw > 0 && vh > 0) {
          const found = await this._detectFromFrame(vw, vh);

          if (this.frameCount % 60 === 1 && this.canvas.width > 0 && this.canvas.height > 0) {
            const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
            const sw = imageData.width;
            const sh = imageData.height;
            const dataLen = typeof found?.text === 'string' ? found.text.length : 0;
            const ret = found ? `found:${dataLen}ch(${found.engine})` : 'null';
            this._debug(`f:${this.frameCount} ${vw}→${sw}x${sh} qr:${ret}`);
          }

          if (found?.text) {
            const profileLabel = `${found.profile.maxDim}/${found.profile.cropRatio}`;
            this._debug(`検出(${found.engine}, ${profileLabel}) "${found.text.substring(0, 45)}..."`);
            this._acceptDetection(found.text, found);
          }
        }
      }
    } catch (e) {
      this._debug('QR検出エラー: ' + e.message);
    } finally {
      this.scanBusy = false;
    }

    this.animFrame = requestAnimationFrame(() => this._scanLoop());
  }

  static async _detectFromFrame(vw, vh) {
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

      const nativeDecoded = await this._detectWithNative(this.canvas);
      if (nativeDecoded) return { text: nativeDecoded, engine: 'native', profile };

      const imageData = this.ctx.getImageData(0, 0, dstW, dstH);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'attemptBoth',
      });
      if (code && typeof code.data === 'string' && code.data.length > 0) {
        return { text: code.data, engine: 'jsQR', profile };
      }
    }
    return null;
  }

  static async _initNativeDetector() {
    this.barcodeDetector = null;
    if (!('BarcodeDetector' in window)) return;
    try {
      const formats = await window.BarcodeDetector.getSupportedFormats();
      if (!formats.includes('qr_code')) return;
      this.barcodeDetector = new window.BarcodeDetector({ formats: ['qr_code'] });
      this._debug('native QR detector: enabled');
    } catch (e) {
      this._debug('native QR detector unavailable: ' + e.message);
    }
  }

  static async _detectWithNative(source) {
    if (!this.barcodeDetector) return null;
    try {
      const barcodes = await this.barcodeDetector.detect(source);
      if (!barcodes || barcodes.length === 0) return null;
      const value = barcodes[0]?.rawValue;
      if (typeof value === 'string' && value.length > 0) return value;
    } catch (e) {
      if (this.frameCount % 120 === 1) this._debug('native detect error: ' + e.message);
    }
    return null;
  }

  static _acceptDetection(rawText, meta) {
    const cleaned = rawText.replace(/\D/g, '');
    if (cleaned.length !== 95) return;

    if (this.firstHalf?.code === cleaned || this.secondHalf?.code === cleaned) return;
    if (this._looksLikeNoise(cleaned)) {
      this._debug('除外: 連番ノイズ疑い');
      return;
    }

    const h = this._splitHeader14(cleaned);
    this._debug(
      `hdr 1:${h.d1} 2-3:${h.d23} 4-6:${h.d456} 7-8:${h.d78} 9-10:${h.d910} 11-12:${h.d1112} 13-14:${h.d1314}`
    );
    const venueName = this._venueName(h.d23);
    if (venueName) {
      this._debug(`hdr venue:${venueName} yy:${h.d78} kai:${h.d910} day:${h.d1112} race:${h.d1314}`);
    }

    const role = this._classifyHalf(cleaned);
    this._debug(`候補 role=${role.label} hdr=${role.headerScore} tail=${role.tailSeqRun}`);

    if (!this.firstHalf) {
      this.firstHalf = { code: cleaned, role, meta };
      this.statusEl.textContent = `1つ目読取OK（${role.label}）。もう片方を読んでください（2/2）`;
      this.overlay.classList.add('qr-scanner-overlay--flash');
      setTimeout(() => this.overlay?.classList.remove('qr-scanner-overlay--flash'), 160);
      return;
    }

    const firstRole = this.firstHalf.role.label;
    const secondRole = role.label;

    if (firstRole !== 'unknown' && secondRole !== 'unknown' && firstRole === secondRole) {
      this._debug(`除外: 同じ側 ${firstRole}+${secondRole}`);
      this.statusEl.textContent = '同じ側のQRです。もう片方のQRを読んでください（2/2）';
      return;
    }

    this.secondHalf = { code: cleaned, role, meta };
    this._debug(`確定: role1=${firstRole} role2=${secondRole}`);
    this.statusEl.textContent = '読取完了！';

    const sources = [this.firstHalf.meta, this.secondHalf.meta];
    const roles = [this.firstHalf.role, this.secondHalf.role];
    const history = [...this.debugHistory];
    const cb = this.onComplete;
    const code1 = this.firstHalf.code;
    const code2 = this.secondHalf.code;

    setTimeout(() => {
      this.stop('completed');
      if (cb) cb(code1, code2, { sources, roles, history });
    }, 380);
  }

  static _classifyHalf(digits95) {
    const format = parseInt(digits95[0], 10);
    const venue = parseInt(digits95.substring(1, 3), 10);
    const year = parseInt(digits95.substring(6, 8), 10);
    const kai = parseInt(digits95.substring(8, 10), 10);
    const nichi = parseInt(digits95.substring(10, 12), 10);
    const race = parseInt(digits95.substring(12, 14), 10);
    const ticketType = parseInt(digits95[14], 10);
    const tailSeqRun = this._tailSequentialRun(digits95);

    let headerScore = 0;
    if (format >= 1 && format <= 5) headerScore += 2;
    if (venue >= 1 && venue <= 10) headerScore += 4;
    if (year >= 0 && year <= 99) headerScore += 1;
    if (kai >= 1 && kai <= 12) headerScore += 1;
    if (nichi >= 1 && nichi <= 12) headerScore += 1;
    if (race >= 1 && race <= 12) headerScore += 2;
    if (ticketType >= 0 && ticketType <= 5) headerScore += 2;

    let label = 'unknown';
    if (headerScore >= 10) label = 'front';
    else if (headerScore <= 5 && tailSeqRun >= 16) label = 'back';

    return { label, headerScore, tailSeqRun, venue, year, kai, nichi, race, ticketType };
  }

  static _looksLikeNoise(digits95) {
    const seqRatio = this._sequentialStepRatio(digits95);
    const tailRun = this._tailSequentialRun(digits95);
    const leadingZeros = this._leadingCharRun(digits95, '0');
    if (seqRatio >= 0.70) return true;
    if (tailRun >= 75) return true;
    if (leadingZeros >= 6 && seqRatio >= 0.55) return true;
    return false;
  }

  static _sequentialStepRatio(digits) {
    if (!digits || digits.length < 2) return 0;
    let hit = 0;
    for (let i = 1; i < digits.length; i++) {
      const prev = digits.charCodeAt(i - 1) - 48;
      const curr = digits.charCodeAt(i) - 48;
      if (((prev + 1) % 10) === curr) hit++;
    }
    return hit / (digits.length - 1);
  }

  static _tailSequentialRun(digits) {
    if (!digits || digits.length < 2) return 0;
    let run = 1;
    for (let i = digits.length - 1; i > 0; i--) {
      const prev = digits.charCodeAt(i - 1) - 48;
      const curr = digits.charCodeAt(i) - 48;
      if (((prev + 1) % 10) === curr) run++;
      else break;
    }
    return run;
  }

  static _leadingCharRun(str, ch) {
    let n = 0;
    for (let i = 0; i < str.length; i++) {
      if (str[i] !== ch) break;
      n++;
    }
    return n;
  }

  static _splitHeader14(digits95) {
    const s = digits95;
    return {
      d1: s.substring(0, 1),
      d23: s.substring(1, 3),
      d456: s.substring(3, 6),
      d78: s.substring(6, 8),
      d910: s.substring(8, 10),
      d1112: s.substring(10, 12),
      d1314: s.substring(12, 14),
    };
  }

  static _venueName(code2) {
    const map = {
      '01': '札幌',
      '02': '函館',
      '03': '福島',
      '04': '新潟',
      '05': '東京',
      '06': '中山',
      '07': '中京',
      '08': '京都',
      '09': '阪神',
      '10': '小倉',
    };
    return map[code2] || null;
  }

  static _debug(msg) {
    console.log('[QR]', msg);
    const line = `${new Date().toLocaleTimeString('ja', { hour12: false })} ${msg}`;
    this.debugHistory.push(line);
    if (this.debugHistory.length > 200) this.debugHistory.shift();
    if (this.debugEl) this.debugEl.textContent = line;
  }

  static _notifyStop(reason) {
    if (this.stopNotified) return;
    this.stopNotified = true;
    if (!this.onStop) return;

    const report = {
      reason,
      firstRole: this.firstHalf?.role?.label || null,
      secondRole: this.secondHalf?.role?.label || null,
      history: [...this.debugHistory],
      firstCodeHead: this.firstHalf?.code?.substring(0, 24) || null,
      secondCodeHead: this.secondHalf?.code?.substring(0, 24) || null,
    };
    try {
      this.onStop(report);
    } catch (e) {
      // no-op
    }
  }
}
