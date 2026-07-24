/* =========================================================================
 * config.js — 店舗設定・商品マスタ・価格表
 *
 * このファイルが「管理画面」の代わりになる設定ファイルです。
 * 商品・カラー・サイズ・価格・プリント方法はすべてここを書き換えるだけで
 * シミュレーター全体（画面表示・見積もり計算・見積書）に反映されます。
 * ========================================================================= */

/* ---------- 店舗情報（見積書・ヘッダーに表示されます） ---------- */
const SHOP = {
  name: "ミツモリ刺繍プリント",           // ← 貴社名に変更してください
  tagline: "オリジナルウェア デザインシミュレーター",
  tel: "0000-00-0000",
  email: "info@example.com",
  address: "〒000-0000 ○○県○○市○○町 0-0-0",
  taxRate: 0.10,                            // 消費税率
  taxRounding: "floor",                     // 消費税の端数処理: "floor"切捨て / "round"四捨五入 / "ceil"切上げ
  shippingFee: 880,                         // 送料（税込・全国一律）※税込のため消費税は二重課税しません
  freeShippingMin: 30000,                   // この金額（税抜）以上で送料無料
  quoteValidDays: 30,                       // 見積書の有効期限（日）
  minOrderQty: 1,                           // 最小注文枚数
};

/* ---------- 特商法表記（通信販売では法的に必須） ----------
 * 実際に注文受付を開始する前に、必ず実在の事業者情報を記入してください。 */
const LEGAL = {
  seller: "ミツモリ刺繍プリント",           // 販売事業者名
  manager: "山田 太郎",                     // 運営責任者
  address: "〒000-0000 ○○県○○市○○町 0-0-0",
  tel: "0000-00-0000",
  email: "info@example.com",
  hours: "平日 10:00–18:00（土日祝を除く）",
  deliveryTime: "デザイン確定後 7〜10営業日で発送",
  payment: "銀行振込 / 各種クレジットカード（別途ご案内）",
  extraFee: "送料（税込880円、30,000円以上で無料）",
  returns: "オーダーメイド品のため、お客様都合による返品・交換はお受けできません。不良品は良品と交換します。",
};

/* ---------- 注文データの受信先設定 ----------
 * バックエンド無しで注文を確実に受け取るための設定。
 * endpoint が空の場合は自動的にメール(mailto)方式にフォールバックします。
 *
 * 【設定方法（推奨：外部フォームサービス）】
 *  1. Formspree(https://formspree.io) / Web3Forms(https://web3forms.com) 等で無料登録
 *  2. 発行された送信先URL(またはアクセスキー)を endpoint に貼り付け
 *  3. provider を "formspree" 等に設定
 * これだけで、GitHub Pages の静的サイトのまま注文が貴社に届きます。 */
const ORDER = {
  provider: "mailto",         // "formspree" | "web3forms" | "getform" | "custom" | "mailto"
  endpoint: "",               // 例) "https://formspree.io/f/xxxxxxx"（provider に応じたURL/キー）
  accessKey: "",              // web3forms の access_key を使う場合はここに
  toEmail: "info@example.com",// mailto フォールバック時の送信先
  attachFiles: true,          // 入稿SVG・プレビューPNG・デザインJSONを添付/同送するか
  autoNumber: "ORD",          // 注文番号の接頭辞（例 ORD-20260707-1234）
};

/* ---------- 数量スライド（段階割引）の区切り ----------
 * 見積もり単価はこの区分ごとに変わります。tiers の並び順と
 * 各価格表の配列の並び順は対応しています。 */
const QTY_TIERS = [
  { min: 1,   label: "1〜9枚" },
  { min: 10,  label: "10〜19枚" },
  { min: 20,  label: "20〜29枚" },
  { min: 30,  label: "30〜49枚" },
  { min: 50,  label: "50〜99枚" },
  { min: 100, label: "100枚〜" },
];

/* ---------- 刺繍糸カラーパレット（20色） ----------
 * code: 実際の糸番手（例 マデイラ 1800 等）。入稿指示書に出力されます。
 * 空のままでも動作します（色名で出力）。貴社の使用糸に合わせて記入してください。 */
