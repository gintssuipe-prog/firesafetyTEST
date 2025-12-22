// Finish.js — finišs (MainMenu stilā) + TOP-50 (Google Sheets, JSONP) + token
class Finish extends Phaser.Scene {
  constructor() {
    super("Finish");
    this.API_URL = "https://script.google.com/macros/s/AKfycbyh6BcVY_CBPW9v7SNo1bNp_XttvhxpeSdYPfrTdRCD4KWXLeLvv-0S3p96PX0Dv5BnrA/exec";
    this.TOKEN = "FIRE2025";

    this.result = { reason: "exit", timeSec: null };
    this._domNodes = [];
    this._scroll = { y: 0, max: 0 };
    this._hasEntryRow = false;
    this._canSave = false;
    this._insertRank = null;
    this._pendingTimeSec = null;
    this._nameInputEl = null;
    this._entryGfx = null;
    this._entryTexts = [];
  }

  init(data) {
    // Saņemam no Stage1: { reason, timeSec } vai { reason, elapsedMs }
    const reason = data?.reason || "exit";

    let timeSec = null;
    if (typeof data?.timeSec === "number") timeSec = data.timeSec;
    else if (typeof data?.elapsedMs === "number") timeSec = Math.floor(data.elapsedMs / 1000);

    this.result = { reason, timeSec };
    this._scroll = { y: 0, max: 0 };
    this._hasEntryRow = false;
    this._canSave = false;
    this._insertRank = null;
    this._pendingTimeSec = null;
    this._nameInputEl = null;
    this._entryGfx = null;
    this._entryTexts = [];
    this._nameEntryAdded = false;
    this.cleanupDom();
  }

  preload() {
    if (!this.textures.exists("intro_bg")) {
      this.load.image("intro_bg", "assets/img/intro.png");
    }
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    // fons (kā MainMenu)
    const bg = this.add.image(0, 0, "intro_bg").setOrigin(0.5);
    bg.setAlpha(0.12);

    const fitCover = () => {
      const iw = bg.width || 1;
      const ih = bg.height || 1;
      const scale = Math.max(W / iw, H / ih);
      bg.setScale(scale);
      bg.setPosition(W / 2, H / 2);
    };
    fitCover();

    // tumšs overlay
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.25);

    // virsraksts + laiks
    const reason = this.result?.reason || "exit";
    const timeSec = typeof this.result?.timeSec === "number" ? this.result.timeSec : null;

    const titleText = reason === "success" ? "MISIJA IR IZPILDĪTA!" : "MISIJA NAV IZPILDĪTA!";
    this._title = this.add.text(W / 2, 74, titleText, {
      fontFamily: "Arial",
      fontSize: "34px",
      color: "#ffffff",
      fontStyle: "bold"
    }).setOrigin(0.5);

    let sub = "";
    if (reason === "success") sub = `TAVS LAIKS: ${this.formatTime(timeSec)}`;
    else if (reason === "timeout") sub = `LAIKS BEIDZIES (15:00)`;
    else sub = `IZIETS NO SPĒLES`;

    this._sub = this.add.text(W / 2, 112, sub, {
      fontFamily: "Arial",
      fontSize: "18px",
      color: "#e7edf5",
      fontStyle: "bold"
    }).setOrigin(0.5);

    this._topTitle = this.add.text(W / 2, 152, "TOP 50", {
      fontFamily: "Arial",
      fontSize: "22px",
      color: "#ffffff",
      fontStyle: "bold"
    }).setOrigin(0.5);

    this._statusText = this.add.text(W / 2, 180, "", {
      fontFamily: "Arial",
      fontSize: "16px",
      color: "#ffffff"
    }).setOrigin(0.5);

    // Tabulas viewport (scroll)
    this._panel = this.add.container(0, 0);

    this._tableMaskGfx = this.add.graphics();
    this._tableMask = this._tableMaskGfx.createGeometryMask();

    this._tableCont = this.add.container(0, 0);
    this._tableCont.setMask(this._tableMask);

    // pogas apakšā (MainMenu stilā)
    this._btnRestart = this.makeBigButton(0, 0, "RESTART", 0x1f4a2c, 0x2a6a3b);
    this._btnExit = this.makeBigButton(0, 0, "IZIET", 0x5a1e1e, 0x7a2a2a);

