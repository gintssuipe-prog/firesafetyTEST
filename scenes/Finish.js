// Finish.js — spēles finiša scēna (Intro stilā) + TOP-50 (Google Sheets)
class Finish extends Phaser.Scene {
  constructor() {
    super("Finish");

    // Tavs Apps Script Web App URL:
    this.API_URL = "https://script.google.com/macros/s/AKfycbwZDrfDqTjtUuD7DSEBKv-dtZBvJZCEua_9P7jZFYRlqwslaiP9mpeEzyGZU761oE6DYQ/exec";

    this.result = { reason: "exit", timeSec: null };
    this._endingUiBuilt = false;

    this._rows = [];
    this._rowBg = [];
    this._domNodes = [];

    this._saveBusy = false;
  }

  init(data) {
    this.result = data || { reason: "exit" };
    // Stage1 nodod elapsedMs; šeit pārvēršam sekundēs, lai pareizi rādās laiks
    if (this.result && typeof this.result.timeSec !== "number" && typeof this.result.elapsedMs === "number") {
      this.result.timeSec = Math.max(0, Math.floor(this.result.elapsedMs / 1000));
    }
  }

  formatTime(sec) {
    const s = Math.max(0, Math.floor(sec));
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }

  sanitizeName(raw) {
    const s = (raw || "")
      .toString()
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 28);
    return s;
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    // fons (tas pats, kas Intro)
    this.cameras.main.setBackgroundColor("#0b0f14");
    const bg = this.add.image(W / 2, H / 2, "intro_bg");
    bg.setAlpha(0.9);

    // pielāgojam fonu, lai nosegtu ekrānu
    const fitCover = () => {
      const iw = bg.width || 1;
      const ih = bg.height || 1;
      const scale = Math.max(W / iw, H / ih);
      bg.setScale(scale);
      bg.setPosition(W / 2, H / 2);
    };
    fitCover();

    // tumšs overlay
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.55);

    // virsraksts + teksts
    const reason = this.result?.reason || "exit";
    const timeSec = typeof this.result?.timeSec === "number" ? this.result.timeSec : null;

    const titleText = reason === "success" ? "Misija ir izpildīta!" : "Misija nav izpildīta!";
    this.add
      .text(W / 2, 86, titleText, {
        fontFamily: "Arial",
        fontSize: "34px",
        color: "#ffffff",
        fontStyle: "bold"
      })
      .setOrigin(0.5);

    let sub = "";
    if (reason === "success") {
      sub = `Tavs laiks: ${this.formatTime(timeSec)}`;
    } else if (reason === "timeout") {
      sub = "Tu neiekļāvies 15 minūtēs.";
    } else {
      sub = "Tu izgāji no spēles.";
    }

    this._subText = this.add
      .text(W / 2, 126, sub, {
        fontFamily: "Arial",
        fontSize: "18px",
        color: "#e7edf5"
      })
      .setOrigin(0.5);

    // TOP virsraksts
    this._topTitle = this.add
      .text(W / 2, 170, "TOP 50", {
        fontFamily: "Arial",
        fontSize: "20px",
        color: "#ffffff",
        fontStyle: "bold"
      })
      .setOrigin(0.5);

    this._statusText = this.add
      .text(W / 2, 200, "Ielādēju rezultātus...", {
        fontFamily: "Arial",
        fontSize: "16px",
        color: "#e7edf5"
      })
      .setOrigin(0.5);

    // Pogas (apakšā)
    const mkBtn = (cx, cy, label) => {
      const bg = this.add.rectangle(cx, cy, 160, 46, 0x142334, 0.95).setStrokeStyle(2, 0x2b4866, 1);
      const t = this.add
        .text(cx, cy, label, {
          fontFamily: "Arial",
          fontSize: "18px",
          color: "#ffffff",
          fontStyle: "bold"
        })
        .setOrigin(0.5);

      bg.setInteractive({ useHandCursor: true });
      bg.on("pointerover", () => bg.setFillStyle(0x1d3a55, 1));
      bg.on("pointerout", () => bg.setFillStyle(0x142334, 0.95));
      return { bg, t };
    };

    const btnY = H - 70;
    const btnPlay = mkBtn(Math.round(W * 0.32), btnY, "SPĒLĒT");
    const btnExit = mkBtn(Math.round(W * 0.68), btnY, "IZIET");

    btnPlay.bg.on("pointerup", () => {
      this.cleanupDom();
      this.scene.start("Stage1");
    });

    btnExit.bg.on("pointerup", () => {
      this.cleanupDom();
      try {
        window.open("", "_self");
        window.close();
      } catch (e) {}
      try {
        this.game.destroy(true);
      } catch (e) {}
      try {
        window.location.href = "about:blank";
      } catch (e) {}
    });

    // ielādējam TOP
    this.loadTopAndRender();

    // resize
    this.scale.on("resize", (gameSize) => {
      const w = gameSize.width;
      const h = gameSize.height;
      // pārzīmēt fonu
      this.cameras.main.setViewport(0, 0, w, h);
      // vienkāršāk: restartē šo scēnu ar tiem pašiem datiem
      // (lai DOM elementi nepeld)
      this.cleanupDom();
      this.scene.restart(this.result);
    });
  }

  cleanupDom() {
    // noņem DOM elementus (input u.c.)
    try {
      this._domNodes.forEach((d) => d?.destroy && d.destroy());
    } catch (e) {}
    this._domNodes = [];
  }

  
