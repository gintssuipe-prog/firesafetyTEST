// Finish.js — finišs (MainMenu stilā) + TOP-50 (Google Sheets, JSONP) + token
class Finish extends Phaser.Scene {
  constructor() {
    super("Finish");
    this.API_URL = "https://script.google.com/macros/s/AKfycbyh6BcVY_CBPW9v7SNo1bNp_XttvhxpeSdYPfrTdRCD4KWXLeLvv-0S3p96PX0Dv5BnrA/exec";
    this.TOKEN = "FIRE2025";

    this.result = { reason: "exit", timeSec: null };
    this._domNodes = [];
    this._scroll = { y: 0, max: 0 };
  }

  init(data) {
    // Saņemam no Stage1: { reason, timeSec } vai { reason, elapsedMs }
    const reason = data?.reason || "exit";

    let timeSec = null;
    if (typeof data?.timeSec === "number") timeSec = data.timeSec;
    else if (typeof data?.elapsedMs === "number") timeSec = Math.floor(data.elapsedMs / 1000);

    this.result = { reason, timeSec };
    this._scroll = { y: 0, max: 0 };
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
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.60);

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
    this._btnRestart = this.makeBigButton(0, 0, "ATSĀKT");
    this._btnExit = this.makeBigButton(0, 0, "IZIET");

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

    const topY = 200;
    const bottomY = btnY - 48;
    const panelH = Math.max(120, bottomY - topY);

    this._tableRect = { x: panelX, y: topY, w: panelW, h: panelH };

    // mask
    this._tableMaskGfx.clear();
    this._tableMaskGfx.fillStyle(0xffffff);
    this._tableMaskGfx.fillRect(panelX, topY, panelW, panelH);

    // panel fons (vienkāršs)
    if (this._panelBg) this._panelBg.destroy();
    this._panelBg = this.add.rectangle(panelX + panelW / 2, topY + panelH / 2, panelW, panelH, 0x0b0f14, 0.35);

