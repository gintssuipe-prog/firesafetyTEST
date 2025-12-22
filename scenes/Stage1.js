// ieliku drop  būs?   ir!!!
// atkal izvilkts no kapa

// izvilkts no kapa, resnas kājas, kantaina gaiša cepure
// Stage1.js — stabila versija (ROLLBACK) + cilvēciņam vektoru cepure/rokas/kājas + kāju “tipināšana”  kantaina cepure aizgaaja
// ✅ Saglabāts: stabilais “plikpauris” + plakanais buss (tex_bus kā vakardien)
// ✅ Cepure: 2 taisnstūri (kronis + nags), vektors, tumša (ne pilnīgi melna), tuvāk galvai
// ✅ Rokas: šaurāki trīsstūri
// ✅ Kājas: kluči ar tipināšanas animāciju skrienot

class Stage1 extends Phaser.Scene {
  constructor() {
    super("Stage1");

    this.carrying = null;
    this.readyCount = 0;
    this.totalCount = 10;

    this.touch = { left: false, right: false, up: false, down: false };

    this.facing = 1; // 1=pa labi, -1=pa kreisi
    this.startTimeMs = 0;
    this.finished = false;
    this.prevElevY = 0;

    // buss
    this.busStorage = [];
    this.BUS_CAPACITY = 6;

    // anim
    this.runT = 0; // “tipināšanas” fāze

    this._ending = false;
    this.MAX_TIME_MS = 15 * 60 * 1000; // 15 min

    // audio keys
    this.SFX = {
      pickup: "sfx_pickup",
      drop: "sfx_drop"
    };
  }

  preload() {
    // Skaņas (ir repā: assets/audio/pickup.mp3 un assets/audio/drop.mp3)
    // Ceļš atstāts relatīvs, lai strādā gan lokāli (http server), gan GitHub Pages.
    this.load.audio(this.SFX.pickup, "assets/audio/pickup.mp3");
    this.load.audio(this.SFX.drop, "assets/audio/drop.mp3");
  }

  playSfx(key, cfg = {}) {
    // Mobile/safari gadījumā audio var būt “locked” līdz pirmajam lietotāja žestam.
    // Intro/Menu jau parasti to atbloķē, bet te ir drošs “nekrītam” variants.
    try {
      if (!this.sound || !this.sound.locked) {
        this.sound.play(key, { volume: 0.6, ...cfg });
      }
    } catch (e) {
      // klusām ignorējam – spēle nedrīkst lūzt dēļ audio
    }
  }


  init() {
    // Phaser var restartēt to pašu Scene instanci (constructor netiek izsaukts vēlreiz),
    // tāpēc šeit atiestatām visu runtime stāvokli, lai 2./3. spēlē viss strādā korekti.
    this.carrying = null;
    this.readyCount = 0;

    this.touch = { left: false, right: false, up: false, down: false };

    this.facing = 1;
    this.startTimeMs = 0;
    this.finished = false;
    this.prevElevY = 0;

    this.busStorage = [];
    this.runT = 0;

    this._ending = false; // svarīgi: lai EXIT/timeout/finish strādā atkārtoti
  }

  create() {
    try {
      if (this.input && this.input.keyboard) this.input.keyboard.enabled = true;
    } catch (e) {}

    const W = this.scale.width;
    const H = this.scale.height;

    // ---- Layout: augšā spēles laukums, apakšā pogas ----
    this.controlsH = 190;
    this.playH = H - this.controlsH;

    // fons
    this.cameras.main.setBackgroundColor("#101a24");

    this.physics.world.gravity.y = 900;

    // Slāņi
    this.DEPTH = {
      stickers: 2,
      platforms: 10,
      elevator: 12,
      bus: 15,
      ext: 60,
      player: 100,
      carry: 110,
      ui: 200,
      controls: 300,
      overlay: 400
    };

    // ✅ uzģenerējam gradient-tekstūras (vienreiz)
    this.buildGradientTextures();

    // ---- Grīdas (5 stāvi) ----
    const topY = 130;
    const bottomY = this.playH - 35;

    this.FLOORS_Y = [];
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      this.FLOORS_Y.push(Phaser.Math.Linear(topY, bottomY, t));
    }
    this.THICK = 18;

    // ---- Platformas (Image + static body) ----
    this.platforms = this.physics.add.staticGroup();

    // 1. stāvs pilnā platumā
    this.addPlatform(0, this.FLOORS_Y[4], W, this.THICK);

