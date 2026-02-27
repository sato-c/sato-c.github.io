/**
 * QRScanService - カメラでQRコードを読み取る
 * jsQR（CDN）を使用
 */

import { TicketParserService } from './ticket-parser-service.js';

export class QRScanService {
  static overlay = null;
  static video = null;
  static canvas = null;
  static ctx = null;
  static stream = null;
  static scanning = false;
  static scannedCodes = [];
  static scannedMeta = [];
  static onComplete = null;
  static animFrame = null;
  static statusEl = null;
  static debugEl = null;
  static debugHistory = [];
  static frameCount = 0;
  static scanBusy = false;
  static barcodeDetector = null;
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
    this.scannedMeta = [];
    this.debugHistory = [];
    this.scanning = true;
    this.frameCount = 0;
    this.scanBusy = false;
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
      await this._initNativeDetector();

      this._debug(`camera ready ${this.video.videoWidth}x${this.video.videoHeight}`);
      setTimeout(() => this._scanLoop(), 500);
    } catch (e) {
      console.error('カメラ起動失敗:', e);
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

          // デバッグ: ピクセル値+検出結果を1行で
          if (this.frameCount % 60 === 1 && this.canvas.width > 0 && this.canvas.height > 0) {
            const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
            const d = imageData.data;
            const sw = imageData.width;
            const sh = imageData.height;
            const mid = (Math.floor(sh / 2) * sw + Math.floor(sw / 2)) * 4;
            const black = d[0] === 0 && d[1] === 0 && d[2] === 0 &&
              d[mid] === 0 && d[mid + 1] === 0 && d[mid + 2] === 0;
            const dataLen = typeof found?.text === 'string' ? found.text.length : 0;
            const ret = found ? `found:${dataLen}ch(${found.engine})` : 'null';
            this._debug(
              `f:${this.frameCount} ${vw}→${sw}x${sh} black:${black} mid:${d[mid]},${d[mid+1]},${d[mid+2]} qr:${ret}`
            );
          }

          if (found?.text) {
            const profileLabel = `${found.profile.maxDim}/${found.profile.cropRatio}`;
            this._debug(`検出(${found.engine}, ${profileLabel}) "${found.text.substring(0, 50)}..." (${found.text.length}文字)`);
            this._handleCode(found.text, found);
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
      if (nativeDecoded) {
        return { text: nativeDecoded, engine: 'native', profile };
      }

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
      if (typeof value === 'string' && value.length > 0) {
        return value;
      }
    } catch (e) {
      if (this.frameCount % 120 === 1) {
        this._debug('native detect error: ' + e.message);
      }
    }
    return null;
  }

  static _handleCode(data, meta = null) {
    const cleaned = data.replace(/\D/g, '');

    if (cleaned.length !== 95) {
      this._debug(`桁数: ${cleaned.length} (95必要) raw:"${data.substring(0, 60)}"`);
      this.statusEl.textContent = `QR検出: ${cleaned.length}桁 (95桁必要)`;
      return;
    }

    if (!this._isLikelyTicketHalf(cleaned)) {
      const seqRatio = this._sequentialStepRatio(cleaned).toFixed(2);
      const tailRun = this._tailSequentialRun(cleaned);
      this._debug(`偽陽性除外: seqRatio=${seqRatio} tailRun=${tailRun} raw:"${cleaned.substring(0, 30)}..."`);
      this.statusEl.textContent = 'QR検出: データ形式が不自然なため再読取してください';
      return;
    }

    if (this.scannedCodes.includes(cleaned)) return;

    // 2枚目読取時は、1枚目との組み合わせ妥当性を事前検証して誤混入を防ぐ
    if (this.scannedCodes.length === 1) {
      const pairCheck = this._evaluatePair(this.scannedCodes[0], cleaned);
      if (!pairCheck.ok) {
        this._debug(`2枚目候補を除外: ${pairCheck.reason} score:${pairCheck.score}`);
        this.statusEl.textContent = '2つ目のQRが不正の可能性。別角度で同じ馬券のQRを再読取してください（2/2）';
        return;
      }
      this._debug(`2枚目候補OK: order=${pairCheck.order} score=${pairCheck.score}`);
    }

    this.scannedCodes.push(cleaned);
    this.scannedMeta.push(meta || { engine: 'unknown', profile: null });
    this._debug(`QR${this.scannedCodes.length} OK(${meta?.engine || 'unknown'}): ${cleaned.substring(0, 30)}...`);

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
      const metaList = [...this.scannedMeta];
      const history = [...this.debugHistory];
      setTimeout(() => {
        this.stop();
        if (cb) cb(codes[0], codes[1], { sources: metaList, history });
      }, 500);
    }
  }

  static _debug(msg) {
    console.log('[QR]', msg);
    const time = new Date().toLocaleTimeString('ja', { hour12: false });
    const line = `${time} ${msg}`;
    this.debugHistory.push(line);
    if (this.debugHistory.length > 200) {
      this.debugHistory.shift();
    }
    if (this.debugEl) {
      this.debugEl.textContent = line;
    }
  }

  static _evaluatePair(a, b) {
    const candidates = [
      { combined: a + b, order: '1->2' },
      { combined: b + a, order: '2->1' },
    ];
    let best = {
      ok: false,
      score: -Infinity,
      order: null,
      reason: 'no-candidate',
      headerScore: -Infinity,
      parseScore: -Infinity,
      betCount: 0,
    };

    for (const c of candidates) {
      try {
        const headerScore = TicketParserService._scoreCombinedDigits
          ? TicketParserService._scoreCombinedDigits(c.combined)
          : 0;
        const parsed = TicketParserService.parse(c.combined);
        const parseScore = Number.isFinite(parsed.parseScore) ? parsed.parseScore : -1000;
        const betCount = Array.isArray(parsed.bets) ? parsed.bets.length : 0;
        const score = headerScore * 20 + parseScore + betCount * 30;

        if (score > best.score) {
          best = { ok: false, score, order: c.order, reason: 'low-score', headerScore, parseScore, betCount };
        }
      } catch (e) {
        // ignore invalid candidate
      }
    }

    // 厳しすぎるブロックを避ける:
    // ヘッダーが十分妥当なら許可（単勝など取りこぼし対策）
    if (best.headerScore >= 10) {
      best.ok = true;
      best.reason = 'header-ok';
      return best;
    }

    // ヘッダーが弱い場合のみ、解析スコアで判定
    if (best.parseScore >= -150 || best.betCount > 0 || best.score >= -50) {
      best.ok = true;
      best.reason = 'score-ok';
    }
    return best;
  }

  // 95桁は満たしていても、連番パターン中心の誤検出を除外する
  static _isLikelyTicketHalf(digits95) {
    const seqRatio = this._sequentialStepRatio(digits95);
    const tailRun = this._tailSequentialRun(digits95);
    const headRun = this._headSequentialRun(digits95);
    const leadingZeros = this._leadingCharRun(digits95, '0');

    // 例: 000000040567890123... のような連番偽陽性だけを強めに除外
    // 正規フォーメーションを巻き込みにくいよう、複数条件の同時成立を要求する
    if (seqRatio >= 0.62) return false;
    if (tailRun >= 70) return false;
    if (leadingZeros >= 5 && headRun >= 18 && seqRatio >= 0.48) return false;
    return true;
  }

  // 隣接桁が +1(mod10) でつながる割合
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

  // 末尾側の連番ラン長（...67890123 のような伸び）
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

  // 先頭側の連番ラン長
  static _headSequentialRun(digits) {
    if (!digits || digits.length < 2) return 0;
    let run = 1;
    for (let i = 1; i < digits.length; i++) {
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
}
