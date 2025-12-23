// scenes/Finish.js
// Finish + Score vienā scenā (TOP50 + vārda ievade tikai TOPā)

class Finish extends Phaser.Scene {
  constructor() {
    super("Finish");
  }

  init(data) {
    this.result = data || {};
    this._saved = false;
    this._top = null;
    this._myRank = null;

    // IMPORTANT: pilnais URL (nekādu "...")
    this.API_URL =
      "https://script.google.com/macros/s/AKfycbyh6BcVY_CBPW9v7SNo1bNp_XttvhxpeSdYPfrTdRCD4KWXLeLvv-0S3p96PX0Dv5BnrA/exec";
    this.TOKEN = "FIRE2025";
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    // fons
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.25);

    // header
    const success = !!this.result.success;
    const title = success ? "MISIJA IR IZPILDĪTA!" : "MISIJA NAV PABEIGTA!";
    this.add
      .text(W / 2, 70, title, {
        fontFamily: "Arial",
        fontSize: "34px",
        fontStyle: "700",
        color: "#FFFFFF",
      })
      .setOrigin(0.5);

    const timeText = this._formatTime(this.result.timeSeconds || this.result.timeSec || 0);
    this.add
      .text(W / 2, 112, `Tavs laiks: ${timeText}`, {
        fontFamily: "Arial",
        fontSize: "20px",
        color: "#EAEAEA",
      })
      .setOrigin(0.5);

    // zona saglabāšanai (fiksēta, neskrollējas)
    this._saveRowY = 155;
    this._tableTopY = 195;

    this._msg = this.add
      .text(W / 2, this._saveRowY - 28, "", {
        fontFamily: "Arial",
        fontSize: "16px",
        color: "#F1F1F1",
      })
      .setOrigin(0.5);

    // tabulas ģeometrija
    this._tableX = Math.round(W * 0.10);
    this._tableW = Math.round(W * 0.80);
    this._tableH = Math.round(H * 0.58);
    this._rowH = 28;

    // kolonnas (vienkārši un salasāmi)
    this._colRankX = this._tableX + 10;
    this._colNameX = this._tableX + Math.round(this._tableW * 0.22);
    this._colTimeX = this._tableX + this._tableW - 10;

    // header rinda (fiksēta)
    this._headerBg = this.add.rectangle(
      this._tableX + this._tableW / 2,
      this._tableTopY,
      this._tableW,
      28,
      0
