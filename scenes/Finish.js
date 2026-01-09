// Finish.js — Finish + TOP50 (Google Sheets, JSONP). Viena scēna.

class Finish extends Phaser.Scene {
  constructor() {
    super('Finish');

    this.API_URL = 'https://script.google.com/macros/s/AKfycbyh6BcVY_CBPW9v7SNo1bNp_XttvhxpeSdYPfrTdRCD4KWXLeLvv-0S3p96PX0Dv5BnrA/exec';
    this.TOKEN = 'FIRE2025';

    this.result = { reason: 'exit', timeSec: null };

    // runtime
    this._top = [];
    this._scrollY = 0;
    this._scrollMax = 0;

    // reset per-run state (important for RESTART -> play again)
    this._saved = false;
    this.disableNameInput();

    // input (HTML element, not Phaser DOM)
    this._nameInput = null;
    this._nameInputEnabled = false;

    // Mobile keyboard resize lock (prevent canvas/layout shrink while typing)
    this._keyboardLock = false;
    this._lastScaleW = null;
    this._lastScaleH = null;

    // computed layout rects (game coords)
    this._entryRect = null;
    this._headerRect = null;
    this._bodyRect = null;

    this._qualifies = false;
    this._insertRank = null;
    this._pendingTimeSec = null;

    this._saved = false;
  }

  init(data) {
    const reason = data?.reason || 'exit';
    let timeSec = null;

    if (typeof data?.timeSec === 'number') timeSec = data.timeSec;
    else if (typeof data?.elapsedMs === 'number') timeSec = Math.floor(data.elapsedMs / 1000);

    this.result = { reason, timeSec };

    this._top = [];
    this._scrollY = 0;
    this._scrollMax = 0;

    this._qualifies = false;
    this._insertRank = null;
    this._pendingTimeSec = null;

    this.disableNameInput(); // remove old input, if any
  }

  preload() {
    if (!this.textures.exists('intro_bg')) {
      this.load.image('intro_bg', 'assets/img/intro.png');
    }
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    // BG
    const bg = this.add.image(W / 2, H / 2, 'intro_bg').setAlpha(0.12);
    const fitCover = () => {
      const iw = bg.width || 1;
      const ih = bg.height || 1;
      const s = Math.max(this.scale.width / iw, this.scale.height / ih);
      bg.setScale(s);
      bg.setPosition(this.scale.width / 2, this.scale.height / 2);
    };
    fitCover();
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.25);

    // Title + sub
    this._title = this.add.text(W / 2, 72,
      this.result.reason === 'success' ? 'MISIJA IR IZPILDĪTA!' : 'MISIJA NAV IZPILDĪTA!',
      { fontFamily: 'Arial', fontSize: '34px', color: '#ffffff', fontStyle: 'bold' }
    ).setOrigin(0.5);

    let sub = '';
    if (this.result.reason === 'success') sub = `Tavs laiks: ${this.formatTime(this.result.timeSec)}`;
    else if (this.result.reason === 'timeout') sub = 'Laiks beidzies (15:00)';
    else sub = 'Iziets no spēles';

    this._sub = this.add.text(W / 2, 110, sub,
      { fontFamily: 'Arial', fontSize: '18px', color: '#e7edf5', fontStyle: 'bold' }
    ).setOrigin(0.5);

    this._status = this.add.text(W / 2, 142, '',
      { fontFamily: 'Arial', fontSize: '16px', color: '#ffffff' }
    ).setOrigin(0.5);

    // containers
    this._ui = this.add.container(0, 0);
    this._tableCont = this.add.container(0, 0);

    // mask for scroll BODY
    this._maskGfx = this.add.graphics();
    this._mask = this._maskGfx.createGeometryMask();
    this._tableCont.setMask(this._mask);
    this._maskGfx.setVisible(false);