    // pārzīmē tabulu, ja ir dati
    this.applyScroll();
  }

  makeBigButton(cx, cy, label) {
    const btnW = 200;
    const btnH = 58;

    const bg = this.add.rectangle(cx, cy, btnW, btnH, 0x1f3a52, 1)
      .setInteractive({ useHandCursor: true });

    const t = this.add.text(cx, cy, label, {
      fontFamily: "Arial",
      fontSize: "22px",
      color: "#ffffff",
      fontStyle: "bold"
    }).setOrigin(0.5);

    const pressIn = () => {
      bg.setFillStyle(0x2a587c, 1);
      this.tweens.killTweensOf([bg, t]);
      this.tweens.add({ targets: [bg, t], scaleX: 0.96, scaleY: 0.96, duration: 70 });
    };
    const pressOut = () => {
      bg.setFillStyle(0x1f3a52, 1);
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
    this._tableCont.y = this._tableRect.y - this._scroll.y;
    // DOM elementus pārbīdam kopā ar scroll (ja tādi ir)
    for (const node of this._domNodes) {
      if (node && node._baseY != null) {
        node.y = node._baseY - this._scroll.y;
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

    const headerBg = this.add.rectangle(rect.x + rect.w / 2, headerY + headerH / 2 - 3, rect.w, headerH, 0x1f3a52, 0.55);
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
    const meStyle = { fontFamily: "Arial", fontSize: "16px", color: "#ffffff", fontStyle: "bold" };

    let y = rect.y + headerH + 10;

    for (let i = 0; i < rowsToRender.length; i++) {
      const row = rowsToRender[i];
      const isMe = !!row._me;

      const bg = this.add.rectangle(rect.x + rect.w / 2, y + rowH / 2, rect.w, rowH, 0x0b0f14, isMe ? 0.65 : 0.18);
      this._tableCont.add(bg);

      const st = isMe ? meStyle : rowStyle;

      this._tableCont.add(this.add.text(xRank, y + 7, String(row.rank), st).setOrigin(0, 0));
      this._tableCont.add(this.add.text(xTime, y + 7, this.formatTime(row.time), st).setOrigin(1, 0));

      if (!isMe) {
        this._tableCont.add(this.add.text(xName, y + 7, row.name, st).setOrigin(0, 0));
      } else {
        // Virs tabulas: vārda ievade + saglabāt (bez anonīmiem)
        this.addNameEntryUI(insertRank, timeSec);
      }

      y += rowH;
    }

    // aprēķinam scroll max
    const contentH = (headerH + 10) + rowsToRender.length * rowH;
    this._scroll.max = Math.max(0, contentH - rect.h);
    this._scroll.y = Phaser.Math.Clamp(this._scroll.y, 0, this._scroll.max);
    this.applyScroll();
  }

  addNameEntryUI(insertRank, timeSec) {
    if (this._nameEntryAdded) return;
    this._nameEntryAdded = true;

    const rect = this._tableRect;
    if (!rect) return;

    const y = rect.y - 14;
    const x = rect.x + rect.w / 2;

    const label = this.add.text(x, y, `TAVA VIETA TOP 50: #${insertRank}`, {
      fontFamily: "Arial",
      fontSize: "16px",
      color: "#ffffff",
      fontStyle: "bold"
    }).setOrigin(0.5, 1);

    // DOM input + poga (vienkāršs, stabils)
    const inputW = Math.min(260, Math.max(160, rect.w - 210));
    const html = `
      <div style="display:flex; gap:10px; align-items:center;">
        <input id="nameInput" type="text" maxlength="28" placeholder="Ieraksti vārdu"
          style="
            width:${inputW}px;
            height:28px;
            font-size:16px;
            padding:2px 10px;
            border-radius:8px;
            border:1px solid rgba(255,255,255,0.35);
            outline:none;
            background:rgba(0,0,0,0.35);
            color:#ffffff;
          "/>
        <button id="saveBtn"
          style="
            height:32px;
            padding:0 16px;
            font-size:16px;
            font-weight:bold;
            border-radius:10px;
            border:none;
            cursor:pointer;
            background:#1f3a52;
            color:#fff;
          ">SAGLABĀT</button>
      </div>
    `;

    const dom = this.add.dom(x, y - 4).createFromHTML(html);
    dom.setOrigin(0.5, 1);
    dom._baseY = dom.y; // scroll nav jāietekmē (virs tabulas)
    this._domNodes.push(dom);

    const inputEl = dom.getChildByID("nameInput");
    const btnEl = dom.getChildByID("saveBtn");

    const normName = (s) => (s || "").toString().trim().replace(/\s+/g, " ").slice(0, 28);

    btnEl.addEventListener("click", async () => {
      const name = normName(inputEl.value);
      if (!name) {
        this._statusText.setText("IERAKSTI VĀRDU (ANONĪMI NETIEK SAGLABĀTS).");
        this._statusText.setColor("#ffcccc");
        return;
      }

      // bloķējam UI
      btnEl.disabled = true;
      btnEl.textContent = "SŪTA...";
      inputEl.disabled = true;

      try {
        const url =
          this.API_URL +
          `?action=submit&name=${encodeURIComponent(name)}&time=${encodeURIComponent(timeSec)}&token=${encodeURIComponent(this.TOKEN)}`;

        const res = await this.jsonp(url);
        if (!res || res.ok !== true) throw new Error(res?.error || "submit failed");

        btnEl.textContent = "SAGLABĀTS";
        this._statusText.setText("");
        // ielādējam TOP no jauna, lai redz aktuālo tabulu
        this._nameEntryAdded = false;
        this.loadTopAndRender();
      } catch (e) {
        btnEl.disabled = false;
        btnEl.textContent = "SAGLABĀT";
        inputEl.disabled = false;
        this._statusText.setText("NEIZDEVĀS SAGLABĀT (PĀRBAUDI DEPLOY/TOKEN).");
        this._statusText.setColor("#ffcccc");
      }
    });
  }

  formatTime(sec) {
    const s = Math.max(0, Math.floor(Number(sec) || 0));
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }
}