const THREAD_COLORS = [
  { id: "th-white",  name: "ホワイト",     hex: "#f5f5f0", code: "" },
  { id: "th-black",  name: "ブラック",     hex: "#1a1a1a", code: "" },
  { id: "th-red",    name: "レッド",       hex: "#c8102e", code: "" },
  { id: "th-wine",   name: "エンジ",       hex: "#7b1e3b", code: "" },
  { id: "th-pink",   name: "ピンク",       hex: "#e88fb1", code: "" },
  { id: "th-orange", name: "オレンジ",     hex: "#e8721c", code: "" },
  { id: "th-gold",   name: "ゴールド",     hex: "#b8860b", code: "" },
  { id: "th-yellow", name: "イエロー",     hex: "#f2c400", code: "" },
  { id: "th-lime",   name: "黄緑",         hex: "#8db600", code: "" },
  { id: "th-green",  name: "グリーン",     hex: "#1e7d46", code: "" },
  { id: "th-forest", name: "深緑",         hex: "#14452f", code: "" },
  { id: "th-sky",    name: "水色",         hex: "#6ec3e0", code: "" },
  { id: "th-blue",   name: "ブルー",       hex: "#1e5aa8", code: "" },
  { id: "th-navy",   name: "ネイビー",     hex: "#1b2a4a", code: "" },
  { id: "th-purple", name: "パープル",     hex: "#6a3d9a", code: "" },
  { id: "th-brown",  name: "ブラウン",     hex: "#6b4226", code: "" },
  { id: "th-beige",  name: "ベージュ",     hex: "#d9c7a7", code: "" },
  { id: "th-gray",   name: "グレー",       hex: "#8a8d90", code: "" },
  { id: "th-silver", name: "シルバー",     hex: "#c0c4c8", code: "" },
  { id: "th-kin",    name: "金糸",         hex: "#d4af37", code: "" },
];

/* ---------- シルクスクリーン用インクパレット（16色） ----------
 * code: 実際の指定色（例 Pantone 186C / DIC 156 等）。入稿指示書に出力されます。 */
const INK_COLORS = [
  { id: "ink-white",  name: "ホワイト",   hex: "#ffffff", code: "" },
  { id: "ink-black",  name: "ブラック",   hex: "#111111", code: "" },
  { id: "ink-red",    name: "レッド",     hex: "#d7263d", code: "" },
  { id: "ink-wine",   name: "ワイン",     hex: "#8e2043", code: "" },
  { id: "ink-pink",   name: "ピンク",     hex: "#f06ea9", code: "" },
  { id: "ink-orange", name: "オレンジ",   hex: "#f4771f", code: "" },
  { id: "ink-yellow", name: "イエロー",   hex: "#ffcf1b", code: "" },
  { id: "ink-lime",   name: "ライム",     hex: "#9acd32", code: "" },
  { id: "ink-green",  name: "グリーン",   hex: "#189a5a", code: "" },
  { id: "ink-sky",    name: "スカイ",     hex: "#3fb7e4", code: "" },
  { id: "ink-blue",   name: "ブルー",     hex: "#2260b0", code: "" },
  { id: "ink-navy",   name: "ネイビー",   hex: "#20304f", code: "" },
  { id: "ink-purple", name: "パープル",   hex: "#7a4bbf", code: "" },
  { id: "ink-brown",  name: "ブラウン",   hex: "#7a4a28", code: "" },
  { id: "ink-gray",   name: "グレー",     hex: "#9098a0", code: "" },
  { id: "ink-gold",   name: "ゴールド",   hex: "#caa64b", code: "" },
];

/* ---------- プリント・加工方法 ----------
 * fee 系の配列は QTY_TIERS の区分に対応した「1枚・1箇所あたりの加工賃」。
 * sizeClasses: デザインの実寸（長辺）からサイズ区分を自動判定します。 */
