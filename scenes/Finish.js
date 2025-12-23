// scenes/Finish.js
// Finish + Score vienā scenā. Ievade tikai tad, ja Stage1 reason === "success" un TOP50.

class Finish extends Phaser.Scene {
  constructor() {
    super("Finish");
  }

  init(data) {
    this.dataIn = data || {};
    this.reason = (this.dataIn.reason || "").toString();
    this.elapsedMs = Number(this.dataIn.elapsedMs || 0);
    this.readyCount = Number(this.dataIn.readyCount || 0);
    this.totalCount = Number(this.dataIn.totalCount || 0);

    // SUCCESS definīcija atbilst Stage1.js
    this.success = this.reason === "success" && this.readyCount === this.totalCount;

    this.timeSec = Math.max(1, Math.floor(this.elapsedMs / 1000));

    // Backend (pilns URL, bez "...")
    this.API_URL =
      "https://script.google.com/macros/s/AKfycbyh6BcVY_CBPW9v7SNo1bNp_XttvhxpeSdYPfrTdRCD4KWXLeLvv-0S3p96PX0Dv5BnrA/exec";
    this.TOKEN = "FIRE2025";

    // UI state
    this._top = [];
    this._saved = false;
    this._nameInput = null;
    this._layoutDom = null;
    this._onKeyDown = null;
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.25);

    const title = this.success ? "MISIJA IR IZPILDĪTA!" : "MISIJA NAV PABEIGTA!";
    this.add
      .text(W / 2, 70, title, {
        fontFamily: "Arial",
        fontSize: "34px",
        fontStyle: "700",
        color: "#FFFFFF",
      })
      .setOrigin(0.5);

    this.add
      .text(W / 2, 112, `Tavs laiks: ${this._formatTime(this.timeSec)}`, {
        fontFamily: "Arial",
        fontSize: "20px",
        color: "#EAEAEA",
      })
      .setOrigin(0.5);

    this._msg = this.add
      .text(W / 2, 150, "", {
        fontFamily: "Arial",
        fontSize: "16px",
        color: "#F1F1F1",
      })
      .setOrigin(0.5);

    // Tabulas ģeometrija
    this._tableX = Math.round(W * 0.10);
    this._tableW = Math.round(W * 0.80);
    this._rowH = 28;

    this._tableTopY = 190;
    this._bodyMaskY = this._tableTopY + 26;
    this._tableH = Math.round(H * 0.58);

    this._colRankX = this._tableX + 10;
    this._colNameX = this._tableX + Math.round(this._tableW * 0.22);
    this._colTimeX = this._tableX + this._tableW - 10;

    // Header rinda
    this.add.rectangle(
      this._tableX + this._tableW / 2,
      this._tableTopY,
      this._tableW,
      28,
      0xffffff,
      0.10
    );

    this.add
      .text(this._colRankX, this._tableTopY, "Vieta", {
        fontFamily: "Arial",
        fontSize: "14px",
        color: "#FFFFFF",
      })
      .setOrigin(0, 0.5);

    this.add
      .text(this._colNameX, this._tableTopY, "Vārds", {
        fontFamily: "Arial",
        fontSize: "14px",
        color: "#FFFFFF",
      })
      .setOrigin(0, 0.5);

    this.add
      .text(this._colTimeX, this._tableTopY, "Laiks", {
        fontFamily: "Arial",
        fontSize: "14px",
        color: "#FFFFFF",
      })
      .setOrigin(1, 0.5);

    // Scroll container + maska (maskas grafika NAV redzama)
    this._rowsContainer = this.add.container(0, 0);

    this._maskGfx = this.make.graphics({ x: 0, y: 0, add: false });
    this._maskGfx.fillStyle(0xffffff, 1);
    this._maskGfx.fillRect(this._tableX, this._bodyMaskY, this._tableW, this._tableH);
    const mask = this._maskGfx.createGeometryMask();
    this._rowsContainer.setMask(mask);
    this._maskGfx.setVisible(false);

    this._scroll = 0;
    this._maxScroll = 0;

    this.input.on("wheel", (p, dx, dy) => this._setScroll(this._scroll + dy));
    this.input.on("pointermove", (p) => {
      if (!p.isDown || !p.prevPosition) return;
      const delta = p.position.y - p.prevPosition.y;
      this._setScroll(this._scroll - delta);
    });

    // Bottom buttons
    this._btnRestart = this._button(W * 0.30, H - 72, 200, 54, "RESTART", 0x245b33, () => {
      this._cleanupDom();
      this.scene.start("MainMenu"); // <- salabots: vienmēr MainMenu
    });

    this._btnExit = this._button(W * 0.70, H - 72, 200, 54, "IZIET", 0x6a2323, () => {
      this._cleanupDom();
      try { window.close(); } catch (e) {}
      this.scene.start("Intro");
    });