    // Lifts/šahta
    this.elevatorWidth = 70;
    this.elevatorX = Math.round(W * 0.62);
    this.shaftGapW = this.elevatorWidth + 26;

    // 2–5 stāvs ar šahtas caurumu labajā pusē
    const rightStartX = Math.round(W * 0.42);
    const holeL = this.elevatorX - this.shaftGapW / 2;
    const holeR = this.elevatorX + this.shaftGapW / 2;

    // šaurā “seg1” centra x (tas ir tas “pavisam šaurais plauktiņš”)
    const seg1W_base = holeL - rightStartX;
    this.NARROW_MID_X = Math.round(rightStartX + seg1W_base / 2);

    // Noņemam 2 konkrētus mazos plauktiņus (šaurais seg1 gabals)
    // i = 0..3 attiecas uz augšējiem 4 stāviem: FLOORS_Y[0..3]
    // Te noņemam i=1 un i=3 (vizuāli: 2. un 4. stāvs no augšas)
    const REMOVE_NARROW_SEG_ON = new Set([1, 3]);

    for (let i = 0; i < 4; i++) {
      const y = this.FLOORS_Y[i];

      // kreisās puses šaurā maliņa
      const leftLedgeX = 26;
      const leftLedgeW = 74;
      this.addPlatform(leftLedgeX, y, leftLedgeW, this.THICK);

      // labā puse ar caurumu šahtai
      const seg1W = holeL - rightStartX;
      if (seg1W > 12 && !REMOVE_NARROW_SEG_ON.has(i)) {
        // “mazais zilais plauktiņš” pie šahtas (noņemam izvēlētos)
        this.addPlatform(rightStartX, y, seg1W, this.THICK);
      }

      const seg2X = holeR;
      const seg2W = W - holeR;
      if (seg2W > 12) this.addPlatform(seg2X, y, seg2W, this.THICK);
    }

    // ---- BUSS (ROLLBACK: vakardienas stabilais gradients) ----
    this.BUS = { w: Math.round(W * 0.40), h: 105 };
    this.BUS.x = 0;
    this.BUS.y = Math.round(this.FLOORS_Y[4] - this.BUS.h + 10);

    const busImg = this.add
      .image(this.BUS.x + this.BUS.w / 2, this.BUS.y + this.BUS.h / 2, "tex_bus")
      .setDisplaySize(this.BUS.w, this.BUS.h)
      .setDepth(this.DEPTH.bus);

    this.add
      .text(busImg.x, this.BUS.y + 8, "BUSS", {
        fontFamily: "Arial",
        fontSize: "16px",
        color: "#0b0f14",
        fontStyle: "bold"
      })
      .setOrigin(0.5, 0)
      .setDepth(this.DEPTH.bus + 1);

    // ✅ RITENIS (paliek kā bija)
    const wheelX = this.BUS.x + Math.round(this.BUS.w * 0.55);
    const wantedWheelY = this.BUS.y + this.BUS.h + 16;
    const wheelY = Math.min(this.playH - 12, wantedWheelY);

    this.add.image(wheelX, wheelY, "tex_wheel").setDisplaySize(42, 42).setDepth(this.DEPTH.bus - 2);
    this.add.image(wheelX, wheelY, "tex_wheelHub").setDisplaySize(22, 22).setDepth(this.DEPTH.bus - 1);

    // bus “zona”
    this.busZone = new Phaser.Geom.Rectangle(this.BUS.x, this.BUS.y, this.BUS.w, this.BUS.h);