    // buttons
    this._btnExit = this.makeBigButton(0, 0, 'IZIET', 0x5a1e1e, 0x7a2a2a);
    this._btnSave = this.makeSmallButton(0, 0, 'Saglabāt', 0x1f3a52, 0x2a587c);
    this._btnSave.setEnabled(false);
    this._btnExit.onClick(() => {
      this.disableNameInput();
      try { window.open('', '_self'); window.close(); } catch (e) {}
      try { this.game.destroy(true); } catch (e) {}
      try { window.location.href = 'about:blank'; } catch (e) {}
    });

    this._btnSave.onClick(() => {
      if (!this._qualifies) return;
      if (this._saved) return;
      this.submitScore();
    });

    // input + scroll handlers
    this._dragging = false;
    this._lastY = 0;

    this.input.on('wheel', (p, gos, dx, dy) => this.scrollBy(dy));

    this.input.on('pointerdown', (p) => {
      if (!this._bodyRect) return;
      if (p.x >= this._bodyRect.x && p.x <= this._bodyRect.x + this._bodyRect.w &&
          p.y >= this._bodyRect.y && p.y <= this._bodyRect.y + this._bodyRect.h) {
        this._dragging = true;
        this._lastY = p.y;
      }
    });
    this.input.on('pointerup', () => this._dragging = false);
    this.input.on('pointerout', () => this._dragging = false);
    this.input.on('pointermove', (p) => {
      if (!this._dragging) return;
      const dy = this._lastY - p.y;
      this._lastY = p.y;
      this.scrollBy(dy);
    });

    // resize
    this.scale.on('resize', () => {
      const newW = this.scale.width;
      const newH = this.scale.height;

      // On some Android browsers the on-screen keyboard triggers a height-only resize.
      // We keep the layout stable while the name input is focused.
      if (this._keyboardLock && this._lastScaleW === newW && this._lastScaleH !== null && this._lastScaleH !== newH) {
        // still update input position in case the browser moved the visual viewport
        this.updateNameInputPosition();
        return;
      }

      this._lastScaleW = newW;
      this._lastScaleH = newH;

      fitCover();
      this.layout();
      this.updateNameInputPosition();
    });

    this.events.once('shutdown', () => {
      this.disableNameInput();
      this.scale.off('resize');
    });