const METHODS = {
  embroidery: {
    id: "embroidery",
    name: "刺繍",
    short: "刺繍",
    icon: "🧵",
    desc: "糸の立体感で高級感を演出。ロゴ・ネーム入れに最適。写真は不可。",
    colorMode: "palette",          // 使用色をパレットから選ぶ
    palette: "thread",
    maxColors: 6,                  // 1箇所あたり最大糸色数
    allowImages: false,            // 写真・画像の刺繍は不可
    setupFee: { label: "型代（刺繍データ作成費）", perColor: false, amount: 15000 },
    sizeClasses: [
      { id: "S", label: "Sサイズ（長辺8cmまで）",  maxMm: 80,  fee: [800, 650, 550, 480, 420, 380] },
      { id: "M", label: "Mサイズ（長辺15cmまで）", maxMm: 150, fee: [1500, 1250, 1050, 900, 780, 700] },
      { id: "L", label: "Lサイズ（長辺25cmまで）", maxMm: 250, fee: [2600, 2200, 1900, 1650, 1450, 1300] },
    ],
  },
  silk: {
    id: "silk",
    name: "シルクスクリーン",
    short: "シルク",
    icon: "🖨",
    desc: "1〜4色のデザイン向け。枚数が多いほど1枚あたりが割安になります。",
    colorMode: "palette",
    palette: "ink",
    maxColors: 4,
    allowImages: false,            // フルカラー画像は不可（単色化が必要）
    setupFee: { label: "版代", perColor: true, amount: 8800 },   // 1色・1箇所ごと
    colorFees: [                   // 使用色数ごとの1枚あたり加工賃
      { colors: 1, fee: [550, 380, 300, 250, 200, 160] },
      { colors: 2, fee: [900, 640, 520, 440, 360, 290] },
      { colors: 3, fee: [1250, 900, 730, 620, 510, 410] },
      { colors: 4, fee: [1600, 1150, 940, 800, 660, 530] },
    ],
  },
  inkjet: {
    id: "inkjet",
    name: "インクジェット（フルカラー）",
    short: "フルカラー",
    icon: "🎨",
    desc: "写真やグラデーションもそのままプリント。版代不要で1枚から。",
    colorMode: "free",             // 色数無制限
    maxColors: Infinity,
    allowImages: true,
    setupFee: null,
    sizeClasses: [
      { id: "S", label: "Sサイズ（長辺10cmまで）", maxMm: 100, fee: [900, 700, 600, 520, 450, 390] },
      { id: "M", label: "Mサイズ（長辺25cmまで）", maxMm: 250, fee: [1400, 1100, 950, 820, 700, 600] },
      { id: "L", label: "Lサイズ（長辺40cmまで）", maxMm: 400, fee: [1900, 1500, 1250, 1080, 920, 800] },
    ],
  },
};

/* ---------- 商品ボディカラーの共通定義 ---------- */
const BODY_COLORS = {
  white:    { id: "white",    name: "ホワイト",       hex: "#ffffff", dark: false },
  black:    { id: "black",    name: "ブラック",       hex: "#26262b", dark: true },
  navy:     { id: "navy",     name: "ネイビー",       hex: "#2a3554", dark: true },
  red:      { id: "red",      name: "レッド",         hex: "#c53042", dark: true },
  royal:    { id: "royal",    name: "ロイヤルブルー", hex: "#2f5eb5", dark: true },
  daisy:    { id: "daisy",    name: "デイジー",       hex: "#f4c530", dark: false },
  forest:   { id: "forest",   name: "フォレスト",     hex: "#2e5b41", dark: true },
  gray:     { id: "gray",     name: "杢グレー",       hex: "#b9bcc0", dark: false },
  burgundy: { id: "burgundy", name: "バーガンディ",   hex: "#742d3d", dark: true },
  pink:     { id: "pink",     name: "ライトピンク",   hex: "#f2c6d3", dark: false },
  natural:  { id: "natural",  name: "ナチュラル",     hex: "#ece5d4", dark: false },
  sax:      { id: "sax",      name: "サックス",       hex: "#a8c8e4", dark: false },
};

const pick = (...ids) => ids.map((id) => BODY_COLORS[id]);

/* ---------- 商品マスタ ----------
 * printAreas: モックアップ(700×760 viewBox)上のプリント可能範囲。
 *   x/y/w/h = 画面上の位置(px)、mmW/mmH = 実寸(mm)。px→mm換算に使用。
 *   view: "front"（前面表示） or "back"（背面表示）
 * methods: この商品で選べる加工方法 */