    // 6 vietas busā (bez stroke)
    this.busSlots = [];
    const cols = 3,
      rows = 2;
    const padX = 18,
      padY = 28;
    const cellW = (this.BUS.w - padX * 2) / cols;
    const cellH = (this.BUS.h - padY * 2) / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = this.BUS.x + padX + c * cellW + cellW / 2;
        const y = this.BUS.y + padY + r * cellH + cellH / 2;
        this.busSlots.push({ x, y, used: false });
        this.add.rectangle(x, y, 18, 18, 0x0b0f14, 0.12).setDepth(this.DEPTH.bus);
      }
    }

    // ---- LIFTS platforma (gradient Image + dynamic body) ----
    const topOvershoot = 26;
    this.elevatorMinSurfaceY = this.FLOORS_Y[0] - topOvershoot;
    this.elevatorMaxSurfaceY = this.FLOORS_Y[4];

    this.elevatorSpeed = 58;
    this.elevatorDir = -1;

    this.elevator = this.add
      .image(this.elevatorX, this.elevatorMaxSurfaceY + this.THICK / 2, "tex_elevator")
      .setDisplaySize(this.elevatorWidth, this.THICK)
      .setDepth(this.DEPTH.elevator);

    this.physics.add.existing(this.elevator);
    this.elevator.body.setAllowGravity(false);
    this.elevator.body.setImmovable(true);
    this.prevElevY = this.elevator.y;

    // ---- Spēlētājs (stabils + vektoru cepure/rokas/kājas) ----
    this.player = this.makePlayer(Math.round(W * 0.22), this.FLOORS_Y[4]);
    this.player.setDepth(this.DEPTH.player);

    this.physics.add.existing(this.player);
    this.player.body.setCollideWorldBounds(true);
    this.player.body.setSize(28, 54);
    this.player.body.setOffset(-14, -54);

    this.physics.add.collider(this.player, this.platforms);
    this.physics.add.collider(this.player, this.elevator);

    // ---- Aparāti + “uzlīmju” sloti ----
    this.extinguishers = this.physics.add.group();
    this.slots = [];

    const spots = this.makeSpotsPortrait(W);

    spots.forEach((s) => {
      const floorSurfaceY = this.FLOORS_Y[s.floor];
      const extY = floorSurfaceY - 22;

      // uzlīme virs aparāta
      const stickerY = extY - 54;
      const sticker = this.add.rectangle(s.x, stickerY, 14, 14, 0xb42020, 0.85).setDepth(this.DEPTH.stickers);

      const slot = { x: s.x, y: extY, sticker, used: false };
      this.slots.push(slot);

      const ex = this.makeExtinguisher(s.x, extY, "NOK");
      ex.setDepth(this.DEPTH.ext);

      ex.setData("held", false);
      ex.setData("slotRef", null);
      ex.setData("inBus", false);
      ex.setData("busIndex", -1);

      this.setExtState(ex, "NOK");
      this.extinguishers.add(ex);
    });

    this.physics.add.collider(this.extinguishers, this.platforms);
    this.physics.add.collider(this.extinguishers, this.elevator);

    this.totalCount = this.slots.length;

    // ---- UI (bez fona) ----
    const uiStyle = this.uiStylePlain();

    this.timeText = this.add.text(12, 10, "Laiks: 00:00", uiStyle).setDepth(this.DEPTH.ui);

    this.readyText = this.add
      .text(W - 12, 10, `Gatavs: 0/${this.totalCount}`, uiStyle)
      .setOrigin(1, 0)
      .setDepth(this.DEPTH.ui);

    // ---- Kontroles (telefons) ----
    this.createPortraitControls();

    // ---- EXIT poga pa vidu kontroles zonā ----
    this.createExitButton();

    // ---- Keyboard ----
    this.cursors = this.input.keyboard.createCursorKeys();

    this.startTimeMs = this.time.now;
  }

  update(time, delta) {
    if (!this.finished) {
      const totalSec = Math.floor((time - this.startTimeMs) / 1000);
      const mm = String(Math.floor(totalSec / 60)).padStart(2, "0");
      const ss = String(totalSec % 60).padStart(2, "0");
      this.timeText.setText(`Laiks: ${mm}:${ss}`);
    }

    // Auto-beigas pēc 15 min (kā EXIT)
    if (!this.finished && !this._ending && time - this.startTimeMs >= this.MAX_TIME_MS) {
      this.gotoFinish("timeout");
      return;
    }

    // lifts
    const dt = delta / 1000;
    const minCenterY = this.elevatorMinSurfaceY + this.THICK / 2;
    const maxCenterY = this.elevatorMaxSurfaceY + this.THICK / 2;

    this.elevator.y += this.elevatorSpeed * dt * this.elevatorDir;
    if (this.elevator.y <= minCenterY) {
      this.elevator.y = minCenterY;
      this.elevatorDir = 1;
    }
    if (this.elevator.y >= maxCenterY) {
      this.elevator.y = maxCenterY;
      this.elevatorDir = -1;
    }

    this.elevator.body.updateFromGameObject();
    const elevDeltaY = this.elevator.y - this.prevElevY;
    this.prevElevY = this.elevator.y;

    // kustība
    let movingLR = false;
    if (!this.finished) {
      const left = this.cursors.left.isDown || this.touch.left;
      const right = this.cursors.right.isDown || this.touch.right;
      const speed = 230;

      if (left) {
        this.player.body.setVelocityX(-speed);
        this.facing = -1;
        movingLR = true;
      } else if (right) {
        this.player.body.setVelocityX(speed);
        this.facing = 1;
        movingLR = true;
      } else {
        this.player.body.setVelocityX(0);
      }
    } else {
      this.player.body.setVelocityX(0);
    }

    // ✅ vektoru “cepure/rokas” virzienā + kāju tipināšana
    this.updatePlayerVisuals(delta, movingLR);

    // paņem/noliec
    if (!this.finished) {
      const upPressed = Phaser.Input.Keyboard.JustDown(this.cursors.up) || this.consumeTouch("up");
      const downPressed = Phaser.Input.Keyboard.JustDown(this.cursors.down) || this.consumeTouch("down");
      if (upPressed) this.tryPickup();
      if (downPressed) this.tryDrop();
    }

    // aparāts rokās
    if (this.carrying) {
      const sideOffset = 24;
      this.carrying.x = this.player.x + sideOffset * this.facing;
      this.carrying.y = this.player.y - 30;
      this.carrying.setDepth(this.DEPTH.carry);
    }

    // brauc līdzi liftam
    const onElev =
      this.player.body.touching.down &&
      this.elevator.body.touching.up &&
      Math.abs(this.player.body.bottom - this.elevator.body.top) <= 3;

    if (onElev) {
      this.player.y += elevDeltaY;
      if (this.carrying) this.carrying.y += elevDeltaY;
    }
  }

  updatePlayerVisuals(delta, movingLR) {
    if (!this.player) return;

    // 1) pagriežam vektoru elementus pēc facing
    if (this.player._vecLayer) {
      this.player._vecLayer.scaleX = this.facing; // 1 vai -1
    }

    // 2) kāju “tipināšana”
    if (!this.player._legL || !this.player._legR) return;

    if (movingLR) {
      this.runT += delta * 0.018; // ātrums
      const a = Math.sin(this.runT);
      const b = Math.sin(this.runT + Math.PI);

      this.player._legL.y = this.player._legBaseY + Math.round(a * 3);
      this.player._legR.y = this.player._legBaseY + Math.round(b * 3);

      if (this.player._armL && this.player._armR) {
        this.player._armL.y = this.player._armBaseY + Math.round(b * 2);
        this.player._armR.y = this.player._armBaseY + Math.round(a * 2);
      }
    } else {
      this.player._legL.y = this.player._legBaseY;
      this.player._legR.y = this.player._legBaseY;
      if (this.player._armL && this.player._armR) {
        this.player._armL.y = this.player._armBaseY;
        this.player._armR.y = this.player._armBaseY;
      }
    }
  }

  // ---------------- Controls helpers ----------------
  consumeTouch(key) {
    if (this.touch[key]) {
      this.touch[key] = false;
      return true;
    }
    return false;
  }

  createPortraitControls() {
    const W = this.scale.width;
    const areaTop = this.playH;
    const areaH = this.controlsH;

    this.add
      .rectangle(W / 2, areaTop + areaH / 2, W, areaH, 0x081018, 0.95)
      .setScrollFactor(0)
      .setDepth(this.DEPTH.controls);

    const R = 46;

    const mkBtn = (cx, cy, label) => {
      const circle = this.add
        .circle(cx, cy, R, 0x142334, 1)
        .setScrollFactor(0)
        .setDepth(this.DEPTH.controls + 1)
        .setInteractive({ useHandCursor: true });

      const t = this.add
        .text(cx, cy, label, {
          fontFamily: "Arial",
          fontSize: "26px",
          color: "#e7edf5",
          fontStyle: "bold"
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(this.DEPTH.controls + 2);

      circle._label = t;
      return circle;
    };

    const leftX = 70;
    const yMid = areaTop + areaH / 2;

    const btnLeft = mkBtn(leftX, yMid - 45, "←");
    const btnDown = mkBtn(leftX, yMid + 45, "↓");

    const rightX = W - 70;
    const btnRight = mkBtn(rightX, yMid - 45, "→");
    const btnUp = mkBtn(rightX, yMid + 45, "↑");

    const pressIn = (btn) => {
      btn.setFillStyle(0x1d3a55, 1);
      this.tweens.add({ targets: [btn, btn._label], scaleX: 0.96, scaleY: 0.96, duration: 60 });
    };
    const pressOut = (btn) => {
      btn.setFillStyle(0x142334, 1);
      this.tweens.add({ targets: [btn, btn._label], scaleX: 1.0, scaleY: 1.0, duration: 80 });
    };

    const bindHold = (btn, key) => {
      btn.on("pointerdown", () => {
        this.touch[key] = true;
        pressIn(btn);
      });
      btn.on("pointerup", () => {
        this.touch[key] = false;
        pressOut(btn);
      });
      btn.on("pointerout", () => {
        this.touch[key] = false;
        pressOut(btn);
      });
      btn.on("pointercancel", () => {
        this.touch[key] = false;
        pressOut(btn);
      });
    };

    const bindTap = (btn, key) => {
      btn.on("pointerdown", () => {
        this.touch[key] = true;
        pressIn(btn);
      });
      btn.on("pointerup", () => pressOut(btn));
      btn.on("pointerout", () => pressOut(btn));
      btn.on("pointercancel", () => pressOut(btn));
    };

    bindHold(btnLeft, "left");
    bindHold(btnRight, "right");
    bindTap(btnUp, "up");
    bindTap(btnDown, "down");
  }

  createExitButton() {
    const W = this.scale.width;
    const areaTop = this.playH;
    const areaH = this.controlsH;

    const cx = Math.round(W / 2);
    const cy = Math.round(areaTop + areaH / 2);

    const R = 44;

    const btn = this.add
      .circle(cx, cy, R, 0xb90f0f, 1)
      .setScrollFactor(0)
      .setDepth(this.DEPTH.controls + 3)
      .setInteractive({ useHandCursor: true });

    const label = this.add
      .text(cx, cy, "EXIT", {
        fontFamily: "Arial",
        fontSize: "22px",
        color: "#ffffff",
        fontStyle: "bold"
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(this.DEPTH.controls + 4);

    const pressIn = () => {
      btn.setFillStyle(0xd61a1a, 1);
      this.tweens.add({ targets: [btn, label], scaleX: 0.96, scaleY: 0.96, duration: 60 });
    };

    const pressOut = () => {
      btn.setFillStyle(0xb90f0f, 1);
      this.tweens.add({ targets: [btn, label], scaleX: 1.0, scaleY: 1.0, duration: 80 });
    };

    const doExit = () => {
      this.gotoFinish("exit");
    };

    btn.on("pointerdown", () => pressIn());
    btn.on("pointerup", () => {
      pressOut();
      doExit();
    });
    btn.on("pointerout", () => pressOut());
    btn.on("pointercancel", () => pressOut());
  }

  // ---------------- Gameplay: pickup/drop ----------------
  tryPickup() {
    if (this.carrying) return;

    const px = this.player.x;
    const py = this.player.y - 20;

    let best = null;
    let bestD = 1e9;

    this.extinguishers.getChildren().forEach((ex) => {
      if (!ex.active) return;
      if (ex.getData("held")) return;

      const d = Phaser.Math.Distance.Between(px, py, ex.x, ex.y);
      if (d < 58 && d < bestD) {
        best = ex;
        bestD = d;
      }
    });

    if (!best) return;

    const slotRef = best.getData("slotRef");
    if (slotRef) {
      slotRef.used = false;
      slotRef.sticker.setFillStyle(0xb42020, 0.85);
      best.setData("slotRef", null);

      this.readyCount = Math.max(0, this.readyCount - 1);
      this.readyText.setText(`Gatavs: ${this.readyCount}/${this.totalCount}`);
    }

    if (best.getData("inBus")) {
      const idx = best.getData("busIndex");
      if (idx >= 0 && this.busSlots[idx]) this.busSlots[idx].used = false;
      best.setData("inBus", false);
      best.setData("busIndex", -1);
      this.busStorage = this.busStorage.filter((x) => x !== best);
    }

    best.setData("held", true);
    best.body.enable = false;
    best.setDepth(this.DEPTH.carry);
    this.carrying = best;

    // ✅ SFX: pickup
    this.playSfx(this.SFX.pickup, { volume: 0.65 });
  }

  tryDrop() {
    if (!this.carrying) return;

    // ✅ SFX: drop (tikai tad, ja reāli bija ko nolikt)
    this.playSfx(this.SFX.drop, { volume: 0.65 });

    const ex = this.carrying;
    ex.setData("held", false);
    ex.body.enable = true;
    ex.setDepth(this.DEPTH.ext);

    ex.x = this.player.x + 18 * this.facing;
    ex.y = this.player.y - 22;

    // BUSS
    if (Phaser.Geom.Rectangle.Contains(this.busZone, ex.x, ex.y)) {
      const freeIndex = this.busSlots.findIndex((s) => !s.used);

      if (freeIndex === -1 || this.busStorage.length >= this.BUS_CAPACITY) {
        ex.body.enable = true;
        ex.body.setVelocity(0, 0);

        const groundY = this.FLOORS_Y[4] - 22;
        ex.x = Math.min(this.scale.width - 18, this.busZone.right + 24);
        ex.y = groundY;

        this.carrying = null;
        return;
      }

      this.busSlots[freeIndex].used = true;
      this.busStorage.push(ex);

      ex.setData("inBus", true);
      ex.setData("busIndex", freeIndex);

      this.setExtState(ex, "OK");

      ex.body.enable = false;
      ex.x = this.busSlots[freeIndex].x;
      ex.y = this.busSlots[freeIndex].y;

      this.carrying = null;
      return;
    }

    // OK + slots
    if (ex.getData("state") === "OK") {
      const slot = this.findSlotUnder(ex.x, ex.y);

      if (slot && slot.used) {
        ex.x += 22 * this.facing;
        this.carrying = null;
        return;
      }

      if (slot && !slot.used) {
        slot.used = true;
        slot.sticker.setFillStyle(0x2aa84a, 0.95);

        ex.body.enable = false;
        ex.x = slot.x;
        ex.y = slot.y;
        ex.setData("slotRef", slot);

        this.readyCount += 1;
        this.readyText.setText(`Gatavs: ${this.readyCount}/${this.totalCount}`);

        if (this.readyCount >= this.totalCount) {
          this.finishGame();
        }

        this.carrying = null;
        return;
      }
    }

    this.carrying = null;
  }

  findSlotUnder(x, y) {
    for (const s of this.slots) {
      const d = Phaser.Math.Distance.Between(x, y, s.x, s.y);
      if (d < 26) return s;
    }
    return null;
  }

  finishGame() {
  if (this.finished || this._ending) return;
  this.finished = true;

  const elapsedMs = this.time.now - this.startTimeMs;
  this.gotoFinish("success", { elapsedMs });
}

gotoFinish(reason, data = {}) {
  if (this._ending) return;
  this._ending = true;

  const elapsedMs = typeof data.elapsedMs === "number" ? data.elapsedMs : this.time.now - this.startTimeMs;

  // Droši atslēdzam kontroli
  try {
    if (this.input && this.input.keyboard) this.input.keyboard.enabled = false;
  } catch (e) {}

  this.scene.start("Finish", {
    reason,
    elapsedMs,
    readyCount: this.readyCount,
    totalCount: this.totalCount
  });
}

// ---------------- Drawing helpers ----------------
  uiStyle() {
    return {
      fontFamily: "Arial",
      fontSize: "16px",
      color: "#e7edf5",
      backgroundColor: "rgba(0,0,0,0.35)",
      padding: { x: 10, y: 6 }
    };
  }

  uiStylePlain() {
    return {
      fontFamily: "Arial",
      fontSize: "18px",
      color: "#ffffff"
    };
  }

  addPlatform(xLeft, surfaceY, width, thickness) {
    const img = this.add
      .image(xLeft + width / 2, surfaceY + thickness / 2, "tex_platform")
      .setDisplaySize(width, thickness)
      .setDepth(this.DEPTH.platforms);

    this.physics.add.existing(img, true);
    this.platforms.add(img);
  }

  // ✅ Spēlētājs: vecais “ķermenis/galva” + vektoru cepure (2 kluči) + šaurākas rokas + kājas
  makePlayer(x, surfaceY) {
    const c = this.add.container(Math.round(x), Math.round(surfaceY));

    // ķermenis (stabilais)
    const body = this.add.image(0, -31, "tex_playerBody").setDisplaySize(30, 44);
    body.setPosition(Math.round(body.x), Math.round(body.y));

    const stripe = this.add.rectangle(0, -16, 30, 8, 0x00ff66, 1);
    stripe.setPosition(Math.round(stripe.x), Math.round(stripe.y));

    // galva (stabilā)
    const head = this.add.image(0, -57, "tex_head").setDisplaySize(22, 22);
    head.setPosition(Math.round(head.x), Math.round(head.y));

    // ===== Vektoru slānis (cepure/rokas/kājas) =====
    const vec = this.add.container(0, 0);
    c._vecLayer = vec;

    // Krāsas
    const hatColor = 0x2a2f33; // tumša, bet ne “absolūti melna”
    const skinColor = 0xd8b08b;
    const legColor = 0x1a1a1a;

    // ---- Cepure: 2 taisnstūri (kronis + nags) ----
    // Pozicionēta tuvāk galvai (virs galvas “augšas”).
    // Facing tiek panākts ar vec.scaleX = 1 / -1, tāpēc “nags” vienmēr skatās uz skriešanas virzienu.
    const crown = this.add.rectangle(0, -69, 14, 8, hatColor, 1); // kronis uz galvas
    const brim = this.add.rectangle(10, -66, 18, 4, hatColor, 1); // “nags” uz priekšu (x>0)

    // ---- Rokas: šaurāki trīsstūri ----
    // Priekšējā roka (virzienā uz skriešanu)
    const armFront = this.add.polygon(
      14,
      -34,
      [
        0, 0,
        12, 4,
        2, 14
      ],
      skinColor,
      1
    );

    // Aizmugurējā roka
    const armBack = this.add.polygon(
      -14,
      -34,
      [
        0, 0,
        10, 3,
        2, 12
      ],
      skinColor,
      1
    );

    c._armL = armBack;
    c._armR = armFront;
    c._armBaseY = armFront.y;

    // ---- Kājas (kluči) ----
    const legBaseY = -6;
    const legL = this.add.rectangle(-9, legBaseY, 14, 16, legColor, 1);
    const legR = this.add.rectangle(9, legBaseY, 14, 16, legColor, 1);

    c._legL = legL;
    c._legR = legR;
    c._legBaseY = legBaseY;

    // Slāņojums: kājas -> rokas -> cepure (lai cepure vienmēr virs galvas)
    vec.add([legL, legR, armBack, armFront, crown, brim]);

    c.add([body, stripe, head, vec]);
    return c;
  }

  // ✅ Aparāts (stabilais)
  makeExtinguisher(x, y, label) {
    const c = this.add.container(Math.round(x), Math.round(y));

    const shell = this.add.image(0, 0, "tex_extShell").setDisplaySize(24, 38);

    const join = this.add.image(0, -19, "tex_extHandle").setDisplaySize(24, 4);
    join.setPosition(Math.round(join.x), Math.round(join.y));

    const handleBase = this.add.image(0, -22, "tex_extHandle").setDisplaySize(16, 10);
    handleBase.setPosition(Math.round(handleBase.x), Math.round(handleBase.y));

    const nozzle = this.add.image(10, -26, "tex_extNozzle").setDisplaySize(20, 7);
    nozzle.setRotation(Phaser.Math.DegToRad(-20));
    nozzle.setPosition(Math.round(nozzle.x), Math.round(nozzle.y));

    const badge = this.add.rectangle(0, 7, 24, 16, 0x0b0f14, 0.9);

    const txt = this.add
      .text(0, 7, label, {
        fontFamily: "Arial",
        fontSize: "11px",
        color: "#ffffff",
        fontStyle: "bold"
      })
      .setOrigin(0.5);

    c.add([shell, join, handleBase, nozzle, badge, txt]);

    this.physics.add.existing(c);
    c.body.setSize(24, 38);
    c.body.setOffset(-12, -19);

    c.setData("txt", txt);
    c.setData("badge", badge);

    this.setExtState(c, "NOK");
    return c;
  }

  setExtState(ext, state) {
    ext.setData("state", state);
    ext.getData("txt").setText(state);

    const badge = ext.getData("badge");
    const txt = ext.getData("txt");

    txt.setColor("#ffffff");

    if (state === "OK") {
      badge.setFillStyle(0x0a8f3f);
      badge.setAlpha(0.95);
    } else {
      badge.setAlpha(0);
      badge.setFillStyle(0xff4040);
    }
  }

  makeSpotsPortrait(W) {
    const xLeft = 62;
    const xLeftTop = 180;
    const xRight = Math.round(W * 0.9);
    const xTopExtra = Math.round(W * 0.8);

    const narrowMid = this.NARROW_MID_X || Math.round(W * 0.47);

    return [
      { floor: 0, x: xLeftTop },
      { floor: 0, x: xRight },
      { floor: 0, x: xTopExtra },

      { floor: 1, x: xLeft },
      { floor: 1, x: xRight },

      { floor: 2, x: xLeft },
      { floor: 2, x: narrowMid },

      { floor: 3, x: xLeft },
      { floor: 3, x: xRight },

      { floor: 4, x: xRight }
    ];
  }

  // ---------------- Gradient textures (fake 3D) ----------------
  buildGradientTextures() {
    const ensure = (key, w, h, painter) => {
      if (this.textures.exists(key)) return;
      const tx = this.textures.createCanvas(key, w, h);
      const ctx = tx.getContext();
      painter(ctx, w, h);
      tx.refresh();
      tx.refresh();
    };

    ensure("tex_platform", 64, 16, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0.0, "#1a8fb3");
      g.addColorStop(0.45, "#0f5f7a");
      g.addColorStop(0.7, "#0c465a");
      g.addColorStop(1.0, "#083343");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });

    ensure("tex_elevator", 64, 16, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0.0, "#8b949e");
      g.addColorStop(0.5, "#5b636b");
      g.addColorStop(1.0, "#2d333b");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });

    // Buss (stabilais “plastmasa/metāls”)
    ensure("tex_bus", 128, 64, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0.0, "#ffffff");
      g.addColorStop(0.35, "#eef3f8");
      g.addColorStop(0.7, "#d6dee8");
      g.addColorStop(1.0, "#b8c3d1");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      const g2 = ctx.createLinearGradient(0, 0, w, 0);
      g2.addColorStop(0.0, "rgba(255,255,255,0)");
      g2.addColorStop(0.5, "rgba(255,255,255,0.35)");
      g2.addColorStop(1.0, "rgba(255,255,255,0)");
      ctx.fillStyle = g2;
      ctx.fillRect(0, Math.round(h * 0.22), w, Math.round(h * 0.22));
    });

    ensure("tex_playerBody", 32, 48, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0.0, "#050607");
      g.addColorStop(0.55, "#23272b");
      g.addColorStop(1.0, "#050607");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });

    ensure("tex_head", 32, 32, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2,
        cy = h / 2;
      const rg = ctx.createRadialGradient(cx - 6, cy - 6, 2, cx, cy, 16);
      rg.addColorStop(0.0, "#fff4dd");
      rg.addColorStop(0.45, "#ffe2b8");
      rg.addColorStop(1.0, "#caa27c");

      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(cx, cy, 14, 0, Math.PI * 2);
      ctx.closePath();
      ctx.fill();
    });

    ensure("tex_extShell", 32, 48, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0.0, "#8e0a0a");
      g.addColorStop(0.35, "#ff2b2b");
      g.addColorStop(0.55, "#ff5a5a");
      g.addColorStop(1.0, "#8e0a0a");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });

    ensure("tex_extHandle", 64, 32, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);

      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0.0, "#2a3138");
      g.addColorStop(0.25, "#9aa6b2");
      g.addColorStop(0.5, "#eef2f6");
      g.addColorStop(0.75, "#7e8a95");
      g.addColorStop(1.0, "#1c232a");

      ctx.fillStyle = g;
      ctx.fillRect(0, 6, w, h - 12);

      const hl = ctx.createLinearGradient(0, 0, 0, h);
      hl.addColorStop(0.0, "rgba(255,255,255,0.30)");
      hl.addColorStop(0.6, "rgba(255,255,255,0)");
      ctx.fillStyle = hl;
      ctx.fillRect(0, 6, w, Math.max(2, Math.round((h - 12) * 0.45)));

      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.fillRect(0, 6 + Math.round((h - 12) * 0.65), w, Math.round((h - 12) * 0.35));
    });

    ensure("tex_extNozzle", 64, 32, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);

      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0.0, "#12171d");
      g.addColorStop(0.28, "#a9b6c2");
      g.addColorStop(0.55, "#eef2f6");
      g.addColorStop(0.78, "#8d99a4");
      g.addColorStop(1.0, "#0f141a");

      ctx.fillStyle = g;
      ctx.fillRect(0, 10, w, h - 20);

      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.fillRect(w - 10, 10, 10, h - 20);

      const hl = ctx.createLinearGradient(0, 0, w, h);
      hl.addColorStop(0.0, "rgba(255,255,255,0.18)");
      hl.addColorStop(0.5, "rgba(255,255,255,0)");
      ctx.fillStyle = hl;
      ctx.fillRect(0, 10, w, h - 20);
    });

    ensure("tex_wheel", 64, 64, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2,
        cy = h / 2;
      const rg = ctx.createRadialGradient(cx - 8, cy - 8, 6, cx, cy, 30);
      rg.addColorStop(0.0, "#4a4a4a");
      rg.addColorStop(0.6, "#1a1a1a");
      rg.addColorStop(1.0, "#050505");

      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(cx, cy, 30, 0, Math.PI * 2);
      ctx.closePath();
      ctx.fill();
    });

    ensure("tex_wheelHub", 64, 64, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2,
        cy = h / 2;
      const rg = ctx.createRadialGradient(cx - 6, cy - 6, 4, cx, cy, 18);
      rg.addColorStop(0.0, "#f2f2f2");
      rg.addColorStop(0.6, "#9a9a9a");
      rg.addColorStop(1.0, "#3a3a3a");

      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(cx, cy, 16, 0, Math.PI * 2);
      ctx.closePath();
      ctx.fill();
    });
  }
}