    // SAVE (rādām tikai, ja spēlētājs kvalificējas TOP50 un misija izpildīta)
    this._btnSave = this.makeBigButton(0, 0, "SAGLABĀT", 0x1f3a52, 0x2a587c);
    this._btnSave.bg.setVisible(false);
    this._btnSave.t.setVisible(false);
    this._btnSave.bg.disableInteractive();

    this._btnSave.bg.on("pointerup", () => {
      if (!this._canSave) return;
      this.submitScoreFromInput();
    });


    this._btnRestart.bg.on("pointerup", () => {
      this.cleanupDom();
      this.scene.start("MainMenu"); // atpakaļ uz intro/noteikumiem
    });

    this._btnExit.bg.on("pointerup", () => {
      this.cleanupDom();
      try { window.open("", "_self"); window.close(); } catch (e) {}
      try { this.game.destroy(true); } catch (e) {}
      try { window.location.href = "about:blank"; } catch (e) {}
    });

    // scroll ar peli / touch
    this.input.on("wheel", (pointer, gameObjects, dx, dy) => {
      this.scrollBy(dy);
    });

    let dragging = false;
    let lastY = 0;
    this.input.on("pointerdown", (p) => {
      // aktivizējam scroll tikai tabulas zonā
      if (!this._tableRect) return;
      if (p.y >= this._tableRect.y && p.y <= this._tableRect.y + this._tableRect.h) {
        dragging = true;
        lastY = p.y;
      }
    });
    this.input.on("pointerup", () => dragging = false);
    this.input.on("pointerout", () => dragging = false);
    this.input.on("pointermove", (p) => {
      if (!dragging) return;
      const dy = lastY - p.y;
      lastY = p.y;
      this.scrollBy(dy);
    });

    // resize layout
    this.scale.on("resize", () => this.layout());
    this.layout();

    // ielādē TOP
    this.loadTopAndRender();

