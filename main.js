const config = {
  type: Phaser.AUTO,
  width: 420,
  height: 820,
  parent: "game",


  dom: { createContainer: true },
  // ✅ ŠIS IR GALVENAIS FIX portrait režīmam
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },

  scene: [Intro, MainMenu, Stage1, Finish],

  physics: {
    default: "arcade",
    arcade: {
      gravity: { y: 900 },
      debug: false
    }
  }
};

new Phaser.Game(config);
