/* =========================================================================
 * templates.js — デザインテンプレート集
 *
 * ワンクリックで配置できる雛形です。営業デモやデザインの叩き台に使えます。
 * 座標系はプリント範囲を 100×100 とした相対値：
 *   tx/ty = 中心位置（%）、size = 幅に対する大きさ（%）
 * テンプレートを増やす場合はこの配列に追加するだけです。
 * ========================================================================= */
(function () {
  "use strict";

  const TEMPLATES = [
    {
      id: "team-arch",
      name: "チームロゴ（アーチ）",
      tag: "チームウェア",
      objects: [
        { type: "text", tx: 50, ty: 22, text: "MITSUMORI", fontId: "anton", size: 15, fill: "#c8102e", arch: 45, letterSpacing: 2 },
        { type: "stamp", tx: 50, ty: 55, stampId: "star", size: 38, fill: "#1b2a4a" },
        { type: "text", tx: 50, ty: 86, text: "EST. 2026", fontId: "anton", size: 8, fill: "#1b2a4a", letterSpacing: 4 },
      ],
    },
    {
      id: "class-t",
      name: "クラスTシャツ",
      tag: "学園祭・体育祭",
      objects: [
        { type: "text", tx: 50, ty: 30, text: "3-B", fontId: "dela", size: 34, fill: "#f4771f", stroke: "#ffffff", strokeWidth: 3 },
        { type: "text", tx: 50, ty: 62, text: "団結", fontId: "fude", size: 22, fill: "#111111" },
        { type: "text", tx: 50, ty: 84, text: "since 2026 summer", fontId: "tegaki", size: 7, fill: "#111111" },
      ],
    },
    {
      id: "sports",
      name: "スポーツチーム",
      tag: "部活・クラブ",
      objects: [
        { type: "stamp", tx: 50, ty: 34, stampId: "lightning", size: 34, fill: "#f4c530" },
        { type: "text", tx: 50, ty: 68, text: "THUNDERS", fontId: "anton", size: 14, fill: "#111111", arch: -30, letterSpacing: 1 },
      ],
    },
    {
      id: "shop-logo",
      name: "和風ショップロゴ",
      tag: "店舗・法人",
      objects: [
        { type: "stamp", tx: 50, ty: 38, stampId: "kamon", size: 42, fill: "#7b1e3b" },
        { type: "text", tx: 50, ty: 82, text: "縁 結 堂", fontId: "mincho", size: 12, fill: "#1a1a1a", letterSpacing: 6 },
      ],
    },
    {
      id: "towel-name",
      name: "名入れ（毛筆）",
      tag: "記念品・タオル",
      objects: [
        { type: "text", tx: 38, ty: 50, text: "感謝", fontId: "fude", size: 30, fill: "#1b2a4a" },
        { type: "text", tx: 78, ty: 50, text: "山田太郎", fontId: "mincho", size: 8, fill: "#1b2a4a", vertical: true },
      ],
    },
    {
      id: "cafe",
      name: "カフェ・ポップ",
      tag: "店舗・イベント",
      objects: [
        { type: "stamp", tx: 50, ty: 34, stampId: "bubble", size: 44, fill: "#2e5b41" },
        { type: "text", tx: 48, ty: 30, text: "cafe", fontId: "script", size: 13, fill: "#ffffff" },
        { type: "text", tx: 50, ty: 74, text: "OPEN 10:00-18:00", fontId: "pop", size: 7, fill: "#2e5b41", letterSpacing: 1 },
      ],
    },
    {
      id: "club-emblem",
      name: "エンブレム",
      tag: "部活・サークル",
      objects: [
        { type: "stamp", tx: 50, ty: 44, stampId: "shield", size: 44, fill: "#20304f" },
        { type: "text", tx: 50, ty: 40, text: "FC", fontId: "anton", size: 15, fill: "#ffffff" },
        { type: "text", tx: 50, ty: 84, text: "FIGHT TOGETHER", fontId: "anton", size: 7, fill: "#20304f", letterSpacing: 2 },
      ],
    },
    {
      id: "onepoint",
      name: "ワンポイント刺繍",
      tag: "左胸・キャップ向け",
      objects: [
        { type: "stamp", tx: 38, ty: 50, stampId: "clover", size: 30, fill: "#1e7d46" },
        { type: "text", tx: 68, ty: 50, text: "M", fontId: "serifEn", size: 26, fill: "#1b2a4a" },
      ],
    },
  ];

  function getTemplate(id) {
    return TEMPLATES.find((t) => t.id === id);
  }

  globalThis.Templates = { TEMPLATES, getTemplate };
})();
