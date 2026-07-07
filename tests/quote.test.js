/* 見積もりエンジンのユニットテスト
 * 実行方法: node --test tests/quote.test.js */
const { test } = require("node:test");
const assert = require("node:assert");
const { computeQuote, tierIndexFor, sizeClassFor } = require("../js/quote.js");
const CONFIG = require("../js/config.js");

test("数量スライド区分の境界値", () => {
  assert.equal(tierIndexFor(1), 0);
  assert.equal(tierIndexFor(9), 0);
  assert.equal(tierIndexFor(10), 1);
  assert.equal(tierIndexFor(19), 1);
  assert.equal(tierIndexFor(20), 2);
  assert.equal(tierIndexFor(30), 3);
  assert.equal(tierIndexFor(50), 4);
  assert.equal(tierIndexFor(99), 4);
  assert.equal(tierIndexFor(100), 5);
  assert.equal(tierIndexFor(500), 5);
});

test("サイズ区分の自動判定（刺繍）", () => {
  const emb = CONFIG.METHODS.embroidery;
  assert.equal(sizeClassFor(emb, 50).cls.id, "S");
  assert.equal(sizeClassFor(emb, 80).cls.id, "S");
  assert.equal(sizeClassFor(emb, 81).cls.id, "M");
  assert.equal(sizeClassFor(emb, 250).cls.id, "L");
  const over = sizeClassFor(emb, 300);
  assert.equal(over.cls.id, "L");
  assert.equal(over.over, true);
});

test("数量ゼロはエラー", () => {
  const r = computeQuote({ productId: "tshirt", quantities: {}, placements: [] });
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /数量/);
});

test("商品のみ（無地）: サイズ加算と警告", () => {
  const r = computeQuote({
    productId: "tshirt",
    quantities: { M: 5, XXL: 2 },
    placements: [],
  });
  assert.equal(r.ok, true);
  assert.equal(r.totalQty, 7);
  // 890×5 + (890+110)×2 = 4450 + 2000 = 6450
  assert.equal(r.goodsAmount, 6450);
  assert.ok(r.warnings.some((w) => w.includes("無地")));
  // 送料: 30000未満なので 880（税込・課税対象外）
  assert.equal(r.shipping, 880);
  // 税は税抜小計にのみ課税: floor(6450*0.1)=645（送料は二重課税しない）
  assert.equal(r.tax, 645);
  assert.equal(r.total, 6450 + 645 + 880);
});

test("シルクスクリーン2色・20枚: 版代と数量スライド", () => {
  const r = computeQuote({
    productId: "tshirt",
    quantities: { M: 20 },
    placements: [
      { areaId: "front", areaName: "前面", methodId: "silk", colorCount: 2, widthMm: 250, heightMm: 200, hasImage: false, objectCount: 2 },
    ],
  });
  assert.equal(r.ok, true);
  assert.equal(r.tierIdx, 2); // 20〜29枚
  // 加工賃: 2色 tier2 = 520円 × 20枚
  assert.equal(r.printAmount, 520 * 20);
  // 版代: 8800 × 2色
  assert.equal(r.setupAmount, 8800 * 2);
  assert.equal(r.goodsAmount, 890 * 20);
});

test("シルク5色は4色に丸めて警告", () => {
  const r = computeQuote({
    productId: "tshirt",
    quantities: { L: 10 },
    placements: [
      { areaId: "front", areaName: "前面", methodId: "silk", colorCount: 5, widthMm: 100, heightMm: 100, hasImage: false, objectCount: 1 },
    ],
  });
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some((w) => w.includes("最大4色")));
  assert.equal(r.setupAmount, 8800 * 4);
});

test("刺繍: 型代＋サイズ区分M", () => {
  const r = computeQuote({
    productId: "polo",
    quantities: { M: 10 },
    placements: [
      { areaId: "chest", areaName: "左胸", methodId: "embroidery", colorCount: 3, widthMm: 90, heightMm: 40, hasImage: false, objectCount: 1 },
    ],
  });
  assert.equal(r.ok, true);
  assert.equal(r.setupAmount, 15000);
  // 長辺90mm → M区分, tier1(10〜19枚) = 1250円
  assert.equal(r.printAmount, 1250 * 10);
});

