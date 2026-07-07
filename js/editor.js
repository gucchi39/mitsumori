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

  const state = {
    product: null,
    colorId: null,
    areaId: null,
    designs: {},            // { areaId: { methodId, objects: [] } }
    selectedId: null,
    zoom: 1,
    showGrid: false,
    preview: false,
  };

  let undoStack = [];
  let redoStack = [];
  let idSeq = 1;

  /* ---------------- ユーティリティ ---------------- */

  function uid() { return "obj" + (idSeq++) + "_" + Math.random().toString(36).slice(2, 7); }

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function currentArea() {
    if (!state.product) return null;
    return state.product.printAreas.find((a) => a.id === state.areaId) || null;
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

  /* テキストの実寸幅を canvas で計測 */
  function measureText(obj) {
    if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
    const font = CONFIG.FONTS.find((f) => f.id === obj.fontId) || CONFIG.FONTS[0];
    measureCtx.font = `${font.weight} ${obj.fontSize}px ${font.family}`;
    const lines = String(obj.text || " ").split("\n");
    let w = 0;
    for (const line of lines) {
      const base = measureCtx.measureText(line).width;
      w = Math.max(w, base + (obj.letterSpacing || 0) * Math.max(0, line.length - 1));
    }
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
    const common = `font-family="${esc(font.family)}" font-weight="${font.weight}" font-size="${obj.fontSize}"` +
      ` fill="${obj.fill}" letter-spacing="${obj.letterSpacing || 0}"` +
      (obj.strokeWidth > 0 ? ` stroke="${obj.stroke}" stroke-width="${obj.strokeWidth}" paint-order="stroke" stroke-linejoin="round"` : "");
    const arch = Number(obj.arch) || 0;
    const { w, lines } = measureText(obj);

    /* 縦書き（1行 = 1列、右から左へ） */
    if (obj.vertical) {
      const lh = obj.fontSize * 1.15;
      const n = lines.length;
      return lines.map((line, i) =>
        `<text ${common} x="${((n - 1) / 2 - i) * lh}" y="0" text-anchor="middle" dominant-baseline="central"` +
        ` style="writing-mode:vertical-rl;text-orientation:upright">${esc(line) || "　"}</text>`
      ).join("");
    }

    if (arch !== 0 && lines.length) {
      const textJoined = lines.join("　");
      const chord = Math.max(w, 20);
      const s = (arch / 100) * chord * 0.4;
      const R = (chord * chord / 4 + s * s) / (2 * Math.abs(s));
      const sweep = arch > 0 ? 1 : 0;
      const d = `M ${-chord / 2} ${s / 2} A ${R} ${R} 0 0 ${sweep} ${chord / 2} ${s / 2}`;
      return `<path id="tp-${obj.id}" d="${d}" fill="none"/>` +
        `<text ${common} dominant-baseline="central"><textPath href="#tp-${obj.id}" startOffset="50%" text-anchor="middle">${esc(textJoined)}</textPath></text>`;
    }
    const lh = obj.fontSize * 1.15;
    const y0 = -((lines.length - 1) * lh) / 2;
    const tspans = lines
      .map((line, i) => `<tspan x="0" y="${y0 + i * lh}">${esc(line) || " "}</tspan>`)
      .join("");
    return `<text ${common} text-anchor="middle" dominant-baseline="central">${tspans}</text>`;
  }

  function stampMarkup(obj) {
    const st = Stamps.getStamp(obj.stampId);
    if (!st) return "";
    return `<g transform="translate(-60 -60) scale(1.2)">${Stamps.renderStamp(st, obj.fill)}</g>`;
  }

  function imageMarkup(obj) {
    return `<image href="${obj.href}" x="${-obj.w / 2}" y="${-obj.h / 2}" width="${obj.w}" height="${obj.h}" preserveAspectRatio="xMidYMid meet"/>`;
  }

  function objMarkup(obj, editable) {
    let inner = "";
    if (obj.type === "text") inner = textMarkup(obj);
    else if (obj.type === "stamp") inner = stampMarkup(obj);
    else if (obj.type === "image") inner = imageMarkup(obj);
    const flip = obj.flipX ? " scale(-1 1)" : "";
    return `<g class="obj${editable ? " editable" : ""}" data-id="${obj.id}"` +
      ` transform="translate(${obj.x} ${obj.y}) rotate(${obj.rotation}) scale(${obj.scale})${flip}">` +
      `<g class="obj-inner">${inner}</g></g>`;
  }

  /* ---------------- ステージ描画 ---------------- */

  function applyViewBox() {
    const w = VB_W / state.zoom, h = VB_H / state.zoom;
    svg.setAttribute("viewBox", `${(VB_W - w) / 2} ${(VB_H - h) / 2} ${w} ${h}`);
  }

  function render() {
    if (!svg || !state.product) return;
    const area = currentArea();
    const view = area ? area.view : "front";
    const areasInView = state.product.printAreas.filter((a) => a.view === view);

    const defs = areasInView
      .map((a) => `<clipPath id="clip-${a.id}"><rect x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}"/></clipPath>`)
      .join("");

    const mockup = Mockups.renderMockup(state.product.mockup, bodyHex(), view);

    let gridMarkup = "";
    if (state.showGrid && !state.preview) {
      let linesArr = [];
      for (let gx = 0; gx <= VB_W; gx += 25) linesArr.push(`M${gx} 0 V${VB_H}`);
      for (let gy = 0; gy <= VB_H; gy += 25) linesArr.push(`M0 ${gy} H${VB_W}`);
      gridMarkup = `<path d="${linesArr.join(" ")}" stroke="rgba(50,90,180,0.12)" stroke-width="1" fill="none" pointer-events="none"/>`;
    }

    /* プリント範囲の枠線 */
    let areaMarkup = "";
    if (!state.preview) {
      areaMarkup = areasInView
        .map((a) => {
          const active = area && a.id === area.id;
          return `<g pointer-events="none">
            <rect x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}" fill="none"
              stroke="${active ? "#ff6a13" : "rgba(120,130,150,0.45)"}" stroke-width="${active ? 2.5 : 1.5}"
              stroke-dasharray="8 6"/>
            ${active ? `<text x="${a.x + 4}" y="${a.y - 8}" font-size="17" fill="#ff6a13" font-family="sans-serif">${esc(a.name)}（最大 ${a.mmW / 10}×${a.mmH / 10}cm）</text>` : ""}
          </g>`;
        })
        .join("");
    }

    /* オブジェクト（同じビューの他の位置のデザインも表示する） */
    const objectsMarkup = areasInView
      .map((a) => {
        const d = state.designs[a.id];
        if (!d || !d.objects.length) return "";
        const editable = area && a.id === area.id;
        return `<g clip-path="url(#clip-${a.id})">${d.objects.map((o) => objMarkup(o, editable)).join("")}</g>`;
      })
      .join("");

    svg.innerHTML = `<defs>${defs}</defs>${mockup}${gridMarkup}<g id="objectLayer">${objectsMarkup}</g>${areaMarkup}<g id="selLayer"></g>`;
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
      if (dragGuides.v) guides += `<line x1="${area.x + area.w / 2}" y1="${area.y - 24}" x2="${area.x + area.w / 2}" y2="${area.y + area.h + 24}" stroke="#ff6a13" stroke-width="1.5" stroke-dasharray="5 4"/>`;
      if (dragGuides.h) guides += `<line x1="${area.x - 24}" y1="${area.y + area.h / 2}" x2="${area.x + area.w + 24}" y2="${area.y + area.h / 2}" stroke="#ff6a13" stroke-width="1.5" stroke-dasharray="5 4"/>`;
    }
    layer.innerHTML = guides + `<g transform="translate(${obj.x} ${obj.y}) rotate(${obj.rotation}) scale(${obj.scale})">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#2d7ff9" stroke-width="${2 / obj.scale}" stroke-dasharray="${6 / obj.scale} ${4 / obj.scale}"/>
      <line x1="0" y1="${y}" x2="0" y2="${y - 26 / obj.scale}" stroke="#2d7ff9" stroke-width="${2 / obj.scale}"/>
      <circle data-handle="rotate" cx="0" cy="${y - 32 / obj.scale}" r="${handleR}" fill="#fff" stroke="#2d7ff9" stroke-width="${2 / obj.scale}" style="cursor:grab"/>
      <rect data-handle="scale" x="${x + w - handleR}" y="${y + h - handleR}" width="${handleR * 2}" height="${handleR * 2}" fill="#2d7ff9" stroke="#fff" stroke-width="${1.5 / obj.scale}" style="cursor:nwse-resize"/>
      <g data-handle="delete" style="cursor:pointer">
        <circle cx="${x + w + 18 / obj.scale}" cy="${y}" r="${handleR}" fill="#e5484d"/>
        <path d="M ${x + w + 18 / obj.scale - 4.5 / obj.scale} ${y - 4.5 / obj.scale} l ${9 / obj.scale} ${9 / obj.scale} M ${x + w + 18 / obj.scale + 4.5 / obj.scale} ${y - 4.5 / obj.scale} l ${-9 / obj.scale} ${9 / obj.scale}" stroke="#fff" stroke-width="${2.2 / obj.scale}" stroke-linecap="round"/>
      </g>
    </g>`;
  }

  /* ---------------- ポインタ操作 ---------------- */

  let drag = null; // { mode, startPt, obj, orig... }
  const dragGuides = { v: false, h: false }; // 中央スナップの発動状態

  function onPointerDown(evt) {
    if (!state.product || state.preview) return;
    const pt = svgPoint(evt);
    const handleEl = evt.target.closest("[data-handle]");
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
      svg.setPointerCapture(evt.pointerId);
      evt.preventDefault();
      return;
    }

    const objEl = evt.target.closest(".obj.editable");
    if (objEl) {
      const id = objEl.getAttribute("data-id");
      state.selectedId = id;
      const o = selectedObj();
      drag = { mode: "move", startPt: pt, obj: o, origX: o.x, origY: o.y };
      svg.setPointerCapture(evt.pointerId);
      render();
      callbacks.onSelect(o);
      evt.preventDefault();
      return;
    }

    /* 空クリック → 選択解除 */
    if (state.selectedId) {
      state.selectedId = null;
      renderSelection();
      callbacks.onSelect(null);
    }
  }

  function onPointerMove(evt) {
    if (!drag) return;
    const pt = svgPoint(evt);
    const o = drag.obj;
    const area = currentArea();

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

  function onPointerUp() {
    if (!drag) return;
    drag = null;
    dragGuides.v = dragGuides.h = false;
    commit();
    callbacks.onSelect(selectedObj());
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
      case "ArrowLeft": o.x -= step; commit(); break;
      case "ArrowRight": o.x += step; commit(); break;
      case "ArrowUp": o.y -= step; commit(); break;
      case "ArrowDown": o.y += step; commit(); break;
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

  /* オブジェクトの変換後バウンディングボックス（ステージ座標） */
  function objStageBBox(obj) {
    const node = svg.querySelector(`.obj[data-id="${obj.id}"] .obj-inner`);
    if (!node) return null;
    let bb;
    try { bb = node.getBBox(); } catch (e) { return null; }
    const rad = (obj.rotation * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const corners = [
      [bb.x, bb.y], [bb.x + bb.width, bb.y],
      [bb.x, bb.y + bb.height], [bb.x + bb.width, bb.y + bb.height],
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
  function getPlacements() {
    if (!state.product) return [];
    return withVisibleStage(getPlacementsInner);
  }

  function getPlacementsInner() {
    const savedArea = state.areaId;
    const result = [];
    for (const a of state.product.printAreas) {
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
      const pxPerMm = a.w / a.mmW;

      for (const o of d.objects) {
        if (o.type === "image") {
          hasImage = true;
        } else {
          if (o.fill) colors.add(String(o.fill).toLowerCase());
          if (o.type === "text" && o.strokeWidth > 0 && o.stroke) colors.add(String(o.stroke).toLowerCase());
        }
        const bb = objStageBBox(o);
        if (bb) {
          minX = Math.min(minX, bb.x); minY = Math.min(minY, bb.y);
          maxX = Math.max(maxX, bb.x + bb.w); maxY = Math.max(maxY, bb.y + bb.h);
        }
        if (o.type === "image") {
          const dispW = (o.w * o.scale) / pxPerMm; // mm
          const dpi = o.natW / (dispW / 25.4);
          if (dpi < 100) lowRes = true;
        }
      }

      /* プリント範囲でクリップした実寸 */
      const cx1 = Math.max(minX, a.x), cy1 = Math.max(minY, a.y);
      const cx2 = Math.min(maxX, a.x + a.w), cy2 = Math.min(maxY, a.y + a.h);
      const wMm = Math.max(0, (cx2 - cx1) / pxPerMm);
      const hMm = Math.max(0, (cy2 - cy1) / pxPerMm);

      result.push({
        areaId: a.id,
        areaName: a.name,
        methodId: d.methodId,
        colorCount: hasImage ? Math.max(colors.size, 1) : colors.size,
        widthMm: wMm,
        heightMm: hMm,
        hasImage,
        lowRes,
        objectCount: d.objects.length,
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

  /** プリント位置選択用のミニサムネイルSVG */
  function areaThumbSVG(a) {
    const d = state.designs[a.id];
    const pad = 10;
    const inner = d && d.objects.length ? d.objects.map((o) => objMarkup(o, false)).join("") : "";
    return `<svg viewBox="${a.x - pad} ${a.y - pad} ${a.w + pad * 2} ${a.h + pad * 2}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}" fill="#fff" stroke="#c8cdd6" stroke-width="2" stroke-dasharray="6 4"/>${inner}</svg>`;
  }

  /** 現在のビュー全体をスタンドアロンSVG文字列として書き出し */
  function exportSVG() {
    const wasPreview = state.preview;
    state.preview = true;
    render();
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${VB_W} ${VB_H}" width="${VB_W}" height="${VB_H}">` +
      `<rect width="${VB_W}" height="${VB_H}" fill="#ffffff"/>` + svg.innerHTML + `</svg>`;
    state.preview = wasPreview;
    render();
    return markup;
  }

  function exportPNG(scale) {
    return new Promise((resolve, reject) => {
      const markup = exportSVG();
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
      svg.addEventListener("pointerdown", onPointerDown);
      svg.addEventListener("pointermove", onPointerMove);
      svg.addEventListener("pointerup", onPointerUp);
      svg.addEventListener("pointercancel", onPointerUp);
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
      state.areaId = product.printAreas[0].id;
      state.selectedId = null;
      /* 各エリアのデフォルト加工方法を用意 */
      for (const a of product.printAreas) design(a.id);
      lastSnapshot = snapshot();
      render();
      callbacks.onChange();
      callbacks.onSelect(null);
    },

    setBodyColor(colorId) {
      state.colorId = colorId;
      render();
      callbacks.onChange();
    },

    setArea(areaId) {
      state.areaId = areaId;
      state.selectedId = null;
      render();
      callbacks.onChange();
      callbacks.onSelect(null);
    },

    setMethod(areaId, methodId) {
      design(areaId).methodId = methodId;
      callbacks.onChange();
    },

    setZoom(z) { state.zoom = Math.max(0.5, Math.min(4, z)); applyViewBox(); },
    zoomIn() { Editor.setZoom(state.zoom * 1.25); },
    zoomOut() { Editor.setZoom(state.zoom / 1.25); },
    zoomFit() { Editor.setZoom(1); },
    toggleGrid() { state.showGrid = !state.showGrid; render(); return state.showGrid; },
    togglePreview() {
      state.preview = !state.preview;
      if (state.preview) state.selectedId = null;
      render();
      callbacks.onSelect(null);
      return state.preview;
    },

    addText, addStamp, addImage,
    updateSelected, deleteSelected, reorderSelected, selectObject,
    duplicateSelected, centerSelected, flipSelected,
    applyTemplate, templateThumbSVG,
    undo, redo,
    getPlacements, areaThumbSVG, exportSVG, exportPNG,

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
      state.colorId = data.colorId || product.colors[0].id;
      state.designs = data.designs || {};
      state.areaId = data.areaId && product.printAreas.some((a) => a.id === data.areaId)
        ? data.areaId : product.printAreas[0].id;
      state.selectedId = null;
      undoStack = [];
      redoStack = [];
      for (const a of product.printAreas) design(a.id);
      lastSnapshot = snapshot();
      render();
      callbacks.onChange();
      callbacks.onSelect(null);
      return true;
    },
  };

  globalThis.Editor = Editor;
})();
