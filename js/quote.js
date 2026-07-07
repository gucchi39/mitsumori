/* =========================================================================
 * quote.js — 自動見積もりエンジン
 *
 * 入力（商品・数量・配置デザインの情報）から見積もり明細を計算する
 * 純粋関数のみのモジュール。ブラウザと Node.js（テスト）の両方で動きます。
 * ========================================================================= */
(function () {
  "use strict";

  const CFG =
    typeof module !== "undefined" && module.exports
      ? require("./config.js")
      : globalThis.CONFIG;

  const { SHOP, QTY_TIERS, METHODS, PRODUCTS } = CFG;

  /** 合計数量から数量スライド区分のインデックスを返す */
  function tierIndexFor(totalQty) {
    let idx = 0;
    for (let i = 0; i < QTY_TIERS.length; i++) {
      if (totalQty >= QTY_TIERS[i].min) idx = i;
    }
    return idx;
  }

  /** デザイン実寸（長辺mm）からサイズ区分を返す。超過時は最大区分＋警告扱い */
  function sizeClassFor(method, longestMm) {
    const classes = method.sizeClasses || [];
    for (const c of classes) {
      if (longestMm <= c.maxMm) return { cls: c, over: false };
    }
    return { cls: classes[classes.length - 1] || null, over: classes.length > 0 };
  }

  /** 金額の円表記 */
  function yen(n) {
    return "¥" + Math.round(n).toLocaleString("ja-JP");
  }

  /**
   * 見積もり計算のメイン関数
   * @param {object} input
   *   productId : 商品ID
   *   quantities: { サイズ名: 枚数 }
   *   placements: [{ areaId, areaName, methodId, colorCount, widthMm, heightMm, hasImage, objectCount }]
   * @returns 見積もり結果オブジェクト
   */
  function computeQuote(input) {
    const warnings = [];
    const errors = [];

    const product = PRODUCTS.find((p) => p.id === input.productId);
    if (!product) {
      return { ok: false, errors: ["商品が選択されていません。"], warnings, lines: [] };
    }

    /* --- 数量 --- */
    const quantities = input.quantities || {};
    let totalQty = 0;
    for (const size of product.sizes) {
      const q = Math.max(0, Math.floor(Number(quantities[size]) || 0));
      totalQty += q;
    }
    if (totalQty < SHOP.minOrderQty) {
      return {
        ok: false,
        errors: [`数量を入力してください（最小 ${SHOP.minOrderQty} 枚から）。`],
        warnings,
        lines: [],
        totalQty: 0,
      };
    }

    const tierIdx = tierIndexFor(totalQty);
    const tierLabel = QTY_TIERS[tierIdx].label;
    const lines = [];

    /* --- 商品代（サイズ別・XXL等の加算込み） --- */
    let goodsAmount = 0;
    for (const size of product.sizes) {
      const q = Math.max(0, Math.floor(Number(quantities[size]) || 0));
      if (q === 0) continue;
      const unit = product.basePrice + (product.sizeSurcharge[size] || 0);
      const amount = unit * q;
      goodsAmount += amount;
      lines.push({
        type: "goods",
        label: `${product.name}（${size}）`,
        detail: product.sizeSurcharge[size] ? `サイズ加算 +${yen(product.sizeSurcharge[size])}` : "",
        unitPrice: unit,
        qty: q,
        amount,
      });
    }

    /* --- 加工代（プリント位置ごと） --- */
    let printAmount = 0;
    let setupAmount = 0;
    const placements = (input.placements || []).filter((p) => p.objectCount > 0);

    if (placements.length === 0) {
      warnings.push("デザインが未作成のため、商品のみ（無地）の見積もりです。");
    }

    for (const pl of placements) {
      const method = METHODS[pl.methodId];
      const areaLabel = pl.areaName || pl.areaId;
      if (!method) {
        errors.push(`${areaLabel}: 加工方法が不明です。`);
        continue;
      }
      if (!product.methods.includes(method.id)) {
        warnings.push(`${areaLabel}: ${method.name}はこの商品では対応していません。`);
      }
      if (pl.hasImage && !method.allowImages) {
        warnings.push(`${areaLabel}: ${method.name}では写真・画像は再現できません。フルカラープリントをご検討ください。`);
      }

      const longest = Math.max(pl.widthMm || 0, pl.heightMm || 0);
      let feePerPiece = 0;
      let detail = "";

      if (method.id === "silk") {
        let colors = Math.max(1, pl.colorCount || 1);
        if (colors > method.maxColors) {
          warnings.push(`${areaLabel}: シルクスクリーンは最大${method.maxColors}色までです（現在${colors}色）。`);
          colors = method.maxColors;
        }
        const row = method.colorFees.find((r) => r.colors === colors);
        feePerPiece = row.fee[tierIdx];
        detail = `${colors}色 / ${Math.round(longest) || "-"}mm`;
        const setup = method.setupFee.amount * colors;
        setupAmount += setup;
        lines.push({
          type: "setup",
          label: `${method.setupFee.label}（${areaLabel}）`,
          detail: `${yen(method.setupFee.amount)} × ${colors}色`,
          unitPrice: setup,
          qty: 1,
          amount: setup,
        });
      } else {
        /* 刺繍・インクジェットはサイズ区分制 */
        const { cls, over } = sizeClassFor(method, longest);
        if (!cls) {
          errors.push(`${areaLabel}: 料金区分が見つかりません。`);
          continue;
        }
        if (over) {
          warnings.push(`${areaLabel}: デザインが最大サイズ（${cls.maxMm}mm）を超えています。最大区分で計算します。`);
        }
        feePerPiece = cls.fee[tierIdx];
        detail = `${cls.id}サイズ / 長辺 ${Math.round(longest)}mm`;

        if (method.id === "embroidery") {
          let colors = Math.max(1, pl.colorCount || 1);
          if (colors > method.maxColors) {
            warnings.push(`${areaLabel}: 刺繍は最大${method.maxColors}色までです（現在${colors}色）。`);
          }
          detail = `糸${Math.min(colors, method.maxColors)}色 / ` + detail;
          const setup = method.setupFee.amount;
          setupAmount += setup;
          lines.push({
            type: "setup",
            label: `${method.setupFee.label}（${areaLabel}）`,
            detail: "初回のみ",
            unitPrice: setup,
            qty: 1,
            amount: setup,
          });
        }
      }

      const amount = feePerPiece * totalQty;
      printAmount += amount;
      lines.push({
        type: "print",
        label: `${method.name}（${areaLabel}）`,
        detail,
        unitPrice: feePerPiece,
        qty: totalQty,
        amount,
      });
    }

    /* --- 集計 ---
     * 商品・加工（版代/型代含む）は税抜。消費税はこの税抜小計にのみ課税する。
     * 送料は config で税込（税込880円 等）と定義されるため、二重課税しないよう
     * 課税対象に含めず、税額計算後に加算する。 */
    const subtotal = goodsAmount + printAmount + setupAmount; // 税抜
    const shipping = subtotal >= SHOP.freeShippingMin ? 0 : SHOP.shippingFee; // 税込
    const tax = roundTax(subtotal * SHOP.taxRate);
    const total = subtotal + tax + shipping;
    /* 参考単価（税込・送料除く）。丸めるため perPiece×数量 は総額と数円ずれ得る。 */
    const perPiece = Math.round((subtotal + tax) / totalQty);

    return {
      ok: errors.length === 0,
      errors,
      warnings,
      product,
      totalQty,
      tierIdx,
      tierLabel,
      lines,
      goodsAmount,
      printAmount,
      setupAmount,
      subtotal,
      shipping,
      shippingFree: shipping === 0,
      tax,
      total,
      perPiece,
    };
  }

  /* 消費税の端数処理。事業者の会計方針に合わせて config で切替可能
   * （SHOP.taxRounding: "floor" 切捨て / "round" 四捨五入 / "ceil" 切上げ） */
  function roundTax(v) {
    const mode = (SHOP && SHOP.taxRounding) || "floor";
    if (mode === "round") return Math.round(v);
    if (mode === "ceil") return Math.ceil(v);
    return Math.floor(v);
  }

  const API = { computeQuote, tierIndexFor, sizeClassFor, yen };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = API;
  } else {
    globalThis.Quote = API;
  }
})();