const PRODUCTS = [
  {
    id: "tshirt",
    name: "定番Tシャツ 5.6oz",
    category: "Tシャツ",
    basePrice: 890,
    note: "綿100%・ヘビーウェイト。イベント・チームウェアの定番。",
    /* 実写真モックアップ（グレー無地1枚→全色を自動生成）。
     * autoColor: true で、選択カラーに応じて写真を色替え（陰影は保持）。
     * baseLum は元写真の平均明度（0-1）。濃色は暗く・淡色は明るく振れる基準。 */
    photos: {
      autoColor: true,
      baseLum: 0.41,
      /* 面ごとに元写真の明度が異なる（前面はグレー・背面/側面は白無地）ため面別に指定 */
      baseLumByView: { back: 0.77, sleeveL: 0.74, sleeveR: 0.74 },
      front: "assets/products/tshirt_front.png",
      back: "assets/products/tshirt_back.png",
      sleeveL: "assets/products/tshirt_sideL.png",
      sleeveR: "assets/products/tshirt_sideR.png",
    },
    sizes: ["S", "M", "L", "XL", "XXL"],
    sizeSurcharge: { XXL: 110 },
    colors: pick("white", "black", "navy", "red", "royal", "daisy", "forest", "gray", "burgundy", "pink"),
    mockup: "tshirt",
    methods: ["silk", "inkjet", "embroidery"],
    /* 写真使用時のプリント範囲（写真の胸・袖・背面の位置に合わせる） */
    photoAreas: [
      { id: "front",   name: "前面",   view: "front", x: 258, y: 250, w: 210, h: 250, mmW: 300, mmH: 360 },
      { id: "chest",   name: "左胸",   view: "front", x: 398, y: 250, w: 78,  h: 78,  mmW: 100, mmH: 100 },
      { id: "back",    name: "背面",   view: "back",  x: 235, y: 200, w: 230, h: 300, mmW: 300, mmH: 384 },
      { id: "sleeveL", name: "左袖",   view: "sleeveL", x: 250, y: 170, w: 130, h: 104, mmW: 80, mmH: 64 },
      { id: "sleeveR", name: "右袖",   view: "sleeveR", x: 320, y: 170, w: 130, h: 104, mmW: 80, mmH: 64 },
    ],
    printAreas: [
      { id: "front",   name: "前面",   view: "front", x: 225, y: 235, w: 250, h: 300, mmW: 300, mmH: 360 },
      { id: "chest",   name: "左胸",   view: "front", x: 385, y: 215, w: 85,  h: 85,  mmW: 100, mmH: 100 },
      { id: "back",    name: "背面",   view: "back",  x: 225, y: 215, w: 250, h: 320, mmW: 300, mmH: 384 },
      { id: "sleeveL", name: "左袖",   view: "sleeveL", x: 230, y: 288, w: 240, h: 192, mmW: 80,  mmH: 64 },
      { id: "sleeveR", name: "右袖",   view: "sleeveR", x: 230, y: 288, w: 240, h: 192, mmW: 80,  mmH: 64 },
    ],
  },
  {
    id: "drytshirt",
    name: "ドライTシャツ 4.4oz",
    category: "Tシャツ",
    basePrice: 980,
    note: "吸汗速乾ポリエステル。スポーツ・部活に。",
    /* 定番Tシャツと同じ実写真を流用（形状が同一のため） */
    photos: {
      autoColor: true,
      baseLum: 0.41,
      baseLumByView: { back: 0.77, sleeveL: 0.74, sleeveR: 0.74 },
      front: "assets/products/tshirt_front.png",
      back: "assets/products/tshirt_back.png",
      sleeveL: "assets/products/tshirt_sideL.png",
      sleeveR: "assets/products/tshirt_sideR.png",
    },
    sizes: ["S", "M", "L", "XL", "XXL"],
    sizeSurcharge: { XXL: 110 },
    colors: pick("white", "black", "navy", "red", "royal", "daisy", "forest", "sax"),
    mockup: "tshirt",
    methods: ["silk", "inkjet", "embroidery"],
    photoAreas: [
      { id: "front",   name: "前面",   view: "front", x: 258, y: 250, w: 210, h: 250, mmW: 300, mmH: 360 },
      { id: "chest",   name: "左胸",   view: "front", x: 398, y: 250, w: 78,  h: 78,  mmW: 100, mmH: 100 },
      { id: "back",    name: "背面",   view: "back",  x: 235, y: 200, w: 230, h: 300, mmW: 300, mmH: 384 },
      { id: "sleeveL", name: "左袖",   view: "sleeveL", x: 250, y: 170, w: 130, h: 104, mmW: 80, mmH: 64 },
      { id: "sleeveR", name: "右袖",   view: "sleeveR", x: 320, y: 170, w: 130, h: 104, mmW: 80, mmH: 64 },
    ],
    printAreas: [
      { id: "front",   name: "前面",   view: "front", x: 225, y: 235, w: 250, h: 300, mmW: 300, mmH: 360 },
      { id: "chest",   name: "左胸",   view: "front", x: 385, y: 215, w: 85,  h: 85,  mmW: 100, mmH: 100 },
      { id: "back",    name: "背面",   view: "back",  x: 225, y: 215, w: 250, h: 320, mmW: 300, mmH: 384 },
      { id: "sleeveL", name: "左袖",   view: "sleeveL", x: 230, y: 288, w: 240, h: 192, mmW: 80,  mmH: 64 },
      { id: "sleeveR", name: "右袖",   view: "sleeveR", x: 230, y: 288, w: 240, h: 192, mmW: 80,  mmH: 64 },
    ],
  },
  {
    id: "polo",
    name: "ドライポロシャツ",
    category: "ポロシャツ",
    basePrice: 1480,
    note: "ユニフォーム・制服に。左胸刺繍が人気です。",
    photos: {
      autoColor: true,
      baseLum: 0.90,
      baseLumByView: { back: 0.79, sleeveL: 0.75, sleeveR: 0.73 },
      front: "assets/products/polo_front.png",
      back: "assets/products/polo_back.png",
      sleeveL: "assets/products/polo_sideL.png",
      sleeveR: "assets/products/polo_sideR.png",
    },
    sizes: ["S", "M", "L", "XL", "XXL"],
    sizeSurcharge: { XXL: 130 },
    colors: pick("white", "black", "navy", "red", "royal", "forest", "gray", "sax"),
    mockup: "polo",
    methods: ["silk", "inkjet", "embroidery"],
    photoAreas: [
      { id: "chest",   name: "左胸",   view: "front", x: 384, y: 232, w: 84,  h: 84,  mmW: 100, mmH: 100 },
      { id: "front",   name: "前面",   view: "front", x: 238, y: 296, w: 224, h: 214, mmW: 280, mmH: 255 },
      { id: "back",    name: "背面",   view: "back",  x: 240, y: 205, w: 220, h: 300, mmW: 300, mmH: 372 },
      { id: "sleeveL", name: "左袖",   view: "sleeveL", x: 315, y: 180, w: 130, h: 102, mmW: 80,  mmH: 63 },
      { id: "sleeveR", name: "右袖",   view: "sleeveR", x: 255, y: 180, w: 130, h: 102, mmW: 80,  mmH: 63 },
    ],
    printAreas: [
      { id: "chest",   name: "左胸",   view: "front", x: 388, y: 235, w: 85,  h: 85,  mmW: 100, mmH: 100 },
      { id: "front",   name: "前面",   view: "front", x: 235, y: 320, w: 230, h: 210, mmW: 280, mmH: 255 },
      { id: "back",    name: "背面",   view: "back",  x: 225, y: 225, w: 250, h: 310, mmW: 300, mmH: 372 },
      { id: "sleeveL", name: "左袖",   view: "sleeveL", x: 230, y: 289, w: 240, h: 189, mmW: 80,  mmH: 63 },
      { id: "sleeveR", name: "右袖",   view: "sleeveR", x: 230, y: 289, w: 240, h: 189, mmW: 80,  mmH: 63 },
    ],
  },
  {
    id: "hoodie",
    name: "スウェットパーカー 10oz",
    category: "パーカー",
    basePrice: 2980,
    note: "裏毛スウェット。クラスパーカー・チームパーカーに。",
    photos: {
      autoColor: true,
      baseLum: 0.88,
      baseLumByView: { back: 0.78, sleeveL: 0.73, sleeveR: 0.76 },
      front: "assets/products/hoodie_front.png",
      back: "assets/products/hoodie_back.png",
      sleeveL: "assets/products/hoodie_sideL.png",
      sleeveR: "assets/products/hoodie_sideR.png",
    },
    sizes: ["S", "M", "L", "XL", "XXL"],
    sizeSurcharge: { XXL: 220 },
    colors: pick("white", "black", "navy", "red", "gray", "burgundy", "forest", "pink"),
    mockup: "hoodie",
    methods: ["silk", "inkjet", "embroidery"],
    photoAreas: [
      { id: "front",   name: "前面",   view: "front", x: 250, y: 285, w: 210, h: 170, mmW: 260, mmH: 200 },
      { id: "back",    name: "背面",   view: "back",  x: 245, y: 235, w: 210, h: 250, mmW: 300, mmH: 360 },
      { id: "sleeveL", name: "左袖",   view: "sleeveL", x: 300, y: 200, w: 120, h: 200, mmW: 75,  mmH: 140 },
      { id: "sleeveR", name: "右袖",   view: "sleeveR", x: 280, y: 200, w: 120, h: 200, mmW: 75,  mmH: 140 },
    ],
    printAreas: [
      { id: "front",   name: "前面",   view: "front", x: 240, y: 300, w: 220, h: 170, mmW: 260, mmH: 200 },
      { id: "back",    name: "背面",   view: "back",  x: 225, y: 235, w: 250, h: 300, mmW: 300, mmH: 360 },
      { id: "sleeveL", name: "左袖",   view: "sleeveL", x: 280, y: 254, w: 140, h: 260, mmW: 75,  mmH: 140 },
      { id: "sleeveR", name: "右袖",   view: "sleeveR", x: 280, y: 254, w: 140, h: 260, mmW: 75,  mmH: 140 },
    ],
  },
  {
    id: "cap",
    name: "ツイルローキャップ",
    category: "キャップ",
    basePrice: 1280,
    note: "コットンツイル。フロント刺繍でショップキャップに。",
    photos: {
      autoColor: true,
      baseLum: 0.87,
      baseLumByView: { back: 0.73, capSide: 0.79 },
      front: "assets/products/cap_front.png",
      back: "assets/products/cap_back.png",
      capSide: "assets/products/cap_side.png",
    },
    sizes: ["FREE"],
    sizeSurcharge: {},
    colors: pick("white", "black", "navy", "red", "daisy", "forest", "natural"),
    mockup: "cap",
    methods: ["embroidery", "silk"],
    photoAreas: [
      { id: "capFront", name: "フロント", view: "front",   x: 285, y: 250, w: 150, h: 130, mmW: 130, mmH: 84 },
      { id: "capSide",  name: "サイド",   view: "capSide", x: 290, y: 262, w: 150, h: 85,  mmW: 70,  mmH: 46 },
      { id: "capBack",  name: "バック",   view: "back",    x: 275, y: 300, w: 150, h: 95,  mmW: 90,  mmH: 49 },
    ],
    printAreas: [
      { id: "capFront", name: "フロント", view: "front",   x: 265, y: 300, w: 170, h: 110, mmW: 130, mmH: 84 },
      { id: "capSide",  name: "サイド",   view: "capSide", x: 290, y: 262, w: 150, h: 85,  mmW: 70,  mmH: 46 },
      { id: "capBack",  name: "バック",   view: "back",    x: 290, y: 330, w: 120, h: 65,  mmW: 90,  mmH: 49 },
    ],
  },
  {
    id: "tote",
    name: "キャンバストートバッグ M",
    category: "バッグ",
    basePrice: 780,
    note: "厚手キャンバス。ノベルティ・ショップバッグに。",
    photos: {
      autoColor: true,
      baseLum: 0.86,
      front: "assets/products/tote_front.png",
    },
    sizes: ["FREE"],
    sizeSurcharge: {},
    colors: pick("natural", "white", "black", "navy", "red", "forest"),
    mockup: "tote",
    methods: ["silk", "inkjet", "embroidery"],
    photoAreas: [
      { id: "front", name: "前面", view: "front", x: 205, y: 330, w: 290, h: 270, mmW: 260, mmH: 240 },
    ],
    printAreas: [
      { id: "front", name: "前面", view: "front", x: 215, y: 300, w: 270, h: 250, mmW: 260, mmH: 240 },
      { id: "back",  name: "背面", view: "back",  x: 215, y: 300, w: 270, h: 250, mmW: 260, mmH: 240 },
    ],
  },
  {
    id: "towel",
    name: "フェイスタオル（今治製）",
    category: "タオル",
    basePrice: 980,
    note: "名入れ刺繍で記念品・卒団記念に人気。",
    sizes: ["FREE"],
    sizeSurcharge: {},
    colors: pick("white", "pink", "sax", "daisy", "gray"),
    mockup: "towel",
    methods: ["embroidery", "inkjet"],
    printAreas: [
      { id: "corner", name: "端部（ネーム位置）", view: "front", x: 420, y: 420, w: 190, h: 80, mmW: 200, mmH: 84 },
      { id: "center", name: "中央",               view: "front", x: 180, y: 220, w: 340, h: 180, mmW: 360, mmH: 190 },
    ],
  },
];