// JSONP helper (apejam CORS ierobežojumus ar Apps Script Web App)
jsonp(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const cbName = "cb_" + Math.random().toString(36).slice(2);
    const sep = url.includes("?") ? "&" : "?";
    const fullUrl = url + sep + "callback=" + cbName;

    const script = document.createElement("script");
    let done = false;

    const cleanup = () => {
      try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
      if (script && script.parentNode) script.parentNode.removeChild(script);
    };

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error("timeout"));
    }, timeoutMs);

    window[cbName] = (data) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      cleanup();
      reject(new Error("load error"));
    };

    script.src = fullUrl;
    document.body.appendChild(script);
  });
}

async loadTopAndRender() {
    const reason = this.result?.reason || "exit";
    const timeSec = typeof this.result?.timeSec === "number" ? this.result.timeSec : null;

    try {
      const top = await this.jsonp(this.API_URL + "?action=top");
if (!Array.isArray(top)) throw new Error("Bad response");

      this._statusText.setText("");

      // renderējam tabulu
      this.renderTop(top, reason, timeSec);
    } catch (e) {
      this._statusText.setText("Neizdevās ielādēt TOP (pārbaudi Apps Script Deploy).");
      this._statusText.setColor("#ffcccc");
    }
  }

  renderTop(top, reason, timeSec) {
    const W = this.scale.width;
    const startY = 230;
    const rowH = 18;
    const maxRows = 50;

    // notīram iepriekšējo zīmējumu
    [...this._rows, ...this._rowBg].forEach((o) => o?.destroy && o.destroy());
    this._rows = [];
    this._rowBg = [];
    this.cleanupDom();

    // galvene (vienkārša)
    const header = this.add
      .text(24, startY - 22, "Vieta   Vārds                         Laiks", {
        fontFamily: "Arial",
        fontSize: "14px",
        color: "#cfe0f2",
        fontStyle: "bold"
      })
      .setOrigin(0, 0);
    this._rows.push(header);

    // ja uzvara: aprēķinam, vai esi TOP-50, un kurā vietā
    let showInsert = false;
    let insertRank = null;

    if (reason === "success" && typeof timeSec === "number") {
      // top ir jau sakārtots (rank 1..)
      // tie-breaker: vienāds laiks -> agrākais uzvar, tātad jaunais vienāds laiks iet PĒC esošajiem vienādajiem.
      let r = 1;
      for (const it of top) {
        const t = Number(it.time);
        if (!Number.isFinite(t)) continue;
        if (t < timeSec) r++;
        else if (t === timeSec) r++;
        else break;
      }
      insertRank = r;
      showInsert = insertRank <= maxRows;
    }

    // sagatavojam renderējamo sarakstu (līdz 50 rindām)
    const rowsToRender = [];
    for (let i = 0; i < Math.min(top.length, maxRows); i++) rowsToRender.push(top[i]);

    // ja jāieliek tava rinda TOP-50: ieliekam un nobīdam pēdējo ārā (ja vajag)
    if (showInsert) {
      // atrast indeksu, kur jāieliek (rank->index)
      const idx = Math.max(0, insertRank - 1);
      rowsToRender.splice(idx, 0, { rank: insertRank, name: "", time: timeSec, _me: true });

      // pārrēķinām rank numurus vizuāli, un apgriežam līdz 50
      rowsToRender.splice(maxRows);

      for (let i = 0; i < rowsToRender.length; i++) {
        rowsToRender[i].rank = i + 1;
      }
    }

    // ja nav TOP-50, pietiek ar laiku (prasība)
    if (reason === "success" && typeof timeSec === "number" && !showInsert) {
      const msg = this.add
        .text(W / 2, startY + 50, `Tavs laiks: ${this.formatTime(timeSec)} (ārpus TOP 50)`, {
          fontFamily: "Arial",
          fontSize: "16px",
          color: "#ffffff",
          fontStyle: "bold"
        })
        .setOrigin(0.5);
      this._rows.push(msg);
    }

    // tabulas zīmēšana
    const xRank = 24;
    const xName = 80;
    const xTime = W - 24;

    const highlightColor = 0x2aa84a;

    let myRowY = null;
    let myRank = null;

    for (let i = 0; i < rowsToRender.length; i++) {
      const y = startY + i * rowH;

      const isMe = !!rowsToRender[i]._me;

      if (isMe) {
        myRowY = y;
        myRank = rowsToRender[i].rank;

        // fons izceltajai rindai
        const bg = this.add.rectangle(W / 2, y + rowH / 2 - 1, W - 24, rowH, highlightColor, 0.22);
        this._rowBg.push(bg);
      }

      // rank
      const rankT = this.add
        .text(xRank, y, String(rowsToRender[i].rank).padStart(2, " "), {
          fontFamily: "Arial",
          fontSize: "14px",
          color: "#ffffff",
          fontStyle: isMe ? "bold" : "normal"
        })
        .setOrigin(0, 0);
      this._rows.push(rankT);

      // time
      const timeT = this.add
        .text(xTime, y, this.formatTime(rowsToRender[i].time), {
          fontFamily: "Arial",
          fontSize: "14px",
          color: "#ffffff",
          fontStyle: isMe ? "bold" : "normal"
        })
        .setOrigin(1, 0);
      this._rows.push(timeT);

      // name (parastajiem: teksts)
      if (!isMe) {
        const name = (rowsToRender[i].name || "").toString();
        const nameT = this.add
          .text(xName, y, name, {
            fontFamily: "Arial",
            fontSize: "14px",
            color: "#e7edf5"
          })
          .setOrigin(0, 0);
        this._rows.push(nameT);
      }
    }

    // ja ir tava rinda TOP-50: uz tās rindas ieliekam input + saglabāt
    if (showInsert && myRowY !== null) {
      const inputW = Math.min(220, Math.max(140, Math.round(W * 0.46)));
      const inputX = xName + Math.round(inputW / 2);
      const inputY = myRowY + Math.round(rowH / 2) - 1;

      const html = `
        <div style="display:flex; gap:8px; align-items:center;">
          <input id="nameInput" type="text" maxlength="28"
            placeholder="Ieraksti vārdu"
            style="
              width:${inputW}px;
              height:20px;
              font-size:14px;
              padding:2px 6px;
              border-radius:6px;
              border:1px solid rgba(255,255,255,0.35);
              outline:none;
              background:rgba(10,15,20,0.85);
              color:#ffffff;
            "
          />
          <button id="saveBtn"
            style="
              height:24px;
              padding:0 10px;
              font-size:13px;
              font-weight:700;
              border-radius:6px;
              border:1px solid rgba(255,255,255,0.35);
              background:rgba(20,35,52,0.95);
              color:#ffffff;
              cursor:pointer;
            "
          >Saglabāt</button>
        </div>
      `;

      const dom = this.add.dom(inputX, inputY).createFromHTML(html);
      this._domNodes.push(dom);

      const node = dom.node;
      const input = node.querySelector("#nameInput");
      const btn = node.querySelector("#saveBtn");

      const msg = this.add
        .text(W / 2, startY + maxRows * rowH + 18, "", {
          fontFamily: "Arial",
          fontSize: "14px",
          color: "#ffffff"
        })
        .setOrigin(0.5);
      this._rows.push(msg);

      const doSave = async () => {
        if (this._saveBusy) return;

        const name = this.sanitizeName(input.value);
        if (!name) {
          msg.setText("Ieraksti vārdu (anonīmi nesaglabājam).");
          msg.setColor("#ffdddd");
          return;
        }

        msg.setText("Saglabāju...");
        msg.setColor("#e7edf5");
        this._saveBusy = true;

        try {
          const out = await this.jsonp(this.API_URL + "?action=submit&name=" + encodeURIComponent(name) + "&time=" + encodeURIComponent(timeSec));
          if (!out || out.ok !== true) throw new Error("save failed");

// UI: aizslēdzam
          input.disabled = true;
          btn.disabled = true;
          btn.style.opacity = "0.7";
          input.style.opacity = "0.85";
          msg.setText("Saglabāts!");
          msg.setColor("#ddffdd");

          // aizvietojam ievadi ar tekstu (lai vizuāli skaidrs, kas ierakstīts)
          // vienkārši: pārzīmējam tabulu ar to pašu top, bet ar ievadīto vārdu iekšā
          // (nelādējam no jauna, lai viss būtu momentā)
          // Atrodam rindas “vārda” zonu un uzliekam tekstu virsū
          const nameText = this.add
            .text(xName, myRowY, name, {
              fontFamily: "Arial",
              fontSize: "14px",
              color: "#ffffff",
              fontStyle: "bold"
            })
            .setOrigin(0, 0);
          this._rows.push(nameText);

        } catch (e) {
          msg.setText("Neizdevās saglabāt. Pārbaudi Apps Script Deploy (Access: Anyone).");
          msg.setColor("#ffcccc");
        } finally {
          this._saveBusy = false;
        }
      };

      btn.addEventListener("click", doSave);
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") doSave();
      });

      // automātiski fokusējam
      setTimeout(() => {
        try { input.focus(); } catch (e) {}
      }, 80);
    }
  }
}

window.Finish = Finish;
