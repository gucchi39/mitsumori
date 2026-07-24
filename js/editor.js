/* =========================================================================
 * editor.js — SVGデザインエディタ
 *
 * モックアップ上のプリント範囲にテキスト・スタンプ・画像を配置し、
 * ドラッグ移動／拡大縮小／回転／レイヤー操作／undo-redo を提供します。
 * 見積もりエンジンに渡す配置情報（色数・実寸・画像有無）もここで算出します。
 * ========================================================================= */
(function () {
  "use strict";

  const VB_W = 700, VB_H = 760;
  let svg = null;
  let callbacks = { onChange: () => {}, onSelect: () => {} };
  let measureCtx = null;
  /* index.html の Google Fonts <link> URL（エクスポートSVGに @import で埋め込む） */
  let FONT_IMPORT_URL = "";

  const state = {
    product: null,
    colorId: null,
    areaId: null,
    designs: {},            // { areaId: { methodId, objects: [] } }
    selectedId: null,
    zoom: 1,
    panX: 0,                // 表示のパン量（ステージ座標）
    panY: 0,
    showGrid: false,
    preview: false,
    worn: false,            // 着用イメージ（背景＋トルソー）表示
  };

  let realismOn = true;     // リアル質感フィルタ（入稿書き出し時のみ false）
  let wornPrevPreview = false; // 着用イメージON直前のプレビュー状態（OFFで復元して編集に戻す）
  let interacting = false;  // ドラッグ中は重いフィルタを外す（タブレットで滑らかに＆当たり判定を正確に）

  let undoStack = [];
  let redoStack = [];
  let idSeq = 1;

  /* ---------------- ユーティリティ ---------------- */

  function uid() { return "obj" + (idSeq++) + "_" + Math.random().toString(36).slice(2, 7); }

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* 属性コンテキストの数値を安全化（NaN/文字列混入・XSS を防ぐ） */
  function n(v) { const x = Number(v); return isFinite(x) ? x : 0; }
  /* CSSカラーとして安全な値のみ許可（16進 or "none"）。それ以外は黒へ */
  function safeColor(v) {
    if (typeof v === "string" && (/^#[0-9a-fA-F]{3,8}$/.test(v) || v === "none")) return v;
    return "#111111";
  }
  /* 画像は data:image/... のみ許可（javascript: 等を排除） */
  function safeHref(v) {
    return typeof v === "string" && /^data:image\//.test(v) ? v : "";
  }
  function isValidFontId(id) { return CONFIG.FONTS.some((f) => f.id === id); }

  /* ---- 信頼できない入力（共有URL・読込JSON・自動保存）の無害化 ----
   * これらは attacker 制御になり得るため、既知の型・値のみへ作り直す。 */
  function numOr(v, def, min, max) {
    let x = Number(v);
    if (!isFinite(x)) x = def;
    if (min != null) x = Math.max(min, x);
    if (max != null) x = Math.min(max, x);
    return x;
  }
  function sanitizeObject(raw) {
    if (!raw || typeof raw !== "object") return null;
    const base = {
      id: typeof raw.id === "string" && /^[\w-]{1,40}$/.test(raw.id) ? raw.id : uid(),
      x: numOr(raw.x, VB_W / 2), y: numOr(raw.y, VB_H / 2),
      scale: numOr(raw.scale, 1, 0.02, 40), rotation: numOr(raw.rotation, 0),
    };
    if (raw.type === "text") {
      return Object.assign(base, {
        type: "text",
        text: String(raw.text == null ? "" : raw.text).slice(0, 200),
        fontId: isValidFontId(raw.fontId) ? raw.fontId : "gothic",
        fontSize: numOr(raw.fontSize, 40, 4, 400),
        fill: safeColor(raw.fill), stroke: safeColor(raw.stroke),
        strokeWidth: numOr(raw.strokeWidth, 0, 0, 40),
        letterSpacing: numOr(raw.letterSpacing, 0, -50, 200),
        arch: numOr(raw.arch, 0, -100, 100),
        vertical: !!raw.vertical,
      });
    }
    if (raw.type === "stamp") {
      if (!Stamps.getStamp(raw.stampId)) return null;
      return Object.assign(base, { type: "stamp", stampId: raw.stampId, fill: safeColor(raw.fill), flipX: !!raw.flipX });
    }
    if (raw.type === "image") {
      const href = safeHref(raw.href);
      if (!href) return null;
      return Object.assign(base, {
        type: "image", href,
        natW: numOr(raw.natW, 100, 1), natH: numOr(raw.natH, 100, 1),
        w: numOr(raw.w, 100, 1), h: numOr(raw.h, 100, 1), flipX: !!raw.flipX,
      });
    }
    return null;
  }
  /* designs 全体を無害化。未知の methodId は先頭の対応方法へ寄せる */
  /* 保存データのエリア座標が現行と食い違う場合の救済：
   * あるエリアのオブジェクト群の中心がそのプリント範囲から大きく外れていたら、
   * 相対配置を保ったまま範囲中央へ平行移動する（クリップで消えるのを防ぐ）。 */
  function migrateOffAreaObjects(product) {
    /* 判定は「実効版面」（写真表示中は photoAreas、無ければ printAreas。表示・
     * クリップと同じ判定）に対して行う。printAreas 優先で判定すると、写真版面に
     * 正しく置かれた保存データが「範囲外」扱いされて版面中央へ誤移動し、
     * リロード後にクリップで消える（load は colorId 設定後に呼ぶこと） */
    const areaById = {};
    for (const a of productAreas(product)) areaById[a.id] = a;
    for (const [areaId, d] of Object.entries(state.designs || {})) {
      const a = areaById[areaId];
      if (!a || !d.objects || !d.objects.length) continue;
      let sx = 0, sy = 0;
      for (const o of d.objects) { sx += n(o.x); sy += n(o.y); }
      const avgX = sx / d.objects.length, avgY = sy / d.objects.length;
      const mx = a.w * 0.1, my = a.h * 0.1;
      const outside = avgX < a.x - mx || avgX > a.x + a.w + mx || avgY < a.y - my || avgY > a.y + a.h + my;
      if (!outside) continue;
      const dx = (a.x + a.w / 2) - avgX, dy = (a.y + a.h / 2) - avgY;
      for (const o of d.objects) { o.x = n(o.x) + dx; o.y = n(o.y) + dy; }
    }
  }

  /* 色替えで実効版面が入れ替わった（photoAreas ⇄ printAreas）エリアの
   * オブジェクトを、旧版面→新版面へ相対位置を保って写像する。
   * 色別写真の商品では photoFor が colorId に依存するため、写真の無い色へ
   * 切り替えると版面ジオメトリが変わる。座標を放置すると見切れ・クリップ・
   * 採寸ズレになる（Codex指摘）。px/mm 比も版面ごとに違うため scale も補正し、
   * 実寸(mm)は変えない。 */
  function remapDesignsForAreaChange(before, after) {
    for (const a2 of after) {
      const a1 = before.find((b) => b.id === a2.id);
      if (!a1) continue;
      if (a1.x === a2.x && a1.y === a2.y && a1.w === a2.w && a1.h === a2.h) continue;
      const d = state.designs[a2.id];
      if (!d || !d.objects || !d.objects.length) continue;
      const rw = (a2.w / (a2.mmW || 1)) / (a1.w / (a1.mmW || 1));
      const rh = (a2.h / (a2.mmH || 1)) / (a1.h / (a1.mmH || 1));
      const r = (rw + rh) / 2;
      for (const o of d.objects) {
        const fx = (n(o.x) - a1.x) / a1.w, fy = (n(o.y) - a1.y) / a1.h;
        o.x = a2.x + fx * a2.w;
        o.y = a2.y + fy * a2.h;
        o.scale = Math.max(0.05, n(o.scale) * r);
      }
    }
  }

  /* 商品切替の引き継ぎ後、プリント範囲に収まらないオブジェクトを自動で
   * 縮小・移動して範囲内へ収める（DOM採寸が必要なため描画後に実行）。 */
  function fitOversizeObjects(areas) {
    return withVisibleStage(() => {
      const savedArea = state.areaId;
      for (const a of areas) {
        const d = state.designs[a.id];
        if (!d || !d.objects || !d.objects.length) continue;
        if (state.areaId !== a.id) { state.areaId = a.id; render(); }
        for (const o of d.objects) {
          let bb = objStageBBox(o);
          if (!bb || !bb.w || !bb.h) continue;
          const s = Math.min(1, (a.w * 0.94) / bb.w, (a.h * 0.94) / bb.h);
          if (s < 1) { o.scale = Math.max(0.05, n(o.scale) * s); render(); bb = objStageBBox(o); }
          if (!bb) continue;
          let dx = 0, dy = 0;
          if (bb.x < a.x) dx = a.x - bb.x;
          else if (bb.x + bb.w > a.x + a.w) dx = (a.x + a.w) - (bb.x + bb.w);
          if (bb.y < a.y) dy = a.y - bb.y;
          else if (bb.y + bb.h > a.y + a.h) dy = (a.y + a.h) - (bb.y + bb.h);
          if (dx || dy) { o.x = n(o.x) + dx; o.y = n(o.y) + dy; render(); }
        }
      }
      if (state.areaId !== savedArea) state.areaId = savedArea;
      render();
    });
  }

  function sanitizeDesigns(rawDesigns, product) {
    const clean = {};
    const validAreas = new Set([...(product.printAreas||[]), ...(product.photoAreas||[])].map((a) => a.id));
    for (const [areaId, d] of Object.entries(rawDesigns || {})) {
      if (!validAreas.has(areaId) || !d || typeof d !== "object") continue;
      const methodId = product.methods.includes(d.methodId) ? d.methodId : product.methods[0];
      const objects = Array.isArray(d.objects) ? d.objects.map(sanitizeObject).filter(Boolean) : [];
      clean[areaId] = { methodId, objects };
    }
    return clean;
  }

  /* 実効プリント範囲：写真モックアップが「実際に表示される」色・面だけ photoAreas を使う。
   * 写真が無い色・面はイラスト表示にフォールバックするため、版面も printAreas に
   * 合わせないと点線枠・入稿座標が商品とズレる。判定は表示側と同じ Mockups.photoFor。 */
  function productAreas(p) {
    p = p || state.product;
    if (!p) return [];
    const pas = p.photoAreas;
    if (!(pas && pas.length && p.photos)) return p.printAreas;
    return p.printAreas.map((a) => {
      const photo = Mockups.photoFor ? Mockups.photoFor(p, state.colorId, a.view || "front") : null;
      return photo ? (pas.find((x) => x.id === a.id) || a) : a;
    });
  }

  function currentArea() {
    if (!state.product) return null;
    return productAreas().find((a) => a.id === state.areaId) || null;
  }

  function design(areaId) {
    const key = areaId || state.areaId;
    if (!state.designs[key]) {
      state.designs[key] = { methodId: state.product ? state.product.methods[0] : null, objects: [] };
    }
    return state.designs[key];
  }

  function selectedObj() {
    if (!state.selectedId) return null;
    for (const d of Object.values(state.designs)) {
      const o = d.objects.find((o) => o.id === state.selectedId);
      if (o) return o;
    }
    return null;
  }

  function bodyHex() {
    const c = state.product.colors.find((c) => c.id === state.colorId) || state.product.colors[0];
    return c.hex;
  }

  function svgPoint(evt) {
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  /* 1行の実寸幅（字間込み）を canvas で計測 */
  function measureLine(obj, line) {
    if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
    const font = CONFIG.FONTS.find((f) => f.id === obj.fontId) || CONFIG.FONTS[0];
    measureCtx.font = `${font.weight} ${n(obj.fontSize)}px ${font.family}`;
    const s = line == null ? String(obj.text || " ") : String(line);
    return measureCtx.measureText(s).width + (Number(obj.letterSpacing) || 0) * Math.max(0, s.length - 1);
  }

  /* テキストの実寸幅（最長行）と行配列 */
  function measureText(obj) {
    const lines = String(obj.text || " ").split("\n");
    let w = 0;
    for (const line of lines) w = Math.max(w, measureLine(obj, line));
    return { w, lines };
  }

  /* ---------------- 履歴 ---------------- */

  /* 直前のコミット済み状態を保持し、変更「前」の状態を履歴に積む */
  let lastSnapshot = null;

  function snapshot() {
    return JSON.stringify({ designs: state.designs });
  }
  function commit() {
    if (lastSnapshot !== null) {
      undoStack.push(lastSnapshot);
      if (undoStack.length > 60) undoStack.shift();
    }
    lastSnapshot = snapshot();
    redoStack = [];
    render();
    callbacks.onChange();
  }
  function undo() {
    if (!undoStack.length) return;
    redoStack.push(lastSnapshot !== null ? lastSnapshot : snapshot());
    const prev = undoStack.pop();
    state.designs = JSON.parse(prev).designs;
    lastSnapshot = prev;
    state.selectedId = null;
    render();
    callbacks.onChange();
    callbacks.onSelect(null);
  }
  function redo() {
    if (!redoStack.length) return;
    undoStack.push(lastSnapshot !== null ? lastSnapshot : snapshot());
    const next = redoStack.pop();
    state.designs = JSON.parse(next).designs;
    lastSnapshot = next;
    state.selectedId = null;
    render();
    callbacks.onChange();
    callbacks.onSelect(null);
  }

  /* ---------------- オブジェクト描画 ---------------- */

  function textMarkup(obj) {
    const font = CONFIG.FONTS.find((f) => f.id === obj.fontId) || CONFIG.FONTS[0];
    const common = `font-family="${esc(font.family)}" font-weight="${font.weight}" font-size="${n(obj.fontSize)}"` +
      ` fill="${safeColor(obj.fill)}" letter-spacing="${n(obj.letterSpacing)}"` +
      (obj.strokeWidth > 0 ? ` stroke="${safeColor(obj.stroke)}" stroke-width="${n(obj.strokeWidth)}" paint-order="stroke" stroke-linejoin="round"` : "");
    const arch = Number(obj.arch) || 0;
    const { w, lines } = measureText(obj);

    /* 縦書き（1行 = 1列、右から左へ） */
    if (obj.vertical) {
      const lh = n(obj.fontSize) * 1.15;
      const cols = lines.length;
      return lines.map((line, i) =>
        `<text ${common} x="${((cols - 1) / 2 - i) * lh}" y="0" text-anchor="middle" dominant-baseline="central"` +
        ` style="writing-mode:vertical-rl;text-orientation:upright">${esc(line) || "　"}</text>`
      ).join("");
    }

    if (arch !== 0 && lines.length) {
      /* 弦長は「結合後テキスト」の実幅から算出（1行幅だと複数行で後半が消える） */
      const joinedW = measureLine({ ...obj, text: lines.join("　") });
      const chord = Math.max(joinedW, w, 20);
      const s = (arch / 100) * chord * 0.4;
      const R = (chord * chord / 4 + s * s) / (2 * Math.abs(s));
      const sweep = arch > 0 ? 1 : 0;
      const d = `M ${-chord / 2} ${s / 2} A ${R} ${R} 0 0 ${sweep} ${chord / 2} ${s / 2}`;
      return `<path id="tp-${esc(obj.id)}" d="${d}" fill="none"/>` +
        `<text ${common} dominant-baseline="central"><textPath href="#tp-${esc(obj.id)}" startOffset="50%" text-anchor="middle">${esc(lines.join("　"))}</textPath></text>`;
    }
    const lh = n(obj.fontSize) * 1.15;
    const y0 = -((lines.length - 1) * lh) / 2;
    const tspans = lines
      .map((line, i) => `<tspan x="0" y="${y0 + i * lh}">${esc(line) || " "}</tspan>`)
      .join("");
    return `<text ${common} text-anchor="middle" dominant-baseline="central">${tspans}</text>`;
  }

  function stampMarkup(obj) {
    const st = Stamps.getStamp(obj.stampId);
    if (!st) return "";
    return `<g transform="translate(-60 -60) scale(1.2)">${Stamps.renderStamp(st, safeColor(obj.fill))}</g>`;
  }

  function imageMarkup(obj) {
    const href = safeHref(obj.href);
    if (!href) return "";
    const e = esc(href);
    /* href(SVG2)と xlink:href(旧Illustrator互換) を両方付与し画像欠落を防ぐ */
    return `<image href="${e}" xlink:href="${e}" x="${-n(obj.w) / 2}" y="${-n(obj.h) / 2}" width="${n(obj.w)}" height="${n(obj.h)}" preserveAspectRatio="xMidYMid meet"/>`;
  }

  function objMarkup(obj, editable) {
    let inner = "";
    if (obj.type === "text") inner = textMarkup(obj);
    else if (obj.type === "stamp") inner = stampMarkup(obj);
    else if (obj.type === "image") inner = imageMarkup(obj);
    const flip = obj.flipX ? " scale(-1 1)" : "";
    return `<g class="obj${editable ? " editable" : ""}" data-id="${esc(obj.id)}"` +
      ` transform="translate(${n(obj.x)} ${n(obj.y)}) rotate(${n(obj.rotation)}) scale(${n(obj.scale)})${flip}">` +
      `<g class="obj-inner">${inner}</g></g>`;
  }

  /* プリント範囲の案内ラベル。加工方法に長辺上限がある場合は併記して
   * 「案内サイズいっぱいに作ると毎回警告が出る」矛盾を避ける */
  function areaSizeLabel(a) {
    const base = `最大 ${a.mmW / 10}×${a.mmH / 10}cm`;
    const method = CONFIG.METHODS[design(a.id).methodId];
    if (method && method.sizeClasses && method.sizeClasses.length) {
      const maxLong = method.sizeClasses[method.sizeClasses.length - 1].maxMm;
      if (maxLong < Math.max(a.mmW, a.mmH)) {
        return `${base}／${method.short}は長辺${maxLong / 10}cmまで`;
      }
    }
    return base;
  }

  /* ---------------- ステージ描画 ---------------- */

  function applyViewBox() {
    const w = VB_W / state.zoom, h = VB_H / state.zoom;
    svg.setAttribute("viewBox", `${(VB_W - w) / 2 - state.panX} ${(VB_H - h) / 2 - state.panY} ${w} ${h}`);
  }

  /* パン量を「はみ出し過ぎない」範囲にクランプ */
  function clampPan() {
    const margin = 0.6; // ステージの6割まで動かせる
    const lim = Math.max(VB_W, VB_H) * margin;
    state.panX = Math.max(-lim, Math.min(lim, state.panX));
    state.panY = Math.max(-lim, Math.min(lim, state.panY));
  }

  /* クライアントpx → ステージ座標系の距離換算係数 */
  function stageUnitsPerPx() {
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return 1;
    return (VB_W / state.zoom) / rect.width;
  }

  /* リアル表示用フィルタ（画面・プレビューのみ。入稿データには適用しない）
   * ・fxEmb   刺繍：立体ステッチ（ハイライト＋微細ノイズ＋落ち影）
   * ・fxInk   プリント：生地に乗った質感（ごく僅かな歪み＋柔らか影）
   * ・fxGarment 商品：写真のような落ち影で立体感 */
  const FX_DEFS = `
    <filter id="fxEmb" x="-25%" y="-25%" width="150%" height="150%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="1.1" result="b"/>
      <feSpecularLighting in="b" surfaceScale="2.2" specularConstant="0.85" specularExponent="16" lighting-color="#ffffff" result="s">
        <feDistantLight azimuth="235" elevation="58"/>
      </feSpecularLighting>
      <feComposite in="s" in2="SourceAlpha" operator="in" result="sc"/>
      <feTurbulence type="turbulence" baseFrequency="0.85 0.045" numOctaves="2" seed="7" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.16 0" result="st"/>
      <feComposite in="st" in2="SourceAlpha" operator="in" result="stc"/>
      <feMerge result="m"><feMergeNode in="SourceGraphic"/><feMergeNode in="sc"/><feMergeNode in="stc"/></feMerge>
      <feDropShadow dx="0" dy="1.1" stdDeviation="0.9" flood-color="#000" flood-opacity="0.38"/>
    </filter>
    <filter id="fxInk" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="4" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="0.7" result="d"/>
      <feDropShadow in="d" dx="0" dy="0.5" stdDeviation="0.4" flood-color="#000" flood-opacity="0.13"/>
    </filter>
    <filter id="fxGarment" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="7" stdDeviation="9" flood-color="#1a2036" flood-opacity="0.20"/>
    </filter>`;

  function methodFilter(methodId) {
    if (methodId === "embroidery") return "fxEmb";
    return "fxInk"; // silk / inkjet
  }

  function render() {
    if (!svg || !state.product) return;
    const area = currentArea();
    const view = area ? area.view : "front";
    const areasInView = productAreas().filter((a) => a.view === view);
    const fx = realismOn && !interacting; // 入稿書き出し・ドラッグ中は無効

    const clipDefs = areasInView
      .map((a) => `<clipPath id="clip-${a.id}"><rect x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}"/></clipPath>`)
      .join("");
    const defs = clipDefs + (fx ? FX_DEFS : "");

    /* 着用イメージ：商品の背後にスタジオ背景＋トルソー（前面・背面のみ） */
    const backdrop = fx && state.worn && (view === "front" || view === "back") ? Mockups.wornBackdrop(state.product, view) : "";
    const rawMockup = Mockups.renderProductMockup(state.product, bodyHex(), state.colorId, view);
    const mockup = fx ? `<g filter="url(#fxGarment)">${rawMockup}</g>` : rawMockup;

    let gridMarkup = "";
    if (state.showGrid && !state.preview) {
      let linesArr = [];
      for (let gx = 0; gx <= VB_W; gx += 25) linesArr.push(`M${gx} 0 V${VB_H}`);
      for (let gy = 0; gy <= VB_H; gy += 25) linesArr.push(`M0 ${gy} H${VB_W}`);
      gridMarkup = `<path d="${linesArr.join(" ")}" stroke="rgba(50,90,180,0.12)" stroke-width="1" fill="none" pointer-events="none"/>`;
    }

    /* プリント範囲の枠線 */
    let areaMarkup = "";
    /* 袖の側面ビューは写真に対して矩形枠が不自然に見えるため、点線枠と
     * ラベルを表示しない（版面自体は生きていて、配置・採寸・クリップは従来通り。
     * ドラッグ中の中央スナップガイドも従来通り出る） */
    const hideAreaFrame = String(view || "").indexOf("sleeve") === 0;
    if (!state.preview && !hideAreaFrame) {
      areaMarkup = areasInView
        .map((a) => {
          const active = area && a.id === area.id;
          return `<g pointer-events="none">
            <rect x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}" fill="none"
              stroke="${active ? "#b8891f" : "rgba(120,130,150,0.45)"}" stroke-width="${active ? 2.5 : 1.5}"
              stroke-dasharray="8 6"/>
            ${active ? `<text x="${a.x + 4}" y="${a.y - 8}" font-size="17" fill="#b8891f" font-family="sans-serif">${esc(a.name)}（${esc(areaSizeLabel(a))}）</text>` : ""}
          </g>`;
        })
        .join("");
    }

    /* オブジェクト（同じビューの他の位置のデザインも表示する）。
     * 加工方法ごとのリアル質感フィルタを位置グループ単位で適用（画面のみ）。 */
    const objectsMarkup = areasInView
      .map((a) => {
        const d = state.designs[a.id];
        if (!d || !d.objects.length) return "";
        const editable = area && a.id === area.id;
        const filt = fx ? ` filter="url(#${methodFilter(d.methodId)})"` : "";
        return `<g clip-path="url(#clip-${a.id})"><g${filt}>${d.objects.map((o) => objMarkup(o, editable)).join("")}</g></g>`;
      })
      .join("");

    svg.innerHTML = `<defs>${defs}</defs>${backdrop}${mockup}${gridMarkup}<g id="objectLayer">${objectsMarkup}</g>${areaMarkup}<g id="selLayer"></g>`;
    applyViewBox();
    renderSelection();
  }

  /* 選択枠とハンドル */
  function renderSelection() {
    const layer = svg.querySelector("#selLayer");
    if (!layer) return;
    layer.innerHTML = "";
    if (state.preview) return;
    const obj = selectedObj();
    if (!obj) return;
    const node = svg.querySelector(`.obj[data-id="${obj.id}"] .obj-inner`);
    if (!node) return;
    let bb;
    try { bb = node.getBBox(); } catch (e) { return; }
    if (!bb || (!bb.width && !bb.height)) return;

    const pad = 8 / obj.scale;
    const x = bb.x - pad, y = bb.y - pad, w = bb.width + pad * 2, h = bb.height + pad * 2;
    /* タッチ端末では掴みやすいよう大きめに */
    const baseR = matchMedia("(pointer: coarse)").matches ? 17 : 11;
    const handleR = baseR / obj.scale;

    /* 中央スナップガイド（ドラッグ中のみ） */
    const area = currentArea();
    let guides = "";
    if (drag && drag.mode === "move" && area) {
      if (dragGuides.v) guides += `<line x1="${area.x + area.w / 2}" y1="${area.y - 24}" x2="${area.x + area.w / 2}" y2="${area.y + area.h + 24}" stroke="#b8891f" stroke-width="1.5" stroke-dasharray="5 4"/>`;
      if (dragGuides.h) guides += `<line x1="${area.x - 24}" y1="${area.y + area.h / 2}" x2="${area.x + area.w + 24}" y2="${area.y + area.h / 2}" stroke="#b8891f" stroke-width="1.5" stroke-dasharray="5 4"/>`;
    }
    /* 枠・接続線はクリックを透過させ（pointer-events:none）、ハンドルだけ
     * 受け付ける。透過しないと、選択中のオブジェクトへの右ドラッグ（移動）や
     * 再クリックが枠線・接続線に横取りされて効かないことがある */
    layer.innerHTML = guides + `<g pointer-events="none" transform="translate(${obj.x} ${obj.y}) rotate(${obj.rotation}) scale(${obj.scale})">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#2d7ff9" stroke-width="${2 / obj.scale}" stroke-dasharray="${6 / obj.scale} ${4 / obj.scale}"/>
      <line x1="0" y1="${y}" x2="0" y2="${y - 26 / obj.scale}" stroke="#2d7ff9" stroke-width="${2 / obj.scale}"/>
      <circle data-handle="rotate" pointer-events="all" cx="0" cy="${y - 32 / obj.scale}" r="${handleR}" fill="#fff" stroke="#2d7ff9" stroke-width="${2 / obj.scale}" style="cursor:grab"/>
      <rect data-handle="scale" pointer-events="all" x="${x + w - handleR}" y="${y + h - handleR}" width="${handleR * 2}" height="${handleR * 2}" fill="#2d7ff9" stroke="#fff" stroke-width="${1.5 / obj.scale}" style="cursor:nwse-resize"/>
      <g data-handle="delete" pointer-events="all" style="cursor:pointer">
        <circle cx="${x + w + 18 / obj.scale}" cy="${y}" r="${handleR}" fill="#e5484d"/>
        <path d="M ${x + w + 18 / obj.scale - 4.5 / obj.scale} ${y - 4.5 / obj.scale} l ${9 / obj.scale} ${9 / obj.scale} M ${x + w + 18 / obj.scale + 4.5 / obj.scale} ${y - 4.5 / obj.scale} l ${-9 / obj.scale} ${9 / obj.scale}" stroke="#fff" stroke-width="${2.2 / obj.scale}" stroke-linecap="round"/>
      </g>
    </g>`;
  }

  /* ---------------- ポインタ操作 ---------------- */

  let drag = null; // { mode, startPt, obj, orig... }
  const dragGuides = { v: false, h: false }; // 中央スナップの発動状態
  const pointers = new Map();  // アクティブなポインタ（マルチタッチ検出用）
  let pinch = null;            // { startDist, startZoom, startMid, startPanX, startPanY }

  function capture(evt) {
    try { svg.setPointerCapture(evt.pointerId); } catch (e) { /* 合成イベント等では失敗し得る */ }
  }

  function startPinchIfTwo() {
    if (pointers.size !== 2) return false;
    const [a, b] = Array.from(pointers.values());
    /* オブジェクト操作中に2本目が触れたら、移動分を onPointerUp と同様に確定してから
     * ピンチに移行（放置すると interacting が残って質感フィルタが戻らず、
     * 移動が undo/自動保存/見積もりにも反映されない） */
    if (drag) {
      const d = drag;
      drag = null;
      dragGuides.v = dragGuides.h = false;
      const wasInteracting = interacting;
      interacting = false;
      if (d.mode !== "pan" && d.moved) commit();
      else if (wasInteracting) render();
    }
    dragGuides.v = dragGuides.h = false;
    pinch = {
      startDist: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)),
      startZoom: state.zoom,
      startMid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      startPanX: state.panX,
      startPanY: state.panY,
    };
    renderSelection();
    return true;
  }

  function onPointerDown(evt) {
    if (!state.product || state.preview) return;
    /* マウスの役割分担（ユーザー指定・2026-07確定）：
     *  - 左ボタン: 選択・ハンドル操作（拡大/回転/削除）・空白ドラッグでパン。
     *    オブジェクトの「移動」はしない（うっかりズレの防止）
     *  - 右ボタン: オブジェクトの移動ドラッグ専用（stage上はメニュー抑止済み）
     *  - タッチ・ペン: 従来通りドラッグで移動（button は 0/-1） */
    const isMouse = evt.pointerType === "mouse";
    if (isMouse && evt.button !== 0 && evt.button !== 2) return; // 中ボタン等は無視
    const rightBtn = isMouse && evt.button === 2;
    pointers.set(evt.pointerId, { x: evt.clientX, y: evt.clientY });
    if (startPinchIfTwo()) { capture(evt); evt.preventDefault(); return; }

    const pt = svgPoint(evt);
    const handleEl = !rightBtn ? evt.target.closest("[data-handle]") : null;
    const obj = selectedObj();

    if (handleEl && obj) {
      const mode = handleEl.getAttribute("data-handle");
      if (mode === "delete") {
        deleteSelected();
        return;
      }
      drag = {
        mode,
        startPt: pt,
        obj,
        startScale: obj.scale,
        startRot: obj.rotation,
        startDist: Math.hypot(pt.x - obj.x, pt.y - obj.y),
        startAngle: (Math.atan2(pt.y - obj.y, pt.x - obj.x) * 180) / Math.PI,
      };
      capture(evt);
      evt.preventDefault();
      return;
    }

    const objEl = evt.target.closest(".obj.editable");
    if (objEl) {
      const id = objEl.getAttribute("data-id");
      state.selectedId = id;
      const o = selectedObj();
      if (isMouse && !rightBtn) {
        /* 左クリックは選択のみ。移動は右ドラッグで行う */
        drag = null;
        render();
        callbacks.onSelect(o);
        evt.preventDefault();
        return;
      }
      drag = { mode: "move", startPt: pt, obj: o, origX: o.x, origY: o.y };
      capture(evt);
      render();
      callbacks.onSelect(o);
      evt.preventDefault();
      return;
    }

    /* 空白ドラッグ＝パン。動かず離した場合のみ選択解除（onPointerUpで判定） */
    drag = { mode: "pan", startClient: { x: evt.clientX, y: evt.clientY }, startPanX: state.panX, startPanY: state.panY };
    capture(evt);
  }

  function onPointerMove(evt) {
    if (pointers.has(evt.pointerId)) pointers.set(evt.pointerId, { x: evt.clientX, y: evt.clientY });

    /* 2本指ピンチ：ズーム＋パン */
    if (pinch && pointers.size >= 2) {
      const [a, b] = Array.from(pointers.values());
      const dist = Math.max(10, Math.hypot(a.x - b.x, a.y - b.y));
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      state.zoom = Math.max(0.5, Math.min(4, pinch.startZoom * (dist / pinch.startDist)));
      const k = stageUnitsPerPx();
      state.panX = pinch.startPanX + (mid.x - pinch.startMid.x) * k;
      state.panY = pinch.startPanY + (mid.y - pinch.startMid.y) * k;
      clampPan();
      applyViewBox();
      evt.preventDefault();
      return;
    }

    if (!drag) return;

    if (drag.mode === "pan") {
      const dx = evt.clientX - drag.startClient.x;
      const dy = evt.clientY - drag.startClient.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      const k = stageUnitsPerPx();
      state.panX = drag.startPanX + dx * k;
      state.panY = drag.startPanY + dy * k;
      clampPan();
      applyViewBox();
      return;
    }

    const pt = svgPoint(evt);
    const o = drag.obj;
    const area = currentArea();
    drag.moved = true; // 実際に動いた場合のみ履歴に積む（選択クリックでは積まない）
    interacting = true; // ドラッグ中はフィルタを外して軽く描画

    if (drag.mode === "move") {
      let nx = drag.origX + (pt.x - drag.startPt.x);
      let ny = drag.origY + (pt.y - drag.startPt.y);
      if (area) {
        nx = Math.max(area.x, Math.min(area.x + area.w, nx));
        ny = Math.max(area.y, Math.min(area.y + area.h, ny));
        /* 中央に吸着 */
        const acx = area.x + area.w / 2, acy = area.y + area.h / 2;
        dragGuides.v = Math.abs(nx - acx) < 7;
        dragGuides.h = Math.abs(ny - acy) < 7;
        if (dragGuides.v) nx = acx;
        if (dragGuides.h) ny = acy;
      }
      o.x = Math.round(nx * 10) / 10;
      o.y = Math.round(ny * 10) / 10;
    } else if (drag.mode === "scale") {
      const dist = Math.hypot(pt.x - o.x, pt.y - o.y);
      const factor = drag.startDist > 2 ? dist / drag.startDist : 1;
      o.scale = Math.max(0.08, Math.min(10, drag.startScale * factor));
    } else if (drag.mode === "rotate") {
      const ang = (Math.atan2(pt.y - o.y, pt.x - o.x) * 180) / Math.PI;
      let rot = drag.startRot + (ang - drag.startAngle);
      if (evt.shiftKey) rot = Math.round(rot / 15) * 15;
      o.rotation = Math.round(((rot % 360) + 360) % 360);
    }
    render();
  }

  function onPointerUp(evt) {
    if (evt && evt.pointerId != null) pointers.delete(evt.pointerId);
    if (pinch) {
      if (pointers.size < 2) pinch = null; // ピンチ終了（履歴には積まない＝表示操作のみ）
      return;
    }
    if (!drag) return;
    const d = drag;
    drag = null;
    dragGuides.v = dragGuides.h = false;
    const wasInteracting = interacting;
    interacting = false; // フィルタを戻す（この後の render/commit で仕上がり表示に戻る）

    if (d.mode === "pan") {
      if (wasInteracting) render();
      /* 動かさず離した＝空クリック → 選択解除 */
      if (!d.moved && state.selectedId) {
        state.selectedId = null;
        renderSelection();
        callbacks.onSelect(null);
      }
      return;
    }

    /* 単なる選択クリック（未移動）では commit しない
     * → redo履歴の破棄・無変更スナップショットの蓄積を防ぐ */
    if (d.moved) commit(); // commit() が render() を呼び、フィルタ復帰
    else if (wasInteracting) render();
    callbacks.onSelect(selectedObj());
  }

  /* ホイールでズーム（デスクトップ）。カーソル位置を中心に寄る */
  function onWheel(evt) {
    if (!state.product) return;
    evt.preventDefault();
    const factor = evt.deltaY < 0 ? 1.12 : 1 / 1.12;
    const before = svgPoint(evt);
    state.zoom = Math.max(0.5, Math.min(4, state.zoom * factor));
    applyViewBox();
    const after = svgPoint(evt);
    state.panX += after.x - before.x;
    state.panY += after.y - before.y;
    clampPan();
    applyViewBox();
  }

  /* オブジェクト中心をプリント範囲内にクランプ */
  function clampToArea(o) {
    const a = currentArea();
    if (!a) return;
    o.x = Math.max(a.x, Math.min(a.x + a.w, o.x));
    o.y = Math.max(a.y, Math.min(a.y + a.h, o.y));
  }

  function onKeyDown(evt) {
    if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) return;

    /* ショートカット（選択がなくても有効） */
    if (evt.ctrlKey || evt.metaKey) {
      const k = evt.key.toLowerCase();
      if (k === "z" && !evt.shiftKey) { undo(); evt.preventDefault(); return; }
      if ((k === "z" && evt.shiftKey) || k === "y") { redo(); evt.preventDefault(); return; }
      if (k === "d") { duplicateSelected(); evt.preventDefault(); return; }
    }

    const o = selectedObj();
    if (!o) return;
    const step = evt.shiftKey ? 10 : 2;
    let handled = true;
    switch (evt.key) {
      case "Delete":
      case "Backspace": deleteSelected(); break;
      /* 矢印移動もドラッグ同様に範囲内へクランプ（範囲外配置＝過大見積もり防止） */
      case "ArrowLeft": o.x -= step; clampToArea(o); commit(); break;
      case "ArrowRight": o.x += step; clampToArea(o); commit(); break;
      case "ArrowUp": o.y -= step; clampToArea(o); commit(); break;
      case "ArrowDown": o.y += step; clampToArea(o); commit(); break;
      default: handled = false;
    }
    if (handled) evt.preventDefault();
  }

  /* ---------------- オブジェクト操作API ---------------- */

  function areaCenter() {
    const a = currentArea();
    return a ? { x: a.x + a.w / 2, y: a.y + a.h / 2 } : { x: VB_W / 2, y: VB_H / 2 };
  }

  function addText(props) {
    const c = areaCenter();
    const obj = Object.assign(
      {
        id: uid(), type: "text", x: c.x, y: c.y, scale: 1, rotation: 0,
        text: "サンプル", fontId: "gothic", fontSize: 40,
        fill: "#111111", stroke: "#ffffff", strokeWidth: 0, letterSpacing: 0, arch: 0,
      },
      props || {}
    );
    /* プリント範囲に収まるよう自動フィット */
    const a = currentArea();
    if (a) {
      const { w, lines } = measureText(obj);
      let dw = w, dh = obj.fontSize * 1.15 * Math.max(1, lines.length);
      if (obj.vertical) {
        const maxChars = Math.max(1, ...lines.map((l) => l.length));
        dw = obj.fontSize * 1.15 * lines.length;
        dh = obj.fontSize * 1.05 * maxChars;
      }
      obj.scale = Math.min(1, (a.w * 0.85) / Math.max(dw, 1), (a.h * 0.85) / Math.max(dh, 1));
    }
    design().objects.push(obj);
    state.selectedId = obj.id;
    commit();
    callbacks.onSelect(obj);
    return obj;
  }

  function addStamp(stampId, fill) {
    const c = areaCenter();
    const a = currentArea();
    const base = 120; // スタンプの基準表示サイズ(px)
    const obj = {
      id: uid(), type: "stamp", x: c.x, y: c.y,
      scale: a ? Math.min(1, (a.w * 0.6) / base, (a.h * 0.6) / base) : 1,
      rotation: 0, stampId, fill: fill || "#111111",
    };
    design().objects.push(obj);
    state.selectedId = obj.id;
    commit();
    callbacks.onSelect(obj);
    return obj;
  }

  function addImage(dataUrl, natW, natH) {
    const a = currentArea();
    const c = areaCenter();
    const maxW = a ? a.w * 0.7 : 200;
    const maxH = a ? a.h * 0.7 : 200;
    const f = Math.min(maxW / natW, maxH / natH, 1);
    const obj = {
      id: uid(), type: "image", x: c.x, y: c.y, scale: 1, rotation: 0,
      href: dataUrl, natW, natH, w: Math.max(20, natW * f), h: Math.max(20, natH * f),
    };
    design().objects.push(obj);
    state.selectedId = obj.id;
    commit();
    callbacks.onSelect(obj);
    return obj;
  }

  /* commitNow=false で履歴を積まずにライブ更新（スライダー操作・入力中に使用） */
  function updateSelected(props, commitNow = true) {
    const o = selectedObj();
    if (!o) return;
    if (commitNow) {
      Object.assign(o, props);
      commit();
    } else {
      Object.assign(o, props);
      render();
      callbacks.onChange();
    }
  }

  /* 選択状態に依存せず、オブジェクトIDを指定して更新する。背景透過など
   * 非同期処理の完了時に使う：処理中に別オブジェクトへ選択が移っていても、
   * 依頼時点の画像にだけ適用するため（updateSelected だと今選択中のものを
   * 誤って書き換える）。見つからなければ false（削除済み等） */
  function updateObjectById(id, props) {
    if (!id) return false;
    for (const d of Object.values(state.designs || {})) {
      const o = (d.objects || []).find((x) => x.id === id);
      if (o) { Object.assign(o, props); commit(); return true; }
    }
    return false;
  }

  function deleteSelected() {
    const o = selectedObj();
    if (!o) return;
    const d = design();
    d.objects = d.objects.filter((x) => x.id !== o.id);
    state.selectedId = null;
    commit();
    callbacks.onSelect(null);
  }

  function duplicateSelected() {
    const o = selectedObj();
    if (!o) return;
    const a = currentArea();
    const copy = JSON.parse(JSON.stringify(o));
    copy.id = uid();
    copy.x += 16;
    copy.y += 16;
    if (a) {
      copy.x = Math.min(copy.x, a.x + a.w);
      copy.y = Math.min(copy.y, a.y + a.h);
    }
    design().objects.push(copy);
    state.selectedId = copy.id;
    commit();
    callbacks.onSelect(copy);
  }

  /* axis: "h"=左右中央 / "v"=上下中央 / "both" */
  function centerSelected(axis) {
    const o = selectedObj();
    const a = currentArea();
    if (!o || !a) return;
    if (axis === "h" || axis === "both") o.x = a.x + a.w / 2;
    if (axis === "v" || axis === "both") o.y = a.y + a.h / 2;
    commit();
  }

  function flipSelected() {
    const o = selectedObj();
    if (!o || o.type === "text") return;
    o.flipX = !o.flipX;
    commit();
  }

  function reorderSelected(dir) {
    const o = selectedObj();
    if (!o) return;
    const arr = design().objects;
    const i = arr.indexOf(o);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return;
    arr.splice(i, 1);
    arr.splice(j, 0, o);
    commit();
  }

  function selectObject(id) {
    state.selectedId = id;
    render();
    callbacks.onSelect(selectedObj());
  }

  /* ---------------- 見積もり連携 ---------------- */

  /* オブジェクトの変換後バウンディングボックス（ステージ座標）
   * 縁取り(stroke)は paint-order:stroke で geometry の外側へ strokeWidth/2 はみ出す
   * ため実寸に含める（含めないとサイズ区分が1段安く判定され過小請求）。 */
  function objStageBBox(obj) {
    const node = svg.querySelector(`.obj[data-id="${obj.id}"] .obj-inner`);
    if (!node) return null;
    let bb;
    try { bb = node.getBBox(); } catch (e) { return null; }
    let { x, y, width, height } = bb;
    if (obj.type === "text" && obj.strokeWidth > 0) {
      const half = obj.strokeWidth / 2;
      x -= half; y -= half; width += obj.strokeWidth; height += obj.strokeWidth;
    }
    const rad = (obj.rotation * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const corners = [
      [x, y], [x + width, y], [x, y + height], [x + width, y + height],
    ].map(([px, py]) => {
      const sx = px * obj.scale, sy = py * obj.scale;
      return [obj.x + sx * cos - sy * sin, obj.y + sx * sin + sy * cos];
    });
    const xs = corners.map((c) => c[0]), ys = corners.map((c) => c[1]);
    return {
      x: Math.min(...xs), y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys),
    };
  }

  /* 非表示画面（display:none）では getBBox が 0 を返すため、
   * 祖先要素を一時的に不可視レンダリング状態にして計測する */
  function withVisibleStage(fn) {
    const rect = svg.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return fn();
    const overrides = [];
    let el = svg.parentElement;
    while (el && el !== document.body) {
      if (getComputedStyle(el).display === "none") {
        overrides.push([el, el.getAttribute("style")]);
        el.style.cssText += ";display:block !important;visibility:hidden;position:absolute;left:-10000px;top:0;width:800px;height:800px;";
      }
      el = el.parentElement;
    }
    try {
      return fn();
    } finally {
      for (const [node, style] of overrides) {
        if (style === null) node.removeAttribute("style");
        else node.setAttribute("style", style);
      }
    }
  }

  /** 各プリント位置の見積もり用サマリを返す */
  function getPlacements(designsObj) {
    if (!state.product) return [];
    return withVisibleStage(() => {
      if (!designsObj) return getPlacementsInner();
      /* 別のデザイン集合（名簿の差し込み済み等）で採寸する。
       * objStageBBox はライブDOMの getBBox() を読むため、差し替え直後に
       * 現在ビューを必ず再レンダリングしてから採寸する（そうしないと表示中
       * エリアだけ差し替え前＝{名前}/{番号}のままのDOMを測ってしまい、
       * 長い名前・番号が見積サイズや超過警告に反映されない）。採寸後は
       * 実デザインへ戻して再描画し、DOMと state.designs の不整合を残さない。 */
      const saved = state.designs;
      state.designs = designsObj;
      render();
      try { return getPlacementsInner(); } finally { state.designs = saved; render(); }
    });
  }

  function getPlacementsInner() {
    const savedArea = state.areaId;
    const result = [];
    for (const a of productAreas()) {
      const d = state.designs[a.id];
      if (!d || !d.objects.length) continue;

      /* getBBox のために対象ビューを一時レンダリング */
      if (a.view !== (currentArea() || {}).view || a.id !== state.areaId) {
        state.areaId = a.id;
        render();
      }

      const colors = new Set();
      let hasImage = false;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      let lowRes = false;
      let minImageDpi = Infinity;
      let minTextMm = Infinity;   // 最小の文字高さ(mm)。刺繍の潰れ判定に使う
      let visibleCount = 0;       // プリント範囲に少しでも掛かるオブジェクト数
      const pxPerMm = a.w / a.mmW;
      /* 縦は縦の比率で換算する。写真版面（photoAreas）は遠近の関係で
       * 横と縦の px/mm が一致しない（capサイド等で最大16%差）。横比率で
       * 縦を割ると見積サイズ・指示書・潰れ判定が実物とズレる。
       * exportSVG は mmW×mmH で出力するため、こちらが実寸の正 */
      const pxPerMmY = a.h / a.mmH;
      const ax2 = a.x + a.w, ay2 = a.y + a.h;

      for (const o of d.objects) {
        const bb = objStageBBox(o);
        /* 範囲外（clipPathで印刷されない）オブジェクトは色数・実寸・数量に
         * 一切算入しない（範囲外へ退避した不要物で価格が膨らむのを防ぐ） */
        if (!bb) continue;
        const ix1 = Math.max(bb.x, a.x), iy1 = Math.max(bb.y, a.y);
        const ix2 = Math.min(bb.x + bb.w, ax2), iy2 = Math.min(bb.y + bb.h, ay2);
        if (ix2 <= ix1 || iy2 <= iy1) continue; // 交差なし＝範囲外

        visibleCount++;
        if (o.type === "image") {
          hasImage = true;
          const dispW = (o.w * o.scale) / pxPerMm; // mm
          const dpi = o.natW / (dispW / 25.4);
          minImageDpi = Math.min(minImageDpi, dpi);
          if (dpi < 100) lowRes = true;
        } else {
          if (o.fill) colors.add(String(o.fill).toLowerCase());
          if (o.type === "text" && o.strokeWidth > 0 && o.stroke) colors.add(String(o.stroke).toLowerCase());
          if (o.type === "text") {
            /* 刺繍の潰れ判定は「1文字の高さ」で行う。bb.h はテキストブロック全体
             * の高さのため、複数行なら行数で、縦書きなら1列の文字数で割って近似
             * する（ブロックが5mm超でも各文字が5mm未満なら実際には潰れる） */
            const lines = String(o.text || "").split("\n").filter((s) => s.length);
            const divisor = o.vertical
              ? Math.max(1, lines.reduce((m, s) => Math.max(m, s.length), 1))
              : Math.max(1, lines.length);
            const hMm = (bb.h / divisor) / pxPerMmY;
            minTextMm = Math.min(minTextMm, hMm);
          }
        }
        /* 範囲でクリップした矩形だけを実寸の union に含める */
        minX = Math.min(minX, ix1); minY = Math.min(minY, iy1);
        maxX = Math.max(maxX, ix2); maxY = Math.max(maxY, iy2);
      }

      if (visibleCount === 0) continue; // 範囲内に何も無い＝無地扱い（加工費なし）

      const wMm = Math.max(0, (maxX - minX) / pxPerMm);
      const hMm = Math.max(0, (maxY - minY) / pxPerMmY);

      result.push({
        areaId: a.id,
        areaName: a.name,
        view: a.view,
        methodId: d.methodId,
        colorCount: hasImage ? Math.max(colors.size, 1) : colors.size,
        usedColors: Array.from(colors),   // 使用色(小文字hex)。指示書で色名/コードへ逆引き
        widthMm: wMm,
        heightMm: hMm,
        hasImage,
        lowRes,
        minImageDpi: minImageDpi === Infinity ? null : minImageDpi,
        minTextMm: minTextMm === Infinity ? null : minTextMm,
        objectCount: visibleCount,
      });
    }
    if (savedArea !== state.areaId) {
      state.areaId = savedArea;
      render();
    }
    return result;
  }

  /* ---------------- テンプレート ---------------- */

  /* テンプレート定義（100×100相対座標）を実座標のオブジェクト配列に変換 */
  function mapTemplateObjects(tpl, a) {
    return tpl.objects.map((t) => {
      const base = {
        id: uid(),
        x: a.x + (t.tx / 100) * a.w,
        y: a.y + (t.ty / 100) * a.h,
        scale: 1,
        rotation: t.rotation || 0,
      };
      if (t.type === "text") {
        return Object.assign(base, {
          type: "text",
          text: t.text,
          fontId: t.fontId || "gothic",
          fontSize: Math.max(8, (t.size / 100) * a.w),
          fill: t.fill || "#111111",
          stroke: t.stroke || "#ffffff",
          strokeWidth: t.strokeWidth || 0,
          letterSpacing: t.letterSpacing || 0,
          arch: t.arch || 0,
          vertical: !!t.vertical,
        });
      }
      return Object.assign(base, {
        type: "stamp",
        stampId: t.stampId,
        fill: t.fill || "#111111",
        scale: ((t.size / 100) * a.w) / 120,
      });
    });
  }

  /** テンプレートを現在のプリント位置に適用（既存デザインは置き換え） */
  function applyTemplate(tpl) {
    const a = currentArea();
    if (!a || !tpl) return;
    design().objects = mapTemplateObjects(tpl, a);
    state.selectedId = null;
    commit();
    callbacks.onSelect(null);
  }

  /** テンプレート一覧用サムネイル */
  function templateThumbSVG(tpl) {
    const objs = mapTemplateObjects(tpl, { x: 0, y: 0, w: 100, h: 100 });
    return `<svg viewBox="-5 -5 110 110" xmlns="http://www.w3.org/2000/svg">
      <rect x="-5" y="-5" width="110" height="110" rx="6" fill="#ffffff"/>
      ${objs.map((o) => objMarkup(o, false)).join("")}</svg>`;
  }

  /* ---------------- サムネイル・エクスポート ---------------- */

  /** プリント位置選択用のミニサムネイルSVG（印刷範囲でクリップ＝はみ出しは映さない） */
  function areaThumbSVG(a) {
    const d = state.designs[a.id];
    const pad = 10;
    const cid = `thumbclip-${a.id}`;
    const inner = d && d.objects.length
      ? `<g clip-path="url(#${cid})">${d.objects.map((o) => objMarkup(o, false)).join("")}</g>`
      : "";
    return `<svg viewBox="${a.x - pad} ${a.y - pad} ${a.w + pad * 2} ${a.h + pad * 2}" xmlns="http://www.w3.org/2000/svg">
      <defs><clipPath id="${cid}"><rect x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}"/></clipPath></defs>
      <rect x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}" fill="#fff" stroke="#c8cdd6" stroke-width="2" stroke-dasharray="6 4"/>${inner}</svg>`;
  }

  /** デザインが存在するビュー（front/back）を商品順で返す */
  function designViews() {
    if (!state.product) return [];
    const views = [];
    for (const a of productAreas()) {
      const d = state.designs[a.id];
      if (d && d.objects.length && !views.includes(a.view)) views.push(a.view);
    }
    return views;
  }

  /** デザインが存在するプリント位置のID配列（商品順） */
  function designAreas() {
    if (!state.product) return [];
    return productAreas()
      .filter((a) => { const d = state.designs[a.id]; return d && d.objects.length; })
      .map((a) => a.id);
  }

  /** 入稿用SVG：商品イラスト・白背景を含まず、指定プリント位置のアートワークのみを
   *  実寸(mm)・原寸viewBoxで書き出す。Illustratorでそのまま原寸配置できる。 */
  function exportProductionSVG(areaId, embedFont) {
    const a = productAreas().find((x) => x.id === areaId);
    const d = state.designs[areaId];
    if (!a || !d || !d.objects.length) return "";
    const cid = "cut";
    /* @import はダウンロードSVGのみ（<img>ラスタライズ時は secure static mode で
     * 外部参照が読めず画像自体が壊れるため embedFont=false で省く） */
    /* URLの & は XML では &amp; にしないと SVG 自体が不正になり Illustrator 等で開けない */
    const fontStyle = embedFont !== false && FONT_IMPORT_URL ? `<style type="text/css">@import url("${esc(FONT_IMPORT_URL)}");</style>` : "";
    const body = d.objects.map((o) => objMarkup(o, false)).join("");
    /* 背景は透過（白ベタを入れない＝濃色ボディに白い四角が刷られない）。
     * viewBox はプリント範囲そのもの、width/height は実寸mm。 */
    return `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
      `width="${a.mmW}mm" height="${a.mmH}mm" viewBox="${a.x} ${a.y} ${a.w} ${a.h}">` +
      `<defs>${fontStyle}<clipPath id="${cid}"><rect x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}"/></clipPath></defs>` +
      `<g clip-path="url(#${cid})">${body}</g></svg>`;
  }

  /** 入稿用PNG（透過・高解像度）を指定位置ぶん生成 */
  function exportProductionPNG(areaId, targetDpi) {
    return new Promise((resolve, reject) => {
      const a = productAreas().find((x) => x.id === areaId);
      if (!a) return reject(new Error("area not found"));
      const markup = exportProductionSVG(areaId, false); // ラスタライズ用は@import無し
      if (!markup) return reject(new Error("empty"));
      const blob = new Blob([markup], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const dpi = targetDpi || 200;
        const pxW = Math.round((a.mmW / 25.4) * dpi);
        const pxH = Math.round((a.mmH / 25.4) * dpi);
        const canvas = document.createElement("canvas");
        canvas.width = pxW; canvas.height = pxH;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, pxW, pxH); // 背景透過のまま
        URL.revokeObjectURL(url);
        canvas.toBlob((png) => (png ? resolve(png) : reject(new Error("png"))), "image/png");
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("svg draw")); };
      img.src = url;
    });
  }

  /** プリント位置のメタ情報（指示書用） */
  function areaMeta(areaId) {
    const a = state.product ? productAreas().find((x) => x.id === areaId) : null;
    return a ? { id: a.id, name: a.name, view: a.view, mmW: a.mmW, mmH: a.mmH } : null;
  }

  /** 指定ビュー（省略時は現在ビュー）をスタンドアロンSVG文字列として書き出し。
   *  embedFont=false（ラスタライズ用）は @import を省く。
   *  transparent=true は白背景を入れない（インライン合成プレビュー用）。 */
  function exportSVG(view, embedFont, transparent, realism) {
    const savedArea = state.areaId;
    const wasPreview = state.preview;
    const wasRealism = realismOn;
    realismOn = !!realism; // 入稿/DL用は false（クリーンなベクター）、プレビューは true
    if (view) {
      const target = productAreas().find((a) => a.view === view);
      if (target) state.areaId = target.id;
    }
    state.preview = true;
    render();
    /* Web フォントの @import を埋め込み、ブラウザで開いた際に書体が再現されるようにする
     * （<img>でラスタライズする用途では embedFont=false にして外部参照を外す） */
    const fontStyle = embedFont !== false && FONT_IMPORT_URL
      ? `<defs><style type="text/css">@import url("${esc(FONT_IMPORT_URL)}");</style></defs>`
      : "";
    const bg = transparent ? "" : `<rect width="${VB_W}" height="${VB_H}" fill="#ffffff"/>`;
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${VB_W} ${VB_H}" width="${VB_W}" height="${VB_H}">` +
      fontStyle + bg + svg.innerHTML + `</svg>`;
    state.preview = wasPreview;
    state.areaId = savedArea;
    realismOn = wasRealism;
    render();
    return uniquifyIds(markup);
  }

  /* 生成したスタンドアロンSVGのID（clip/filter/textPath等）に一意の接頭辞を付ける。
   * 同一ページに複数のSVGを並べても id が衝突せず、フィルタ・クリップが正しく効く。 */
  function uniquifyIds(markup) {
    const p = "u" + (idSeq++) + "_";
    return markup
      .replace(/\bid="([^"]+)"/g, (m, id) => `id="${p}${id}"`)
      .replace(/url\(#([^)]+)\)/g, (m, id) => `url(#${p}${id})`)
      .replace(/(xlink:href|href)="#([^"]+)"/g, (m, attr, id) => `${attr}="#${p}${id}"`);
  }

  /** 全面プレビュー用：ライブDOMに差し込むSVGマークアップ（リアル質感ON・ページ側フォント） */
  function previewSVG(view) {
    return exportSVG(view, false, false, true);
  }

  /** 任意のデザイン集合を差し替えて1枚SVGを生成（名簿一括プレビュー・書き出し用）。
   *  現在の編集状態は壊さず元に戻す。opts: {realism, transparent, embedFont} */
  function variantSVG(designsObj, view, opts) {
    opts = opts || {};
    const saved = state.designs;
    state.designs = designsObj || {};
    let m;
    try {
      m = exportSVG(view, opts.embedFont === true, opts.transparent !== false, opts.realism !== false);
    } finally {
      state.designs = saved;
      render();
    }
    return m;
  }

  /** 任意デザイン・指定プリント位置の入稿SVG（名簿の各メンバー用） */
  function variantProductionSVG(designsObj, areaId) {
    const saved = state.designs;
    state.designs = designsObj || {};
    let m = "";
    try { m = exportProductionSVG(areaId, true); } finally { state.designs = saved; }
    return m;
  }

  /* SVG文字列中の外部画像参照（assets/... 等の商品写真）を data URL に置換。
   * <img> 経由のラスタライズは外部サブリソースを読み込まないため、
   * この前処理が無いと写真モックアップのPNG書き出しで写真が抜ける。 */
  async function inlineExternalImages(markup) {
    const re = /(?:xlink:href|href)="([^"]+)"/g;
    const targets = new Set();
    let m;
    while ((m = re.exec(markup))) {
      const u = m[1];
      if (u && !/^(data:|#|blob:)/.test(u)) targets.add(u);
    }
    for (const u of targets) {
      try {
        const res = await fetch(u.replace(/&amp;/g, "&"));
        if (!res.ok) continue;
        const blob = await res.blob();
        const dataUrl = await new Promise((ok, ng) => {
          const r = new FileReader();
          r.onload = () => ok(r.result);
          r.onerror = () => ng(r.error);
          r.readAsDataURL(blob);
        });
        markup = markup.split(`"${u}"`).join(`"${dataUrl}"`);
      } catch (e) { /* 取得できない参照は従来どおりそのまま（イラスト等は影響なし） */ }
    }
    return markup;
  }

  async function exportPNG(scale, view) {
    const markup = await inlineExternalImages(exportSVG(view, false)); // ラスタライズ用は@import無し
    return new Promise((resolve, reject) => {
      const blob = new Blob([markup], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = VB_W * (scale || 2);
        canvas.height = VB_H * (scale || 2);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob((png) => (png ? resolve(png) : reject(new Error("PNG生成に失敗しました"))), "image/png");
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("SVG描画に失敗しました")); };
      img.src = url;
    });
  }

  /* ---------------- 公開API ---------------- */

  const Editor = {
    init(svgEl, cbs) {
      svg = svgEl;
      Object.assign(callbacks, cbs || {});
      /* エクスポートSVGに埋め込むフォント @import URL を <link> から取得 */
      const link = document.querySelector('link[href*="fonts.googleapis.com/css2"]');
      if (link) FONT_IMPORT_URL = link.getAttribute("href");
      svg.addEventListener("pointerdown", onPointerDown);
      svg.addEventListener("pointermove", onPointerMove);
      svg.addEventListener("pointerup", onPointerUp);
      svg.addEventListener("pointercancel", onPointerUp);
      svg.addEventListener("wheel", onWheel, { passive: false });
      /* 右ドラッグでオブジェクトを移動するため、キャンバス上では
       * ブラウザの右クリックメニューを出さない（ページ他所は通常通り） */
      svg.addEventListener("contextmenu", (e) => e.preventDefault());
      document.addEventListener("keydown", onKeyDown);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => render());
    },

    setProduct(product, colorId, keepDesigns) {
      state.product = product;
      state.colorId = colorId || product.colors[0].id;
      if (!keepDesigns) {
        state.designs = {};
        undoStack = [];
        redoStack = [];
      }
      state.areaId = productAreas(product)[0].id;
      state.selectedId = null;
      /* 各エリアのデフォルト加工方法を用意 */
      for (const a of productAreas(product)) design(a.id);
      lastSnapshot = snapshot();
      render();
      callbacks.onChange();
      callbacks.onSelect(null);
    },

    setBodyColor(colorId) {
      /* 色別写真の商品では色替えで実効版面が変わり得る。変わったエリアは
       * オブジェクトを新版面へ写像してから描画する（見切れ・採寸ズレ防止） */
      const before = productAreas().map((a) => ({ id: a.id, x: a.x, y: a.y, w: a.w, h: a.h, mmW: a.mmW, mmH: a.mmH }));
      state.colorId = colorId;
      remapDesignsForAreaChange(before, productAreas());
      render();
      callbacks.onChange();
    },

    /** 商品を切り替えつつ、いまのデザインを新商品のプリント範囲へ引き継ぐ。
     *  同じ位置ID同士（front→front等。cap系はfront⇄capFront/back⇄capBackの別名対応）で
     *  相対位置を保って写像し、px/mm比で scale を補正して実寸を維持。
     *  収まらない場合は自動で縮小・範囲内へ移動する。
     *  戻り値 {moved, dropped}: 引き継げた/対応位置が無く外れたオブジェクト数 */
    carryDesignsToProduct(product, colorId) {
      const oldAreas = productAreas().map((a) => ({ id: a.id, x: a.x, y: a.y, w: a.w, h: a.h, mmW: a.mmW, mmH: a.mmH }));
      const oldDesigns = state.designs;
      state.product = product;
      state.colorId = colorId && product.colors.some((c) => c.id === colorId) ? colorId : product.colors[0].id;
      const newAreas = productAreas(product);
      const targetIds = new Set(newAreas.map((a) => a.id));
      const ALIAS = { front: "capFront", capFront: "front", back: "capBack", capBack: "back" };
      const resolveId = (id) => (targetIds.has(id) ? id : (ALIAS[id] && targetIds.has(ALIAS[id]) ? ALIAS[id] : null));
      const carried = {};
      let moved = 0, dropped = 0;
      for (const [aid, d] of Object.entries(oldDesigns || {})) {
        if (!d || !d.objects || !d.objects.length) continue;
        const tid = resolveId(aid);
        if (!tid || carried[tid]) { dropped += d.objects.length; continue; }
        const a1 = oldAreas.find((a) => a.id === aid);
        const a2 = newAreas.find((a) => a.id === tid);
        const objs = d.objects.map((o) => Object.assign({}, o));
        if (a1 && a2) {
          const rw = (a2.w / (a2.mmW || 1)) / (a1.w / (a1.mmW || 1));
          const rh = (a2.h / (a2.mmH || 1)) / (a1.h / (a1.mmH || 1));
          const r = (rw + rh) / 2;
          for (const o of objs) {
            const fx = (n(o.x) - a1.x) / a1.w, fy = (n(o.y) - a1.y) / a1.h;
            o.x = a2.x + fx * a2.w;
            o.y = a2.y + fy * a2.h;
            o.scale = Math.max(0.05, n(o.scale) * r);
          }
        }
        carried[tid] = {
          methodId: product.methods.includes(d.methodId) ? d.methodId : product.methods[0],
          objects: objs,
        };
        moved += objs.length;
      }
      state.designs = carried;
      state.selectedId = null;
      state.areaId = (newAreas.find((a) => carried[a.id]) || newAreas[0]).id;
      for (const a of newAreas) design(a.id);
      undoStack = []; redoStack = [];
      render();
      fitOversizeObjects(newAreas);
      lastSnapshot = snapshot();
      callbacks.onChange();
      callbacks.onSelect(null);
      return { moved, dropped };
    },

    setArea(areaId) {
      state.areaId = areaId;
      state.selectedId = null;
      render();
      callbacks.onChange();
      callbacks.onSelect(null);
    },

    setMethod(areaId, methodId) {
      const d = design(areaId);
      if (d.methodId === methodId) return;
      d.methodId = methodId;
      commit(); // 加工方法の変更を履歴の1ステップとして積む（undoで黙って戻らないように）
    },

    setZoom(z) { state.zoom = Math.max(0.5, Math.min(4, z)); applyViewBox(); },
    zoomIn() { Editor.setZoom(state.zoom * 1.25); },
    zoomOut() { Editor.setZoom(state.zoom / 1.25); },
    zoomFit() { state.panX = 0; state.panY = 0; Editor.setZoom(1); },
    toggleGrid() { state.showGrid = !state.showGrid; render(); return state.showGrid; },
    togglePreview() {
      state.preview = !state.preview;
      if (state.preview) state.selectedId = null;
      render();
      callbacks.onSelect(null);
      return state.preview;
    },
    toggleWorn() {
      state.worn = !state.worn;
      if (state.worn) { wornPrevPreview = state.preview; state.preview = true; state.selectedId = null; } // 着用は仕上がり表示に
      else { state.preview = wornPrevPreview; } // OFFで着用前の状態（通常は編集）に戻す
      render();
      callbacks.onSelect(null);
      return state.worn;
    },
    get worn() { return state.worn; },

    addText, addStamp, addImage,
    updateSelected, updateObjectById, deleteSelected, reorderSelected, selectObject,
    duplicateSelected, centerSelected, flipSelected,
    applyTemplate, templateThumbSVG,
    undo, redo,
    getPlacements, areaThumbSVG, exportSVG, exportPNG, previewSVG, designViews,
    designAreas, exportProductionSVG, exportProductionPNG, areaMeta,
    variantSVG, variantProductionSVG,
    areas: () => productAreas(),

    get state() { return state; },
    selectedObj,
    designFor: design,

    serialize() {
      return {
        productId: state.product ? state.product.id : null,
        colorId: state.colorId,
        areaId: state.areaId,
        designs: state.designs,
      };
    },

    load(data) {
      if (!data || !data.productId) return false;
      const product = CONFIG.PRODUCTS.find((p) => p.id === data.productId);
      if (!product) return false;
      state.product = product;
      state.colorId = product.colors.some((c) => c.id === data.colorId) ? data.colorId : product.colors[0].id;
      /* 信頼できない入力を無害化してから採用（XSS・不正値・未知methodId対策） */
      state.designs = sanitizeDesigns(data.designs, product);
      /* 旧バージョンとの互換：エリア座標が変わった（袖ビュー化など）場合、
       * プリント範囲の外に取り残されたオブジェクトを範囲内へ移動して救済する */
      migrateOffAreaObjects(product);
      state.areaId = data.areaId && productAreas(product).some((a) => a.id === data.areaId)
        ? data.areaId : productAreas(product)[0].id;
      state.selectedId = null;
      undoStack = [];
      redoStack = [];
      for (const a of productAreas(product)) design(a.id);
      lastSnapshot = snapshot();
      render();
      callbacks.onChange();
      callbacks.onSelect(null);
      return true;
    },
  };

  globalThis.Editor = Editor;
})();