    // Load TOP
    this._loadTop();
  }

  _loadTop() {
    this._jsonp(`${this.API_URL}?action=top`, "cb_top_", (data) => {
      if (!Array.isArray(data)) {
        this._msg.setText("Neizdevās ielādēt TOP (pārbaudi deploy).");
        return;
      }
      this._top = data;
      this._renderRows();

      if (!this.success) {
        this._msg.setText("");
        return;
      }

      if (this._isEligibleForSave()) {
        const rank = this._estimateRank();
        this._msg.setText(`Tava vieta TOP 50: #${rank} — ievadi vārdu un saglabā`);
        this._showSaveUI(rank);
      } else {
        this._msg.setText("Tu netiki līdz TOP 50.");
      }
    }, () => {
      this._msg.setText("Neizdevās ielādēt TOP (pārbaudi deploy).");
    });
  }

  _renderRows() {
    this._rowsContainer.removeAll(true);

    const startY = this._bodyMaskY + 6;
    const rows = this._top || [];

    rows.forEach((r, i) => {
      const y = startY + i * this._rowH;

      const line = this.add.rectangle(
        this._tableX + this._tableW / 2,
        y + this._rowH / 2 - 2,
        this._tableW,
        1,
        0xffffff,
        0.08
      );
      this._rowsContainer.add(line);

      const rank = r.rank || i + 1;
      const name = (r.name ?? "").toString();
      const t = this._formatTime(Number(r.time));

      const tr = this.add.text(this._colRankX, y, String(rank), {
        fontFamily: "Arial",
        fontSize: "15px",
        color: "#FFFFFF",
      }).setOrigin(0, 0);

      const tn = this.add.text(this._colNameX, y, name, {
        fontFamily: "Arial",
        fontSize: "15px",
        color: "#FFFFFF",
      }).setOrigin(0, 0);

      const tt = this.add.text(this._colTimeX, y, t, {
        fontFamily: "Arial",
        fontSize: "15px",
        color: "#FFFFFF",
      }).setOrigin(1, 0);

      this._rowsContainer.add([tr, tn, tt]);
    });

    const contentH = rows.length * this._rowH + 10;
    this._maxScroll = Math.max(0, contentH - this._tableH);
    this._setScroll(0);
  }

  _setScroll(v) {
    this._scroll = Phaser.Math.Clamp(v, 0, this._maxScroll);
    this._rowsContainer.y = -this._scroll;
  }

  _showSaveUI(rank) {
    this._cleanupDom(); // drošībai, ja scene restartējas

    const btnW = 150;
    const btnH = 40;

    const rowY = 165;
    const inputX = this._tableX + 10;
    const inputW = this._tableW - btnW - 20;

    // Save button (Phaser)
    this._saveBtn = this._button(
      this._tableX + this._tableW - btnW / 2,
      rowY,
      btnW,
      btnH,
      "Saglabāt",
      0x23465f,
      () => this._submitScore()
    );
    this._saveBtn.container.setDepth(5000);

    // DOM input anchored to canvas bounds
    const dom = document.createElement("input");
    dom.type = "text";
    dom.maxLength = 28;
    dom.placeholder = "Vārds";
    dom.autocomplete = "off";
    dom.autocapitalize = "words";
    dom.spellcheck = false;

    dom.style.position = "fixed";
    dom.style.height = "38px";
    dom.style.padding = "0 12px";
    dom.style.borderRadius = "10px";
    dom.style.border = "1px solid rgba(255,255,255,0.25)";
    dom.style.background = "rgba(0,0,0,0.35)";
    dom.style.color = "white";
    dom.style.fontSize = "18px";
    dom.style.outline = "none";
    dom.style.pointerEvents = "auto";
    dom.style.zIndex = "999999";

    document.body.appendChild(dom);
    this._nameInput = dom;

    const layout = () => {
      if (!this._nameInput) return;
      const canvas = this.game.canvas;
      const r = canvas.getBoundingClientRect();
      const px = r.left + (inputX / this.scale.width) * r.width;
      const py = r.top + (rowY / this.scale.height) * r.height;
      const pw = (inputW / this.scale.width) * r.width;

      this._nameInput.style.left = `${Math.round(px)}px`;
      this._nameInput.style.top = `${Math.round(py - 19)}px`;
      this._nameInput.style.width = `${Math.round(pw)}px`;
    };

    this._layoutDom = layout;
    layout();
    this.scale.on("resize", layout);

    this._onKeyDown = (ev) => {
      if (this._saved) return;
      if (ev.key === "Enter") {
        ev.preventDefault();
        this._submitScore();
      }
    };
    window.addEventListener("keydown", this._onKeyDown);

    setTimeout(() => {
      try { this._nameInput && this._nameInput.focus(); } catch (e) {}
    }, 60);
  }

  _submitScore() {
    if (this._saved) return;
    if (!this._nameInput) return;

    const name = (this._nameInput.value || "").trim().replace(/\s+/g, " ").slice(0, 28);
    if (!name) {
      this._msg.setText("Ievadi vārdu.");
      return;
    }

    this._saved = true;
    this._saveBtn.setEnabled(false);
    this._saveBtn.setLabel("Saglabā...");

    const url =
      `${this.API_URL}?action=submit` +
      `&token=${encodeURIComponent(this.TOKEN)}` +
      `&name=${encodeURIComponent(name)}` +
      `&time=${encodeURIComponent(this.timeSec)}`;

    this._jsonp(url, "cb_submit_", (res) => {
      if (!res || res.ok !== true) {
        this._saved = false;
        this._saveBtn.setEnabled(true);
        this._saveBtn.setLabel("Saglabāt");
        this._msg.setText((res && res.error) ? res.error : "Neizdevās saglabāt.");
        return;
      }

      this._saveBtn.setLabel("Saglabāts ✓");
      this._saveBtn.setEnabled(false);
      this._msg.setText("Saglabāts.");

      this._cleanupDom(); // <- pēc saglabāšanas ievade pazūd un vairs nav aktīva

      // Pārlādē top, lai redzi sevi
      this._jsonp(`${this.API_URL}?action=top`, "cb_top2_", (data) => {
        if (Array.isArray(data)) {
          this._top = data;
          this._renderRows();
        }
      }, () => {});
    }, () => {
      this._saved = false;
      this._saveBtn.setEnabled(true);
      this._saveBtn.setLabel("Saglabāt");
      this._msg.setText("Neizdevās saglabāt.");
    });
  }

  _cleanupDom() {
    if (this._layoutDom) {
      try { this.scale.off("resize", this._layoutDom); } catch (e) {}
      this._layoutDom = null;
    }
    if (this._onKeyDown) {
      window.removeEventListener("keydown", this._onKeyDown);
      this._onKeyDown = null;
    }
    if (this._nameInput) {
      try { this._nameInput.blur(); } catch (e) {}
      try { this._nameInput.disabled = true; } catch (e) {}
      try { this._nameInput.remove(); } catch (e) {}
      this._nameInput = null;
    }
  }

  _isEligibleForSave() {
    const rows = this._top || [];
    if (rows.length < 50) return true;
    const last = rows[rows.length - 1];
    return this.timeSec <= Number(last.time);
  }

  _estimateRank() {
    const rows = this._top || [];
    for (let i = 0; i < rows.length; i++) {
      if (this.timeSec <= Number(rows[i].time)) return i + 1;
    }
    return Math.min(50, rows.length + 1);
  }

  _formatTime(sec) {
    const s = Math.max(0, Math.floor(Number(sec) || 0));
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }

  _jsonp(url, cbPrefix, onOk, onFail) {
    const cbName = `${cbPrefix}${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const script = document.createElement("script");
    const sep = url.includes("?") ? "&" : "?";
    script.src = `${url}${sep}callback=${cbName}`;
    script.async = true;

    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
      try { script.remove(); } catch (e) {}
    };

    const timer = setTimeout(() => {
      cleanup();
      onFail && onFail();
    }, 9000);

    window[cbName] = (data) => {
      clearTimeout(timer);
      cleanup();
      onOk && onOk(data);
    };

    script.onerror = () => {
      clearTimeout(timer);
      cleanup();
      onFail && onFail();
    };

    document.body.appendChild(script);
  }

  _button(x, y, w, h, label, color, onClick) {
    const container = this.add.container(x, y);

    const bg = this.add.rectangle(0, 0, w, h, color, 1).setOrigin(0.5);
    const txt = this.add.text(0, 0, label, {
      fontFamily: "Arial",
      fontSize: "20px",
      color: "#FFFFFF",
    }).setOrigin(0.5);

    container.add([bg, txt]);
    container.setSize(w, h);
    container.setInteractive(
      new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h),
      Phaser.Geom.Rectangle.Contains
    );

    const api = {
      container,
      setEnabled: (v) => {
        container.disableInteractive();
        if (v) {
          container.setInteractive(
            new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h),
            Phaser.Geom.Rectangle.Contains
          );
          bg.setAlpha(1);
          txt.setAlpha(1);
        } else {
          bg.setAlpha(0.6);
          txt.setAlpha(0.6);
        }
      },
      setLabel: (t) => txt.setText(t),
    };

    container.on("pointerdown", () => onClick && onClick());
    return api;
  }
}

window.Finish = Finish;