    this.events.once("shutdown", () => {
      try { this.cleanupDom(); } catch(e) {}
      try { if (this._entryGfx) this._entryGfx.destroy(); } catch(e) {}
      try { for (const t of (this._entryTexts||[])) t.destroy(); } catch(e) {}
      this._entryTexts = [];
    });
  }


  drawEntryRow() {
    // notīram iepriekšējo
    if (this._entryGfx) { try { this._entryGfx.destroy(); } catch(e) {} }
    for (const t of (this._entryTexts || [])) { try { t.destroy(); } catch(e) {} }
    this._entryTexts = [];

    if (!this._hasEntryRow || !this._tableRect) {
      // paslēpjam SAVE
      if (this._btnSave) {
        this._btnSave.bg.setVisible(false);
    this._btnSave.t.setVisible(false);
        this._btnSave.bg.disableInteractive();
      }
      this.cleanupDom();
      return;
    }

    const rect = this._tableRect;
    const entryY = 200 + 28; // fiksēta josla zem statusa
    const rowH = 36;

    // kolonnas
    const pad = 14;
    const xRank = rect.x + pad;
    const xTime = rect.x + rect.w - pad;
    const xName = rect.x + rect.w * 0.5;

    // viegls highlight fons
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 0.10);
    g.fillRoundedRect(rect.x, entryY - rowH/2, rect.w, rowH, 10);
    this._entryGfx = g;

    const rText = this.add.text(xRank, entryY, String(this._insertRank), {
      fontFamily: "Arial",
      fontSize: "18px",
      color: "#ffffff",
      fontStyle: "bold"
    }).setOrigin(0, 0.5);

    const tText = this.add.text(xTime, entryY, this.formatTime(this._pendingTimeSec), {
      fontFamily: "Arial",
      fontSize: "18px",
      color: "#ffffff",
      fontStyle: "bold"
    }).setOrigin(1, 0.5);

    this._entryTexts.push(rText, tText);

    // DOM input centrēts name kolonnā
    this.addNameEntryUI(this._insertRank, this._pendingTimeSec, xName, entryY);

    // status
    this._statusText.setText(`Tava vieta TOP 50: #${this._insertRank} — ieraksti vārdu un saglabā`);
    this._statusText.setColor("#ffffff");

    // parādām SAVE pogu
    if (this._btnSave) {
      this._btnSave.bg.setVisible(true);
      this._btnSave.t.setVisible(true);
      this._btnSave.t.setText("Saglabāt");
      this._btnSave.bg.setAlpha(1);
      this._btnSave.bg.setInteractive({ useHandCursor: true });
    }
  }


  layout() {
    const W = this.scale.width;
    const H = this.scale.height;

    // title/sub/top
    this._title.setPosition(W / 2, 74);
    this._sub.setPosition(W / 2, 112);
    this._topTitle.setPosition(W / 2, 152);
    this._statusText.setPosition(W / 2, 180);

    // pogas apakšā
    const btnY = H - 64;
    const gap = 26;
    const totalW = 200 + gap + 200;
    const startX = Math.round(W / 2 - totalW / 2);

    this._btnRestart.setPosition(startX + 100, btnY);
    this._btnExit.setPosition(startX + 200 + gap + 100, btnY);

    // tabulas panelis starp top un pogām
    const padX = Math.max(14, Math.round(W * 0.06));
    const panelW = Math.min(520, W - padX * 2);
    const panelX = Math.round((W - panelW) / 2);

    const baseTopY = 200;
    const extraTop = this._hasEntryRow ? 56 : 0;
    const topY = baseTopY + extraTop;
    const bottomY = btnY - 48;

    // SAVE poga virs apakšējām pogām (ja redzama)
    if (this._btnSave) {
      const saveY = btnY - 86;
      this._btnSave.setPosition(W / 2, saveY);
    }
    const panelH = Math.max(120, bottomY - topY);

    this._tableRect = { x: panelX, y: topY, w: panelW, h: panelH };

    // mask
    this._tableMaskGfx.clear();
    this._tableMaskGfx.fillStyle(0xffffff);
    this._tableMaskGfx.fillRect(panelX, topY, panelW, panelH);

    // panel fons (vienkāršs)
    if (this._panelBg) this._panelBg.destroy();
    this._panelBg = this.add.rectangle(panelX + panelW / 2, topY + panelH / 2, panelW, panelH, 0x0b0f14, 0.0);

    // pārzīmē tabulu, ja ir dati
    this.applyScroll();
  }

  makeBigButton(cx, cy, label, baseColor = 0x1f3a52, pressColor = 0x2a587c) {
    const btnW = 200;
    const btnH = 58;

    const bg = this.add.rectangle(cx, cy, btnW, btnH, baseColor, 1)
      .setInteractive({ useHandCursor: true });

    const t = this.add.text(cx, cy, label, {
      fontFamily: "Arial",
      fontSize: "22px",
      color: "#ffffff",
      fontStyle: "bold"
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

    bg.on("pointerdown", () => pressIn());
    bg.on("pointerup", () => pressOut());
    bg.on("pointerout", () => pressOut());
    bg.on("pointercancel", () => pressOut());

    const obj = { bg, t, setPosition: (x, y) => { bg.setPosition(x, y); t.setPosition(x, y); } };
    return obj;
  }

  scrollBy(dy) {
    if (!this._scroll) return;
    if (this._scroll.max <= 0) return;
    this._scroll.y = Phaser.Math.Clamp(this._scroll.y + dy, 0, this._scroll.max);
    this.applyScroll();
  }

  applyScroll() {
    if (!this._tableRect) return;
    if (!this._tableCont) return;
    this._tableCont.y = -this._scroll.y;
    // DOM elementus pārbīdam kopā ar scroll (ja tādi ir)
    for (const node of this._domNodes) {
      if (node && node._baseY != null) {
        node.y = node._baseY - this._scroll.y;
        if (node._baseX != null) node.x = node._baseX;
      }
    }
  }

  cleanupDom() {
    try {
      for (const n of this._domNodes) {
        try { n.destroy(); } catch (e) {}
      }
    } catch (e) {}
    this._domNodes = [];
  }

  jsonp(url) {
    return new Promise((resolve, reject) => {
      const cbName = "cb_" + Math.random().toString(16).slice(2);
      const cleanup = () => {
        try { delete window[cbName]; } catch (e) {}
        try { script.remove(); } catch (e) {}
      };
      window[cbName] = (data) => {
        cleanup();
        resolve(data);
      };

      const script = document.createElement("script");
      const fullUrl = url + (url.includes("?") ? "&" : "?") + "callback=" + cbName;
      script.onerror = () => {
        cleanup();
        reject(new Error("load error"));
      };
      script.src = fullUrl;
      document.body.appendChild(script);
    });
  }

  async loadTopAndRender() {
    try {
      const top = await this.jsonp(this.API_URL + "?action=top");
      if (!Array.isArray(top)) throw new Error("Bad response");
      this._statusText.setText("");
      this.renderTop(top);
    } catch (e) {
      this._statusText.setText("NEIZDEVĀS IELĀDĒT TOP (PĀRBAUDI DEPLOY).");
      this._statusText.setColor("#ffcccc");
    }
  }

  renderTop(top) {
    // notīram iepriekšējo
    if (this._tableCont) {
      this._tableCont.removeAll(true);
    }
    this.cleanupDom();

    const W = this.scale.width;
    const reason = this.result?.reason || "exit";
    const timeSec = typeof this.result?.timeSec === "number" ? this.result.timeSec : null;

    const rect = this._tableRect;
    if (!rect) return;

    const rowH = 34;
    const headerH = 30;

    // ievieto "tavu ierakstu" tikai uzvaras gadījumā un tikai ja esi TOP-50
    let insertRank = null;
    let showInsert = false;

    if (reason === "success" && typeof timeSec === "number") {
      // aprēķinam vietu TOP-50 (pirms saglabāšanas)
      let r = 1;
      for (let i = 0; i < top.length; i++) {
        const t = Number(top[i].time);
        if (!Number.isFinite(t)) continue;
        if (timeSec > t) r++;
        else break;
      }
      insertRank = r;
      showInsert = insertRank <= 50;
    }


    // Vai varam saglabāt? (tikai ja misija izpildīta un iekļaujas TOP50)
    this._hasEntryRow = (reason === "success" && typeof timeSec === "number" && showInsert);
    this._canSave = this._hasEntryRow;
    this._insertRank = this._hasEntryRow ? insertRank : null;
    this._pendingTimeSec = this._hasEntryRow ? timeSec : null;

    // pārpozicionējam layout (tabulas augša pārbīdās uz leju, ja ir ievades rinda)
    this.layout();

    // ievades rinda (fiksēta, ne-scroll)
    this.drawEntryRow();

    // ja nav TOP-50, pietiek ar laiku (prasība)
    if (reason === "success" && typeof timeSec === "number" && !showInsert) {
      this._statusText.setText(`TAVS LAIKS: ${this.formatTime(timeSec)} (ĀRPUS TOP 50)`);
      this._statusText.setColor("#ffffff");
    }

    // header
    const headerY = rect.y + 6;
    const xRank = rect.x + 16;
    const xName = rect.x + 92;
    const xTime = rect.x + rect.w - 16;

    const headerBg = this.add.rectangle(rect.x + rect.w / 2, headerY + headerH / 2 - 3, rect.w, headerH, 0x1f3a52, 0.25);
    this._tableCont.add(headerBg);

    const hStyle = { fontFamily: "Arial", fontSize: "16px", color: "#ffffff", fontStyle: "bold" };
    this._tableCont.add(this.add.text(xRank, headerY, "VIETA", hStyle).setOrigin(0, 0));
    this._tableCont.add(this.add.text(xName, headerY, "VĀRDS", hStyle).setOrigin(0, 0));
    this._tableCont.add(this.add.text(xTime, headerY, "LAIKS", hStyle).setOrigin(1, 0));

    // sagatavojam rindas renderēšanai
    let rowsToRender = top.slice(0, 50).map((r) => ({
      rank: Number(r.rank) || 0,
      name: (r.name || "").toString(),
      time: Number(r.time)
    }));

    if (showInsert) {
      const idx = Math.max(0, insertRank - 1);
      rowsToRender.splice(idx, 0, { rank: insertRank, name: "", time: timeSec, _me: true });
      rowsToRender = rowsToRender.slice(0, 50);
      for (let i = 0; i < rowsToRender.length; i++) rowsToRender[i].rank = i + 1;
    }

    const rowStyle = { fontFamily: "Arial", fontSize: "16px", color: "#ffffff" };
    const meStyle = { fontFamily: "Arial", fontSize: "19px", color: "#ffffff", fontStyle: "bold" };

    let y = rect.y + headerH + 10;

    for (let i = 0; i < rowsToRender.length; i++) {
      const row = rowsToRender[i];
      const isMe = !!row._me;

      const bg = this.add.rectangle(rect.x + rect.w / 2, y + rowH / 2, rect.w, rowH, 0x0b0f14, isMe ? 0.22 : 0.0);
      this._tableCont.add(bg);

      const st = isMe ? meStyle : rowStyle;

      this._tableCont.add(this.add.text(xRank, y + 7, String(row.rank), st).setOrigin(0, 0));
      this._tableCont.add(this.add.text(xTime, y + 7, this.formatTime(row.time), st).setOrigin(1, 0));

      if (!isMe) {
        this._tableCont.add(this.add.text(xName, y + 7, row.name, st).setOrigin(0, 0));
      } else {
        // Virs tabulas: vārda ievade + saglabāt (bez anonīmiem)
        this.addNameEntryUI(insertRank, timeSec, xName, y + rowH / 2);
      }

      y += rowH;
    }

    // aprēķinam scroll max
    const contentH = (headerH + 10) + rowsToRender.length * rowH;
    this._scroll.max = Math.max(0, contentH - rect.h);
    this._scroll.y = Phaser.Math.Clamp(this._scroll.y, 0, this._scroll.max);
    this.applyScroll();
  }


  addNameEntryUI(insertRank, timeSec, xName, rowCenterY) {
    // izveidojam tikai DOM input (bez iekšējās pogas), lai tas nekad "neaizbrauc"
    // un saglabāšana notiek ar vienoto SAGLABĀT pogu.
    this.cleanupDom();
    this._nameInputEl = null;

    const inputW = Math.min(260, Math.max(160, Math.round(this.scale.width * 0.52)));

    const html = `
      <div style="display:flex; align-items:center;">
        <input id="nameInput" type="text" maxlength="28" placeholder="Ieraksti vārdu"
          style="
            width:${inputW}px;
            height:32px;
            font-size:18px;
            font-weight:700;
            padding:2px 10px;
            border-radius:10px;
            border:1px solid rgba(255,255,255,0.35);
            outline:none;
            background:rgba(0,0,0,0.18);
            color:#ffffff;
          "/>
      </div>
    `;

    const dom = this.add.dom(xName, rowCenterY).createFromHTML(html);
    dom.setOrigin(0.5, 0.5);
    dom.setDepth(5000);
    dom._baseX = dom.x;
    dom._baseY = dom.y;
    this._domNodes.push(dom);

    const inputEl = dom.getChildByID("nameInput");
    if (inputEl) {
      inputEl.value = "";
      inputEl.autocapitalize = "words";
      inputEl.autocomplete = "off";
      inputEl.spellcheck = false;
      this._nameInputEl = inputEl;
      // fokusējam, lai uz telefona atveras klaviatūra
      setTimeout(() => { try { inputEl.focus(); } catch(e) {} }, 50);
    }
  }

  submitScoreFromInput() {
    const timeSec = this._pendingTimeSec;
    if (!this._canSave || !Number.isFinite(timeSec) || timeSec <= 0) return;

    const normName = (s) => (s || "").toString().trim().replace(/\s+/g, " ").slice(0, 28);
    const name = normName(this._nameInputEl ? this._nameInputEl.value : "");
    if (!name) {
      this._statusText.setText("Ieraksti vārdu (anonīmi netiek saglabāts).");
      this._statusText.setColor("#ffcccc");
      return;
    }

    // bloķējam
    this._btnSave.bg.disableInteractive();
    this._btnSave.bg.setAlpha(0.75);
    this._btnSave.t.setText("Sūta...");

    if (this._nameInputEl) {
      try { this._nameInputEl.disabled = true; } catch(e) {}
    }

    const url =
      this.API_URL +
      `?action=submit&name=${encodeURIComponent(name)}&time=${encodeURIComponent(timeSec)}&token=${encodeURIComponent(this.TOKEN)}`;

    this.jsonp(url).then((res) => {
      if (!res || res.ok !== true) throw new Error(res?.error || "submit failed");
      this._btnSave.t.setText("Saglabāts");
      this._statusText.setText("");
      this._canSave = false;
      // pārlādējam TOP, lai spēlētājs parādās tabulā
      this.loadTopAndRender();
    }).catch(() => {
      this._btnSave.bg.setAlpha(1);
      this._btnSave.t.setText("Saglabāt");
      this._btnSave.bg.setInteractive({ useHandCursor: true });
      if (this._nameInputEl) {
        try { this._nameInputEl.disabled = false; } catch(e) {}
      }
      this._statusText.setText("Neizdevās saglabāt (pārbaudi deploy/token).");
      this._statusText.setColor("#ffcccc");
    });
  }


  formatTime(sec) {
    const s = Math.max(0, Math.floor(Number(sec) || 0));
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }
}