    // initial layout + load
    this.layout();
    this._lastScaleW = this.scale.width;
    this._lastScaleH = this.scale.height;
    this.loadTop();
  }

  layout() {
    const W = this.scale.width;
    const H = this.scale.height;

    this._title.setPosition(W / 2, 72);
    this._sub.setPosition(W / 2, 110);
    this._status.setPosition(W / 2, 142);  // bottom button
    const btnY = H - 64;
    this._btnExit.setPosition(Math.round(W / 2), btnY);

    // panel area
    const panelW = Math.min(380, Math.max(300, W - 40));
    const panelX = Math.round((W - panelW) / 2);
    const panelTop = 168;
    const panelBottom = btnY - 48;
    const panelH = Math.max(170, panelBottom - panelTop);

    const entryH = this._qualifies ? 46 : 0;
    const headerH = 30;
    const bodyY = panelTop + entryH + headerH;
    const bodyH = Math.max(90, panelH - entryH - headerH);

    this._entryRect = { x: panelX, y: panelTop, w: panelW, h: entryH };
    this._headerRect = { x: panelX, y: panelTop + entryH, w: panelW, h: headerH };
    this._bodyRect = { x: panelX, y: bodyY, w: panelW, h: bodyH };

    // mask exactly on scroll body
    this._maskGfx.clear();
    this._maskGfx.fillStyle(0xffffff, 1);
    this._maskGfx.fillRect(this._bodyRect.x, this._bodyRect.y, this._bodyRect.w, this._bodyRect.h);

    // place SAVE button into entry row (right side)
    if (this._qualifies) {
      const saveX = this._entryRect.x + this._entryRect.w - 14 - (128 / 2);
      const saveY = this._entryRect.y + this._entryRect.h / 2;
      this._btnSave.setPosition(saveX, saveY);
      this._btnSave.setVisible(true);
    } else {
      this._btnSave.setVisible(false);
    }

    this.applyScroll();
  }

  
  async loadTop() {
    // Status: loading
    this._status.setColor('#ffffff');
    this._status.setText('Ielādē datus...');

    const base = `https://script.google.com/macros/s/AKfycbyh6BcVY_CBPW9v7SNo1bNp_XttvhxpeSdYPfrTdRCD4KWXLeLvv-0S3p96PX0Dv5BnrA/exec?action=top&token=${encodeURIComponent(this.TOKEN)}`;
    const attemptUrls = [
      base,
      base + `&_=${Date.now()}`
    ];

    let lastErr = null;

    for (let i = 0; i < attemptUrls.length; i++) {
      const url = attemptUrls[i];
      try {
        const top = await this.jsonp(url, 4500);
        if (!Array.isArray(top)) {
          const err = new Error('invalid');
          err.code = 'invalid';
          throw err;
        }

        // filter out invalid rows (e.g. 00:00 / empty) to avoid rank shift
        const clean = top.filter(r => {
          const t = Number(r && r.time);
          const name = (r && r.name != null) ? String(r.name).trim() : '';
          return Number.isFinite(t) && t > 0 && name.length > 0;
        }).map((r, idx) => ({ ...r, rank: idx + 1 }));

        this._top = clean;
        this._status.setText('');
        this._status.setColor('#ffffff');
        this.buildTable();
        return;
      } catch (e) {
        lastErr = e;
        // if first attempt fails, try once more (cache/proxy)
      }
    }

    // Failed after attempts -> show detailed status
    const code = (lastErr && lastErr.code) ? lastErr.code : 'invalid';

    this._top = [];
    this.buildTable();

    if (code === 'timeout') {
      this._status.setColor('#ffdddd');
      this._status.setText('Datu ielāde nokavēta...\nRezultātu ielāde aizkavējās vai tika bloķēta.');
    } else if (code === 'blocked') {
      this._status.setColor('#ffdddd');
      this._status.setText('Datu ielāde bloķēta\nPārlūks neļāva ielādēt rezultātus.');
    } else {
      this._status.setColor('#ffdddd');
      this._status.setText('Datu ielāde neizdevās\nServera atbilde bija nederīga.');
    }
  }


  buildTable() {
    // clear previous table ui
    this._tableCont.removeAll(true);
    if (this._headerBg) this._headerBg.destroy();
    if (this._headerTexts) this._headerTexts.forEach(t => t.destroy());
    this._headerTexts = [];

    const reason = this.result.reason;
    const timeSec = (typeof this.result.timeSec === 'number') ? this.result.timeSec : null;

    // compute qualifies (only for success + timeSec)
    let insertRank = null;
    let qualifies = false;

    if (reason === 'success' && typeof timeSec === 'number') {
      let r = 1;
      for (let i = 0; i < this._top.length; i++) {
        const t = Number(this._top[i]?.time);
        if (!Number.isFinite(t)) continue;
        if (timeSec > t) r++;
        else break;
      }
      insertRank = r;
      qualifies = (insertRank <= 50);
    }

    this._qualifies = qualifies;
    this._insertRank = qualifies ? insertRank : null;
    this._pendingTimeSec = qualifies ? timeSec : null;

    // status text for non-qualify
    if (reason === 'success' && typeof timeSec === 'number' && !qualifies) {
      this._status.setText('Tu netiki līdz TOP 50.');
      this._status.setColor('#ffffff');
    } else if (reason !== 'success') {
      this._status.setText('');
      this._status.setColor('#ffffff');
    }

    // re-layout now that qualifies may have changed
    this.layout();
    this.updateNameInputState();

    // header (fixed)
    const hr = this._headerRect;
    this._headerBg = this.add.rectangle(hr.x + hr.w / 2, hr.y + hr.h / 2, hr.w, hr.h, 0x1f3a52, 0.22);
    const hStyle = { fontFamily: 'Arial', fontSize: '16px', color: '#ffffff', fontStyle: 'bold' };
    const xRank = hr.x + 16;
    const xName = hr.x + 92;
    const xTime = hr.x + hr.w - 16;
    this._headerTexts.push(
      this.add.text(xRank, hr.y + 6, 'Vieta', hStyle).setOrigin(0, 0),
      this.add.text(xName, hr.y + 6, 'Vārds', hStyle).setOrigin(0, 0),
      this.add.text(xTime, hr.y + 6, 'Laiks', hStyle).setOrigin(1, 0)
    );

    // body rows (scroll)
    const br = this._bodyRect;
    const rowH = 34;
    const padL = 16;
    const rows = this._top.slice(0, 50);

    // scroll content height
    const contentH = rows.length * rowH;
    this._scrollMax = Math.max(0, contentH - br.h);
    this._scrollY = Phaser.Math.Clamp(this._scrollY, 0, this._scrollMax);

    // build rows at y=0.., container positioned in applyScroll()
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const y = i * rowH;
      const rank = Number(r.rank) || (i + 1);
      const name = (r.name || '').toString();
      const t = Number(r.time);

      const isCurrent = this._qualifies && (rank === this._insertRank);

      const fontSize = isCurrent ? '18px' : '16px';
      const weight = isCurrent ? 'bold' : 'normal';
      const alpha = isCurrent ? 1.0 : 0.92;

      // subtle highlight for current row
      if (isCurrent) {
        const hi = this.add.rectangle(br.x + br.w / 2, br.y + y + rowH / 2, br.w, rowH, 0xffffff, 0.08);
        this._tableCont.add(hi);
      }

      const txRank = this.add.text(br.x + padL, br.y + y + rowH / 2, String(rank),
        { fontFamily: 'Arial', fontSize, color: '#ffffff', fontStyle: weight }
      ).setOrigin(0, 0.5).setAlpha(alpha);

      const txName = this.add.text(br.x + 92, br.y + y + rowH / 2, name,
        { fontFamily: 'Arial', fontSize, color: '#ffffff', fontStyle: weight }
      ).setOrigin(0, 0.5).setAlpha(alpha);

      const txTime = this.add.text(br.x + br.w - padL, br.y + y + rowH / 2, this.formatTime(t),
        { fontFamily: 'Arial', fontSize, color: '#ffffff', fontStyle: weight }
      ).setOrigin(1, 0.5).setAlpha(alpha);

      this._tableCont.add([txRank, txName, txTime]);
    }

    this.applyScroll();
  }

  updateNameInputState() {
    // Only if qualifies and mission success
    const shouldHaveInput = this._qualifies && this.result.reason === 'success' && !this._saved;
    if (!shouldHaveInput) {
      this.disableNameInput();
      this._btnSave.setEnabled(false);
      return;
    }

    // enable SAVE only when there is input text
    this.enableNameInput();
    this._btnSave.setEnabled(true);
  }

  enableNameInput() {
    if (this._nameInput) {
      this.updateNameInputPosition();
      return;
    }

    // Create input in DOM (most stable for mobile keyboard)
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 28;
    input.autocomplete = 'off';
    input.autocapitalize = 'words';
    input.spellcheck = false;
    input.placeholder = 'Vārds';

    // Style: minimal, readable, transparent-ish
    input.style.position = 'absolute';
    input.style.zIndex = '9999';
    input.style.height = '36px';
    input.style.lineHeight = '36px';
    input.style.padding = '0 12px';
    input.style.borderRadius = '10px';
    input.style.border = '1px solid rgba(255,255,255,0.35)';
    input.style.background = 'rgba(0,0,0,0.20)';
    input.style.color = '#ffffff';
    input.style.fontSize = '18px';
    input.style.fontFamily = 'Arial, sans-serif';
    input.style.outline = 'none';
    input.style.boxSizing = 'border-box';
    input.style.pointerEvents = 'auto';

    // Name constraints
    input.maxLength = 20;
    input.setAttribute('maxlength', '20');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('autocapitalize', 'none');
    input.setAttribute('spellcheck', 'false');

    document.body.appendChild(input);
    this._nameInput = input;

    // Keep save button enabled state sensible
    input.addEventListener('input', this._onNameInput = () => {
      if (this._saved) return;

      // Enforce: max 20 symbols, no spaces
      const before = input.value;
      let v = before.replace(/\s+/g, '');
      if (v.length > 20) v = v.slice(0, 20);
      if (v !== before) input.value = v;

      const ok = v.length > 0;
      this._btnSave.setEnabled(ok);
    });
    // Keyboard focus: prevent layout resize jump on some Android browsers
    input.addEventListener('focus', () => {
      this._keyboardLock = true;
      this._lastScaleW = this.scale.width;
      this._lastScaleH = this.scale.height;
    });
    input.addEventListener('blur', () => {
      this._keyboardLock = false;
      this._lastScaleW = this.scale.width;
      this._lastScaleH = this.scale.height;
      // Re-layout once after keyboard closes
      this.layout();
      this.updateNameInputPosition();
    });


    // Initial enable state
    this._btnSave.setEnabled(false);

    this.updateNameInputPosition();
  }

  disableNameInput() {
    if (!this._nameInput) return;
    try {
      if (this._onNameInput) this._nameInput.removeEventListener('input', this._onNameInput);
    } catch (e) {}
    try {
      this._nameInput.blur();
      this._nameInput.disabled = true;
      this._nameInput.style.pointerEvents = 'none';
      this._nameInput.remove();
    } catch (e) {}
    this._nameInput = null;
    this._onNameInput = null;
  }

  updateNameInputPosition() {
    if (!this._nameInput || !this._entryRect) return;

    // entry row: input sits left of SAVE button
    const er = this._entryRect;

    // Compute screen coords from game coords using canvas bounds
    const bounds = this.scale.canvasBounds || this.scale.canvas.getBoundingClientRect();
    if (!bounds || !bounds.width || !bounds.height) return;
    const baseW = this.scale.gameSize.width || this.scale.width;
    const baseH = this.scale.gameSize.height || this.scale.height;
    const sx = bounds.width / baseW;
    const sy = bounds.height / baseH;

    // target input box in game coords
    const pad = 14;
    const rankW = 44;
    const inputX = er.x + pad + rankW; // after rank column
    const inputY = er.y + er.h / 2;
    const saveW = 118;
    const gap = 10;
    const inputW = Math.max(140, er.w - pad * 2 - rankW - saveW - gap); // rank + save + gap
    const inputH = 36;

    // convert to screen pixels
    const left = Math.round(bounds.left + inputX * sx);
    const top = Math.round(bounds.top + (inputY - inputH / 2) * sy);
    const width = Math.round(inputW * sx);
    const height = Math.round(inputH * sy);

    this._nameInput.style.left = `${left}px`;
    this._nameInput.style.top = `${top}px`;
    this._nameInput.style.width = `${width}px`;
    this._nameInput.style.height = `${height}px`;
  }

  scrollBy(dy) {
    if (!this._bodyRect) return;
    if (this._scrollMax <= 0) return;
    this._scrollY = Phaser.Math.Clamp(this._scrollY + dy, 0, this._scrollMax);
    this.applyScroll();
  }

  applyScroll() {
    // Table content is placed at br.y + y; easiest: shift container in y
    if (!this._bodyRect) return;
    this._tableCont.y = -this._scrollY;
  }

  async submitScore() {
    if (this._saved) return;
    const input = this._nameInput;
    if (!input) return;

    const name = input.value.trim().replace(/\s+/g, ' ').slice(0, 28);
    if (!name) {
      this._btnSave.setEnabled(false);
      return;
    }
    const timeSec = this._pendingTimeSec;
    if (!Number.isFinite(timeSec) || timeSec <= 0) return;

    // Lock UI
    this._btnSave.setEnabled(false);
    this._btnSave.setLabel('Saglabā...');
    input.disabled = true;

    const url =
      `${this.API_URL}?action=submit` +
      `&token=${encodeURIComponent(this.TOKEN)}` +
      `&name=${encodeURIComponent(name)}` +
      `&time=${encodeURIComponent(timeSec)}`;

    try {
      const res = await this.jsonp(url);
      if (res && res.ok) {
        this._saved = true;
        // Remove input after save (critical UX)
        this.disableNameInput();
        this._btnSave.setLabel('Saglabāts ✓');
        this._btnSave.setEnabled(false);

        // reload top so player appears
        await this.loadTop();
      } else {
        // allow retry
        input.disabled = false;
        this._btnSave.setLabel('Saglabāt');
        this._btnSave.setEnabled(true);
      }
    } catch (e) {
      input.disabled = false;
      this._btnSave.setLabel('Saglabāt');
      this._btnSave.setEnabled(true);
    } finally {
      this.updateNameInputPosition();
    }
  }

  jsonp(url, timeoutMs = 4500) {
    return new Promise((resolve, reject) => {
      const cbName = 'cb_' + Math.random().toString(16).slice(2);
      let settled = false;

      const cleanup = (script) => {
        try { delete window[cbName]; } catch (e) {}
        try { script && script.remove && script.remove(); } catch (e) {}
      };

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup(script);
        const err = new Error('timeout');
        err.code = 'timeout';
        reject(err);
      }, timeoutMs);

      window[cbName] = (data) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        cleanup(script);
        resolve(data);
      };

      const script = document.createElement('script');
      script.onerror = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        cleanup(script);
        const err = new Error('blocked');
        err.code = 'blocked';
        reject(err);
      };

      script.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + cbName;
      document.body.appendChild(script);
    });
  }


  formatTime(sec) {
    if (!Number.isFinite(sec) || sec == null) return '--:--';
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(r).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  makeSmallButton(cx, cy, label, baseColor, pressColor) {
    const btnW = 128;
    const btnH = 40;

    const bg = this.add.rectangle(cx, cy, btnW, btnH, baseColor, 1);
    const t = this.add.text(cx, cy, label, {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    const setEnabled = (enabled) => {
      if (enabled) bg.setInteractive({ useHandCursor: true });
      else bg.disableInteractive();
      bg.setAlpha(enabled ? 1 : 0.45);
      t.setAlpha(enabled ? 1 : 0.75);
    };

    const setLabel = (txt) => t.setText(txt);

    const pressIn = () => bg.setFillStyle(pressColor, 1);
    const pressOut = () => bg.setFillStyle(baseColor, 1);

    bg.on('pointerdown', pressIn);
    bg.on('pointerup', pressOut);
    bg.on('pointerout', pressOut);
    bg.on('pointercancel', pressOut);

    let onClick = () => {};
    bg.on('pointerup', () => onClick());

    return {
      setPosition: (x, y) => { bg.setPosition(x, y); t.setPosition(x, y); },
      setVisible: (v) => { bg.setVisible(v); t.setVisible(v); },
      setEnabled,
      setLabel,
      onClick: (fn) => { onClick = fn; }
    };
  }

  makeBigButton(cx, cy, label, baseColor, pressColor) {
    const btnW = 200;
    const btnH = 58;

    const bg = this.add.rectangle(cx, cy, btnW, btnH, baseColor, 1).setInteractive({ useHandCursor: true });
    const t = this.add.text(cx, cy, label, {
      fontFamily: 'Arial',
      fontSize: '22px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    const pressIn = () => {
      bg.setFillStyle(pressColor, 1);
      this.tweens.killTweensOf([bg, t]);
      this.tweens.add({ targets: [bg, t], scaleX: 0.96, scaleY: 0.96, duration: 70 });
    };
    const pressOut = () => {
      bg.setFillStyle(baseColor, 1);
      this.tweens.killTweensOf([bg, t]);
      this.tweens.add({ targets: [bg, t], scaleX: 1.0, scaleY: 1.0, duration: 90 });
    };

    bg.on('pointerdown', pressIn);
    bg.on('pointerup', pressOut);
    bg.on('pointerout', pressOut);
    bg.on('pointercancel', pressOut);

    let onClick = () => {};
    bg.on('pointerup', () => onClick());

    return {
      setPosition: (x, y) => { bg.setPosition(x, y); t.setPosition(x, y); },
      onClick: (fn) => { onClick = fn; }
    };
  }
}

window.Finish = Finish;