test("刺繍に画像を使うと警告", () => {
  const r = computeQuote({
    productId: "tshirt",
    quantities: { M: 10 },
    placements: [
      { areaId: "front", areaName: "前面", methodId: "embroidery", colorCount: 2, widthMm: 70, heightMm: 70, hasImage: true, objectCount: 1 },
    ],
  });
  assert.ok(r.warnings.some((w) => w.includes("再現できません")));
});

test("インクジェット: 版代なし・送料無料ライン", () => {
  const r = computeQuote({
    productId: "hoodie",
    quantities: { L: 20 },
    placements: [
      { areaId: "back", areaName: "背面", methodId: "inkjet", colorCount: 0, widthMm: 280, heightMm: 200, hasImage: true, objectCount: 1 },
    ],
  });
  assert.equal(r.ok, true);
  assert.equal(r.setupAmount, 0);
  // 商品 2980×20=59600 → 30000超で送料無料
  assert.equal(r.shipping, 0);
  // 長辺280mm → L区分, tier2 = 1250円
  assert.equal(r.printAmount, 1250 * 20);
});

test("複数箇所の組み合わせ（前面シルク＋左胸刺繍）", () => {
  const r = computeQuote({
    productId: "tshirt",
    quantities: { S: 10, M: 20, L: 20 },
    placements: [
      { areaId: "front", areaName: "前面", methodId: "silk", colorCount: 1, widthMm: 300, heightMm: 300, hasImage: false, objectCount: 1 },
      { areaId: "chest", areaName: "左胸", methodId: "embroidery", colorCount: 2, widthMm: 75, heightMm: 30, hasImage: false, objectCount: 1 },
    ],
  });
  assert.equal(r.ok, true);
  assert.equal(r.totalQty, 50);
  assert.equal(r.tierIdx, 4);
  // シルク1色 tier4=200, 刺繍S tier4=420
  assert.equal(r.printAmount, 200 * 50 + 420 * 50);
  assert.equal(r.setupAmount, 8800 + 15000);
  // 明細行の整合性: 各行 amount = unitPrice × qty（送料は明細行に含めず別計上）
  for (const line of r.lines) {
    assert.equal(line.amount, line.unitPrice * line.qty, line.label);
  }
  // 合計 = 小計（税抜） + 税 + 送料（税込）
  assert.equal(r.total, r.subtotal + r.tax + r.shipping);
});

test("対応していない加工方法は警告（タオル×シルク）", () => {
  const r = computeQuote({
    productId: "towel",
    quantities: { FREE: 10 },
    placements: [
      { areaId: "corner", areaName: "端部", methodId: "silk", colorCount: 1, widthMm: 100, heightMm: 40, hasImage: false, objectCount: 1 },
    ],
  });
  assert.ok(r.warnings.some((w) => w.includes("対応していません")));
});

test("送料は税込のため二重課税しない（消費税は税抜小計のみ）", () => {
  // 送料無料ライン未満で送料が発生するケース
  const r = computeQuote({
    productId: "tshirt",
    quantities: { M: 10 }, // 890×10 = 8900（税抜）
    placements: [],
  });
  assert.equal(r.subtotal, 8900);
  assert.equal(r.shipping, 880);
  assert.equal(r.tax, Math.floor(8900 * 0.1)); // 890、送料には課税しない
  assert.equal(r.total, 8900 + 890 + 880);
  // 明細行に送料は含めない（別計上）
  assert.ok(!r.lines.some((l) => l.type === "shipping"));
});

test("未知の加工方法IDでもクラッシュせずエラーを返す", () => {
  const r = computeQuote({
    productId: "tshirt",
    quantities: { M: 10 },
    placements: [
      { areaId: "front", areaName: "前面", methodId: "unknown_method", colorCount: 1, widthMm: 100, heightMm: 100, hasImage: false, objectCount: 1 },
    ],
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.length > 0);
});