/* ---------- テキスト用フォント ----------
 * Google Fonts を index.html で読み込んでいます（オフライン時は
 * fallback のシステムフォントで表示されます）。 */
const FONTS = [
  /* ---- 和文・スタンダード ---- */
  { id: "gothic",     name: "ゴシック体",         family: "'Noto Sans JP', 'Hiragino Kaku Gothic ProN', sans-serif", weight: 700 },
  { id: "zenkaku",    name: "モダンゴシック",     family: "'Zen Kaku Gothic New', sans-serif", weight: 700 },
  { id: "dela",       name: "極太ゴシック",       family: "'Dela Gothic One', 'Arial Black', sans-serif", weight: 400 },
  { id: "mincho",     name: "明朝体",             family: "'Shippori Mincho B1', 'Hiragino Mincho ProN', serif", weight: 600 },
  { id: "zenmincho",  name: "クラシック明朝",     family: "'Zen Old Mincho', serif", weight: 700 },
  { id: "tokumin",    name: "見出し明朝",         family: "'Kaisei Tokumin', serif", weight: 700 },
  /* ---- 丸・ポップ ---- */
  { id: "maru",       name: "丸ゴシック",         family: "'Zen Maru Gothic', 'Hiragino Maru Gothic ProN', sans-serif", weight: 700 },
  { id: "mplusr",     name: "まんまる太丸",       family: "'M PLUS Rounded 1c', sans-serif", weight: 800 },
  { id: "kiwi",       name: "やわらか丸",         family: "'Kiwi Maru', serif", weight: 500 },
  { id: "pop",        name: "ポップ体",           family: "'Mochiy Pop One', sans-serif", weight: 400 },
  { id: "potta",      name: "ぽってり",           family: "'Potta One', cursive", weight: 400 },
  { id: "hachimaru",  name: "ゆめかわ手書き",     family: "'Hachi Maru Pop', cursive", weight: 400 },
  { id: "cherry",     name: "チアフル",           family: "'Cherry Bomb One', cursive", weight: 400 },
  /* ---- 元気・スポーツ・ディスプレイ ---- */
  { id: "rocknroll",  name: "ロックン体",         family: "'RocknRoll One', sans-serif", weight: 400 },
  { id: "reggae",     name: "応援団",             family: "'Reggae One', cursive", weight: 400 },
  { id: "rampart",    name: "袋文字",             family: "'Rampart One', cursive", weight: 400 },
  { id: "train",      name: "アウトライン",       family: "'Train One', cursive", weight: 400 },
  { id: "monomaniac", name: "ロゴ風デジタル",     family: "'Monomaniac One', sans-serif", weight: 400 },
  { id: "dot",        name: "ドット文字",         family: "'DotGothic16', sans-serif", weight: 400 },
  { id: "stick",      name: "スティック",         family: "'Stick', sans-serif", weight: 400 },
  /* ---- 手書き・毛筆 ---- */
  { id: "fude",       name: "毛筆体",             family: "'Yuji Syuku', serif", weight: 400 },
  { id: "yujimai",    name: "毛筆・舞",           family: "'Yuji Mai', serif", weight: 400 },
  { id: "tegaki",     name: "手書き風",           family: "'Yomogi', cursive", weight: 400 },
  { id: "yusei",      name: "マジック手書き",     family: "'Yusei Magic', sans-serif", weight: 400 },
  { id: "klee",       name: "教科書手書き",       family: "'Klee One', cursive", weight: 600 },
  { id: "tegomin",    name: "手書き明朝",         family: "'New Tegomin', serif", weight: 400 },
  { id: "kaiseidecol", name: "デコ明朝",          family: "'Kaisei Decol', serif", weight: 700 },
  { id: "shipporiant", name: "アンティーク",      family: "'Shippori Antique B1', sans-serif", weight: 400 },
  /* ---- 欧文 ---- */
  { id: "anton",      name: "インパクト(欧文)",   family: "'Anton', Impact, sans-serif", weight: 400 },
  { id: "bebas",      name: "スポーツ縦長(欧文)", family: "'Bebas Neue', sans-serif", weight: 400 },
  { id: "oswald",     name: "コンデンス(欧文)",   family: "'Oswald', sans-serif", weight: 600 },
  { id: "montserrat", name: "モダン(欧文)",       family: "'Montserrat', sans-serif", weight: 800 },
  { id: "archivo",    name: "極太(欧文)",         family: "'Archivo Black', sans-serif", weight: 400 },
  { id: "alfaslab",   name: "スラブ極太(欧文)",   family: "'Alfa Slab One', serif", weight: 400 },
  { id: "russo",      name: "テック(欧文)",       family: "'Russo One', sans-serif", weight: 400 },
  { id: "blackops",   name: "ステンシル(欧文)",   family: "'Black Ops One', cursive", weight: 400 },
  { id: "righteous",  name: "レトロ(欧文)",       family: "'Righteous', sans-serif", weight: 400 },
  { id: "bangers",    name: "コミック(欧文)",     family: "'Bangers', cursive", weight: 400 },
  { id: "luckiest",   name: "ポップ(欧文)",       family: "'Luckiest Guy', cursive", weight: 400 },
  { id: "serifEn",    name: "セリフ(欧文)",       family: "'Playfair Display', Georgia, serif", weight: 600 },
  { id: "script",     name: "筆記体(欧文)",       family: "'Pacifico', 'Brush Script MT', cursive", weight: 400 },
  { id: "dancing",    name: "筆記体エレガント(欧文)", family: "'Dancing Script', cursive", weight: 700 },
  { id: "caveat",     name: "ペン手書き(欧文)",   family: "'Caveat', cursive", weight: 700 },
  { id: "marker",     name: "マーカー(欧文)",     family: "'Permanent Marker', cursive", weight: 400 },
  { id: "pressstart", name: "8bitゲーム(欧文)",   family: "'Press Start 2P', cursive", weight: 400 },
];

/* ---------- フリーカラー（インクジェット用テキスト・スタンプの色） ---------- */
const FREE_COLORS = [
  "#111111", "#ffffff", "#d7263d", "#f4771f", "#ffcf1b", "#189a5a",
  "#3fb7e4", "#2260b0", "#20304f", "#7a4bbf", "#f06ea9", "#7a4a28",
  "#9098a0", "#caa64b", "#8e2043", "#9acd32",
];

/* ---------- エクスポート（ブラウザ / Node 両対応） ---------- */
const CONFIG = { SHOP, LEGAL, ORDER, QTY_TIERS, THREAD_COLORS, INK_COLORS, METHODS, PRODUCTS, FONTS, FREE_COLORS, BODY_COLORS };

if (typeof module !== "undefined" && module.exports) {
  module.exports = CONFIG;
} else {
  globalThis.CONFIG = CONFIG;
}
