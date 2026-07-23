/* =========================================================================
 * app.js — アプリケーション本体（画面遷移・パネルUI・見積もり連携）
 * ========================================================================= */
(function () {
  "use strict";

  const { SHOP, PRODUCTS, METHODS, FONTS, THREAD_COLORS, INK_COLORS, FREE_COLORS } = CONFIG;
  const $ = (sel) => document.querySelector(sel);
  const AUTOSAVE_KEY = "mitsumori.autosave.v1";

  /* 未知の加工方法IDでも落ちないフォールバック付き参照 */
  function methodOf(id) {
    return METHODS[id] || { id, name: "加工", short: "加工", icon: "•", desc: "", colorMode: "free", maxColors: Infinity, allowImages: true, setupFee: null };
  }
  /* 数量入力を非負整数に正規化（見積もり・注文メール・共有URLの値ズレ防止） */
  function cleanQty(v) {
    const n = Math.floor(Number(v));
    return isFinite(n) && n > 0 ? Math.min(n, 99999) : 0;
  }
  function cleanQuantities(raw) {
    const out = {};
    for (const k in raw || {}) { const q = cleanQty(raw[k]); if (q) out[k] = q; }
    return out;
  }

  const app = {
    step: 1,
    tab: "color",
    quantities: {},
    lastQuote: null,
    textDefaults: { text: "サンプル", fontId: "gothic", fontSize: 40, fill: "#111111", stroke: "#ffffff", strokeWidth: 0, letterSpacing: 0, arch: 0, vertical: false },
    stampFill: "#111111",
    orderNo: null,
    roster: { active: false, entries: [] },
    bgBackup: {},   /* 背景透過の「元に戻す」用（オブジェクトID→元画像dataURL、セッション内のみ） */
  };

  /* ================= 初期化 ================= */

  function init() {
    $("#brandName").textContent = SHOP.name;
    $("#brandSub").textContent = SHOP.tagline;
    document.title = `${SHOP.tagline}｜${SHOP.name}`;

    renderProductGrid();

    Editor.init($("#stage"), {
      onChange: debounce(onEditorChange, 60),
      onSelect: onEditorSelect,
    });

    bindGlobalEvents();
    /* 共有URL（#d=…）があれば最優先で復元、なければ自動保存の復元案内 */
    applyShareHash().then((loaded) => {
      if (!loaded) checkAutosave();
    });
    updateNav();
  }

  function bindGlobalEvents() {
    /* ステップ移動 */
    $("#btnNext").addEventListener("click", () => goStep(app.step + 1));
    $("#btnPrev").addEventListener("click", () => goStep(app.step - 1));
    document.querySelectorAll("#stepNav li").forEach((li) => {
      li.addEventListener("click", () => {
        const n = Number(li.dataset.step);
        if (n < app.step || (Editor.state.product && n <= 3)) goStep(n);
      });
    });

    /* ツールレール */
    document.querySelectorAll("#toolrail button").forEach((b) => {
      b.addEventListener("click", () => setTab(b.dataset.tab));
    });

    /* キャンバスツールバー */
    $("#btnUndo").addEventListener("click", () => Editor.undo());
    $("#btnRedo").addEventListener("click", () => Editor.redo());
    $("#btnZoomIn").addEventListener("click", () => Editor.zoomIn());
    $("#btnZoomOut").addEventListener("click", () => Editor.zoomOut());
    $("#btnZoomFit").addEventListener("click", () => Editor.zoomFit());
    $("#btnGrid").addEventListener("click", (e) => e.currentTarget.classList.toggle("on", Editor.toggleGrid()));
    $("#btnPreview").addEventListener("click", (e) => {
      const on = Editor.togglePreview();
      e.currentTarget.classList.toggle("on", on);
    });
    $("#btnWorn").addEventListener("click", (e) => {
      const on = Editor.toggleWorn();
      e.currentTarget.classList.toggle("on", on);
      $("#btnPreview").classList.toggle("on", Editor.state.preview);
    });
    $("#btnFullPreview").addEventListener("click", showFullPreview);
    $("#fullPreview").addEventListener("click", (e) => { if (e.target.id === "fullPreview") e.currentTarget.hidden = true; });

    /* 選択オブジェクトの操作バー */
    $("#saDup").addEventListener("click", () => Editor.duplicateSelected());
    $("#saCenter").addEventListener("click", () => Editor.centerSelected("both"));
    $("#saFlip").addEventListener("click", () => Editor.flipSelected());

    /* 保存・読込・共有・新規 */
    $("#btnSave").addEventListener("click", downloadJSON);
    $("#fileLoad").addEventListener("change", (e) => {
      const f = e.target.files[0];
      if (f) loadJSONFile(f);
      e.target.value = "";
    });
    $("#btnShare").addEventListener("click", shareDesign);
    $("#btnMyDesigns").addEventListener("click", () => { renderMyDesigns(); $("#myDesigns").hidden = false; });
    $("#myDesigns").addEventListener("click", (e) => { if (e.target === $("#myDesigns")) $("#myDesigns").hidden = true; });
    $("#btnNew").addEventListener("click", () => {
      if (hasAnyDesign() && !confirm("現在のデザインを破棄して最初からやり直しますか？")) return;
      localStorage.removeItem(AUTOSAVE_KEY);
      location.href = location.pathname; /* ハッシュも消してリロード */
    });

    /* STEP3 */
    $("#btnPrint").addEventListener("click", printQuoteSheet);
    $("#btnOrder").addEventListener("click", submitOrder);
    $("#btnProductionSet").addEventListener("click", downloadProductionSet);
    $("#btnSpec").addEventListener("click", printSpecSheet);
    $("#btnDlPng").addEventListener("click", downloadPNG);
    $("#btnDlSvg").addEventListener("click", downloadSVG);
    $("#btnDlJson").addEventListener("click", downloadJSON);
    $("#customerName").addEventListener("input", autosave);
    ["#ordCompany", "#ordEmail", "#ordTel", "#ordZip", "#ordAddr", "#ordDue", "#ordNote"].forEach((id) => {
      const el = $(id);
      if (el) el.addEventListener("input", autosave);
    });
    /* チーム名簿 */
    $("#rosterActive").addEventListener("change", renderRosterUI);
    $("#rosterText").addEventListener("input", debounce(renderRosterUI, 250));
    $("#btnRosterPreview").addEventListener("click", showRosterPreview);
    $("#rosterPreview").addEventListener("click", (e) => { if (e.target.id === "rosterPreview") e.currentTarget.hidden = true; });
  }

  /* ================= ステップ制御 ================= */

  function goStep(n) {
    if (n < 1 || n > 3) return;
    if (n >= 2 && !Editor.state.product) return;
    app.step = n;
    document.querySelectorAll(".step").forEach((s) => s.classList.remove("active"));
    $("#step" + n).classList.add("active");
    document.querySelectorAll("#stepNav li").forEach((li) => {
      const ln = Number(li.dataset.step);
      li.classList.toggle("active", ln === n);
      li.classList.toggle("done", ln < n);
    });
    if (n === 2) renderEditorPanels();
    if (n === 3) {
      buildSizeInputs();
      refreshQuote();
    }
    updateNav();
    /* スクロールコンテナは <main>（windowではない）なので両方リセット */
    const m = $("#main");
    if (m) m.scrollTop = 0;
    window.scrollTo({ top: 0 });
  }

  function updateNav() {
    const next = $("#btnNext");
    const prev = $("#btnPrev");
    prev.disabled = app.step === 1;
    if (app.step === 1) {
      next.disabled = !Editor.state.product;
      next.textContent = "デザインへ進む ▶";
    } else if (app.step === 2) {
      next.disabled = false;
      next.textContent = "見積もりへ進む ▶";
    } else {
      next.disabled = true;
      next.textContent = "お見積もり";
    }
  }

  /* ================= STEP1: 商品選択 ================= */

  function renderProductGrid() {
    const grid = $("#productGrid");
    grid.innerHTML = "";
    for (const p of PRODUCTS) {
      const card = document.createElement("button");
      card.className = "product-card";
      const methods = p.methods.map((m) => `<span class="pc-badge">${METHODS[m].short}</span>`).join("");
      /* 写真モックアップは 700×760 全体に商品が写るため、切り取らず全体表示。
       * 白い商品もタイル背景（CSS）で視認できるようにする。 */
      card.innerHTML = `
        <svg class="pc-fig" viewBox="0 0 700 760">${Mockups.renderProductMockup(p, p.colors[0].hex, p.colors[0].id, "front")}</svg>
        <span class="pc-cat">${p.category}</span>
        <div class="pc-name">${p.name}</div>
        <div class="pc-price"><b>¥${p.basePrice.toLocaleString()}</b> /枚〜（税抜・無地）</div>
        <div class="pc-badges">${methods}<span class="pc-badge">${p.colors.length}色</span></div>
        <div class="pc-note">${p.note}</div>`;
      card.addEventListener("click", () => selectProduct(p));
      grid.appendChild(card);
    }
  }

  function hasAnyDesign() {
    return Object.values(Editor.state.designs || {}).some((d) => d.objects && d.objects.length);
  }

  function selectProduct(p) {
    const switching = Editor.state.product && Editor.state.product.id !== p.id;
    if (switching && hasAnyDesign()) {
      /* デザインがある状態での商品変更：引き継ぐ／破棄／中止 の三択 */
      if (confirm(`いまのデザインを「${p.name}」に引き継ぎますか？\n\n[OK] 引き継ぐ（位置・大きさは新しいプリント範囲に自動調整）\n[キャンセル] 引き継がない`)) {
        const res = Editor.carryDesignsToProduct(p);
        app.quantities = {};
        app.orderNo = null;
        if (res.dropped && res.moved) toast(`デザインを引き継ぎました（対応する位置がない${res.dropped}個は外れました）`, "warn");
        else if (res.dropped) toast(`この商品には対応するプリント位置がなく、デザインは引き継げませんでした`, "warn");
        else toast("デザインを引き継ぎました");
      } else if (confirm("いまのデザインを破棄して商品を変更しますか？")) {
        Editor.setProduct(p);
        app.quantities = {};
        app.orderNo = null;
      } else {
        return; /* 商品変更そのものを中止 */
      }
    } else if (!Editor.state.product || switching) {
      Editor.setProduct(p);
      app.quantities = {};
      app.orderNo = null; /* 別商品＝別注文。番号を発番し直す */
    }
    goStep(2);
  }

  /* ================= STEP2: エディタ画面 ================= */

  function renderEditorPanels() {
    renderToolPanel();
    renderPositionBar();
    renderLayerList();
    renderAreaInfo();
  }

  function setTab(tab) {
    app.tab = tab;
    document.querySelectorAll("#toolrail button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    renderToolPanel();
  }

  function currentMethod() {
    const d = Editor.designFor(Editor.state.areaId);
    return METHODS[d.methodId] || METHODS[Editor.state.product.methods[0]];
  }

  function paletteColors() {
    const m = currentMethod();
    if (m.colorMode === "palette") return m.palette === "thread" ? THREAD_COLORS : INK_COLORS;
    return FREE_COLORS.map((hex) => ({ id: hex, name: hex, hex }));
  }

  function swatchesHTML(colors, selectedHex, dataAttr) {
    return `<div class="swatches">` + colors.map((c) =>
      `<button class="swatch${(selectedHex || "").toLowerCase() === c.hex.toLowerCase() ? " selected" : ""}"
        style="background:${c.hex}" title="${c.name}" data-${dataAttr}="${c.hex}" data-cname="${c.name}"></button>`
    ).join("") + `</div>`;
  }

  /* ---- ツールパネル描画 ---- */
  function renderToolPanel() {
    const panel = $("#toolPanel");
    const p = Editor.state.product;
    if (!p) { panel.innerHTML = ""; return; }
    const sel = Editor.selectedObj();
    const m = currentMethod();

    if (app.tab === "color") {
      const cur = p.colors.find((c) => c.id === Editor.state.colorId);
      panel.innerHTML = `
        <h3>商品カラー</h3>
        <div class="tp-section">
          ${swatchesHTML(p.colors.map((c) => ({ ...c })), cur && cur.hex, "body")}
          <div class="swatch-name">${cur ? cur.name : ""}</div>
        </div>
        <div class="tp-section">
          <span class="tp-label">商品</span>
          <div style="font-size:13px;font-weight:700">${p.name}</div>
          <div style="font-size:11px;color:var(--sub);margin:4px 0 10px">¥${p.basePrice.toLocaleString()}/枚〜（税抜）</div>
          <button class="ghost-btn small" id="btnChangeProduct">商品を変更する</button>
        </div>`;
      panel.querySelectorAll("[data-body]").forEach((b) =>
        b.addEventListener("click", () => {
          const c = p.colors.find((c) => c.hex === b.dataset.body);
          Editor.setBodyColor(c.id);
          renderToolPanel();
        })
      );
      $("#btnChangeProduct").addEventListener("click", () => goStep(1));

    } else if (app.tab === "text") {
      const t = sel && sel.type === "text" ? sel : app.textDefaults;
      const editing = sel && sel.type === "text";
      const fontOptions = FONTS.map((f) =>
        `<option value="${f.id}" ${f.id === t.fontId ? "selected" : ""} style="font-family:${f.family}">${f.name}</option>`
      ).join("");
      panel.innerHTML = `
        <h3>${editing ? "テキストを編集" : "テキストを追加"}</h3>
        <div class="tp-section">
          <textarea id="tpText" placeholder="文字を入力（改行可）">${escapeHtml(t.text)}</textarea>
          <span class="tp-label">フォント</span>
          <select id="tpFont">${fontOptions}</select>
          <span class="tp-label">文字サイズ</span>
          <div class="range-row"><input type="range" id="tpSize" min="12" max="120" value="${t.fontSize}"><output>${t.fontSize}</output></div>
          <span class="tp-label">文字色 <small>(${m.colorMode === "palette" ? m.name + "用パレット" : "自由色"})</small></span>
          ${swatchesHTML(paletteColors(), t.fill, "fill")}
          <span class="tp-label">縁取り（フチ）</span>
          <div class="range-row"><input type="range" id="tpStrokeW" min="0" max="12" value="${t.strokeWidth}"><output>${t.strokeWidth}</output></div>
          <div id="tpStrokeColors" ${t.strokeWidth > 0 ? "" : "hidden"}>${swatchesHTML(paletteColors(), t.stroke, "stroke")}</div>
          <span class="tp-label">文字間隔</span>
          <div class="range-row"><input type="range" id="tpSpacing" min="-5" max="40" value="${t.letterSpacing}"><output>${t.letterSpacing}</output></div>
          <span class="tp-label">アーチ変形（上ぞり・下ぞり）</span>
          <div class="range-row"><input type="range" id="tpArch" min="-100" max="100" value="${t.arch}" ${t.vertical ? "disabled" : ""}><output>${t.arch}</output></div>
          <label class="check-row"><input type="checkbox" id="tpVertical" ${t.vertical ? "checked" : ""}> 縦書きにする（名入れ向け）</label>
          ${editing ? "" : `<button class="primary-btn small" id="tpAdd" style="margin-top:12px;width:100%">＋ テキストを追加</button>`}
        </div>`;
      bindTextPanel(editing);

    } else if (app.tab === "stamp") {
      const stampFill = sel && sel.type === "stamp" ? sel.fill : app.stampFill;
      panel.innerHTML = `
        <h3>スタンプ（イラスト素材）</h3>
        <div class="tp-section">
          <div class="stamp-grid">
            ${Stamps.STAMPS.map((s) =>
              `<button class="stamp-btn" data-stamp="${s.id}" title="${s.name}">
                 <svg viewBox="-6 -6 112 112">${Stamps.renderStamp(s, "#374151")}</svg>
               </button>`).join("")}
          </div>
          <span class="tp-label">スタンプの色 <small>(${m.colorMode === "palette" ? m.name + "用パレット" : "自由色"})</small></span>
          ${swatchesHTML(paletteColors(), stampFill, "sfill")}
          <p class="upload-note">クリックで中央に追加されます。配置後にドラッグ・拡大・回転できます。</p>
        </div>`;
      panel.querySelectorAll("[data-stamp]").forEach((b) =>
        b.addEventListener("click", () => Editor.addStamp(b.dataset.stamp, app.stampFill))
      );
      panel.querySelectorAll("[data-sfill]").forEach((b) =>
        b.addEventListener("click", () => {
          app.stampFill = b.dataset.sfill;
          const s = Editor.selectedObj();
          if (s && s.type === "stamp") Editor.updateSelected({ fill: b.dataset.sfill });
          renderToolPanel();
        })
      );

    } else if (app.tab === "template") {
      panel.innerHTML = `
        <h3>デザインテンプレート</h3>
        <div class="tp-section">
          <p class="upload-note" style="margin:0 0 10px">クリックで現在のプリント位置（${(Editor.areas().find((a) => a.id === Editor.state.areaId) || {}).name || ""}）に配置。文字はあとから自由に書き換えできます。</p>
          <div class="template-grid">
            ${Templates.TEMPLATES.map((t) => `
              <button class="template-card" data-tpl="${t.id}">
                ${Editor.templateThumbSVG(t)}
                <span class="tc-name">${t.name}</span>
                <span class="tc-tag">${t.tag}</span>
              </button>`).join("")}
          </div>
        </div>`;
      panel.querySelectorAll("[data-tpl]").forEach((b) =>
        b.addEventListener("click", () => {
          const d = Editor.designFor(Editor.state.areaId);
          if (d.objects.length && !confirm("このプリント位置のデザインをテンプレートで置き換えます。よろしいですか？")) return;
          Editor.applyTemplate(Templates.getTemplate(b.dataset.tpl));
          toast("テンプレートを配置しました。文字はクリックして書き換えできます");
        })
      );

    } else if (app.tab === "image") {
      const sel = Editor.state.selectedId ? Editor.designFor(Editor.state.areaId).objects.find((o) => o.id === Editor.state.selectedId) : null;
      const selImg = sel && sel.type === "image" ? sel : null;
      panel.innerHTML = `
        <h3>画像アップロード</h3>
        <div class="tp-section">
          <div class="upload-zone" id="uploadZone">
            📷 クリックして画像を選択<br>またはここにドラッグ＆ドロップ
            <input type="file" id="fileImage" accept="image/png,image/jpeg,image/gif,image/webp" hidden>
          </div>
          <p class="upload-note">
            対応形式：JPG / PNG / GIF / WebP<br>
            ※ 解像度が低い場合は警告を表示します。<br>
            ※ AI・EPS・PDF等の入稿データはご注文後にメールでお送りいただけます。<br>
            ※ <b>刺繍・シルクスクリーンでは写真を再現できません</b>（フルカラープリントをご利用ください）。
          </p>
          <div id="imageWarn"></div>
        </div>
        ${selImg ? `
        <div class="tp-section">
          <span class="tp-label">選択中の画像</span>
          <div class="bg-remove-row">
            <select id="bgTol">
              <option value="18">弱（色の近いものだけ）</option>
              <option value="32" selected>標準</option>
              <option value="48">強（影・ムラごと消す）</option>
            </select>
            <button class="primary-btn" id="btnBgRemove">✨ 背景を消す</button>
            <button id="btnBgRestore" ${app.bgBackup[selImg.id] ? "" : "disabled"}>↩ 元に戻す</button>
          </div>
          <p class="upload-note">白背景のロゴ等から、外側とつながった背景色を自動で透明にします。<br>
          ※ 文字の内側など「囲まれた部分」は残ります（デザインの白を守るため）。</p>
        </div>` : ""}`;
      bindImagePanel();
      if (selImg) bindBgRemove(selImg);

    } else if (app.tab === "method") {
      const d = Editor.designFor(Editor.state.areaId);
      const area = Editor.areas().find((a) => a.id === Editor.state.areaId);
      panel.innerHTML = `
        <h3>加工方法（${area ? area.name : ""}）</h3>
        <div class="tp-section">
          ${p.methods.map((mid) => {
            const mm = METHODS[mid];
            const constraints = [];
            if (mm.maxColors !== Infinity) constraints.push(`最大${mm.maxColors}色`);
            if (!mm.allowImages) constraints.push("写真不可");
            if (mm.setupFee) constraints.push(mm.setupFee.perColor ? `${mm.setupFee.label} ¥${mm.setupFee.amount.toLocaleString()}/色` : `${mm.setupFee.label} ¥${mm.setupFee.amount.toLocaleString()}`);
            return `<label class="method-option${d.methodId === mid ? " selected" : ""}">
              <input type="radio" name="method" value="${mid}" ${d.methodId === mid ? "checked" : ""}>
              <span class="mo-name">${mm.icon} ${mm.name}</span>
              <div class="mo-desc">${mm.desc}<br><b>${constraints.join("・")}</b></div>
            </label>`;
          }).join("")}
          <p class="upload-note">※ プリント位置ごとに加工方法を選べます。色数・サイズ・数量から自動でお見積もりします。</p>
        </div>`;
      panel.querySelectorAll("input[name=method]").forEach((r) =>
        r.addEventListener("change", () => {
          Editor.setMethod(Editor.state.areaId, r.value);
          renderToolPanel();
          renderAreaInfo();
        })
      );
    }
  }

  function bindTextPanel(editing) {
    const get = () => ({
      text: $("#tpText").value || "テキスト",
      fontId: $("#tpFont").value,
      fontSize: Number($("#tpSize").value),
      strokeWidth: Number($("#tpStrokeW").value),
      letterSpacing: Number($("#tpSpacing").value),
      arch: Number($("#tpArch").value),
      vertical: $("#tpVertical").checked,
    });
    const applyLive = (commitNow) => {
      const props = get();
      Object.assign(app.textDefaults, props);
      const sel = Editor.selectedObj();
      if (sel && sel.type === "text") Editor.updateSelected(props, commitNow);
      $("#tpStrokeColors").hidden = props.strokeWidth <= 0;
      $("#tpArch").disabled = props.vertical;
    };
    ["tpText", "tpFont", "tpSize", "tpStrokeW", "tpSpacing", "tpArch", "tpVertical"].forEach((id) => {
      const el = document.getElementById(id);
      el.addEventListener("input", (e) => {
        applyLive(false);
        const out = e.target.closest(".range-row")?.querySelector("output");
        if (out) out.textContent = e.target.value;
      });
      el.addEventListener("change", () => applyLive(true));
    });
    document.querySelectorAll("#toolPanel [data-fill]").forEach((b) =>
      b.addEventListener("click", () => {
        app.textDefaults.fill = b.dataset.fill;
        const sel = Editor.selectedObj();
        if (sel && sel.type === "text") Editor.updateSelected({ fill: b.dataset.fill });
        renderToolPanel();
      })
    );
    document.querySelectorAll("#toolPanel [data-stroke]").forEach((b) =>
      b.addEventListener("click", () => {
        app.textDefaults.stroke = b.dataset.stroke;
        const sel = Editor.selectedObj();
        if (sel && sel.type === "text") Editor.updateSelected({ stroke: b.dataset.stroke });
        renderToolPanel();
      })
    );
    if (!editing) {
      $("#tpAdd").addEventListener("click", () => {
        Editor.addText({ ...app.textDefaults, ...get(), fill: app.textDefaults.fill, stroke: app.textDefaults.stroke });
      });
    }
  }

  function bindImagePanel() {
    const zone = $("#uploadZone");
    const input = $("#fileImage");
    zone.addEventListener("click", () => input.click());
    zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("dragover"); });
    zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("dragover");
      if (e.dataTransfer.files[0]) handleImageFile(e.dataTransfer.files[0]);
    });
    input.addEventListener("change", () => {
      if (input.files[0]) handleImageFile(input.files[0]);
      input.value = "";
    });
  }

  /* ---- 画像の自動背景透過（ロゴ向け） ----
   * 外周から背景色（外周ピクセルの平均）に近い画素をフラッドフィルで透明化する。
   * 「外側とつながった背景」だけを消すので、白抜き文字などデザイン内の白は残る。
   * 商品写真の切り抜きで使った手法の簡易版（ロゴは背景が単色なので色距離で十分）。 */
  function stripImageBackground(dataUrl, tol) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          /* 大きすぎる画像は処理・データ量とも重いため長辺1600pxへ縮小 */
          const MAX = 1600;
          const f = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
          const W = Math.max(1, Math.round(img.naturalWidth * f));
          const H = Math.max(1, Math.round(img.naturalHeight * f));
          const cv = document.createElement("canvas");
          cv.width = W; cv.height = H;
          const g = cv.getContext("2d", { willReadFrequently: true });
          g.drawImage(img, 0, 0, W, H);
          const im = g.getImageData(0, 0, W, H);
          const d = im.data, N = W * H;

          /* 背景の代表色＝外周の不透明画素の平均 */
          let br = 0, bg = 0, bb = 0, bn = 0;
          const acc = (x, y) => { const i = (y * W + x) * 4; if (d[i + 3] < 40) return; br += d[i]; bg += d[i + 1]; bb += d[i + 2]; bn++; };
          for (let x = 0; x < W; x++) { acc(x, 0); acc(x, H - 1); }
          for (let y = 0; y < H; y++) { acc(0, y); acc(W - 1, y); }
          if (!bn) { resolve(null); return; }   /* 外周がすでに全部透明 */
          br /= bn; bg /= bn; bb /= bn;

          const dist = (i) => { const dr = d[i] - br, dg = d[i + 1] - bg, db = d[i + 2] - bb; return Math.sqrt(dr * dr + dg * dg + db * db); };
          const removed = new Uint8Array(N);
          const stack = [];
          const seed = (x, y) => {
            const p = y * W + x; if (removed[p]) return;
            const i = p * 4;
            if (d[i + 3] < 40 || dist(i) < tol) { removed[p] = 1; stack.push(p); }
          };
          for (let x = 0; x < W; x++) { seed(x, 0); seed(x, H - 1); }
          for (let y = 0; y < H; y++) { seed(0, y); seed(W - 1, y); }
          while (stack.length) {
            const p = stack.pop(); const x = p % W, y = (p / W) | 0;
            const tryN = (nx, ny) => {
              if (nx < 0 || ny < 0 || nx >= W || ny >= H) return;
              const q = ny * W + nx; if (removed[q]) return;
              const i = q * 4;
              if (d[i + 3] < 40 || dist(i) < tol) { removed[q] = 1; stack.push(q); }
            };
            tryN(x + 1, y); tryN(x - 1, y); tryN(x, y + 1); tryN(x, y - 1);
          }

          let cnt = 0;
          for (let p = 0; p < N; p++) if (removed[p]) { d[p * 4 + 3] = 0; cnt++; }
          if (!cnt) { resolve(null); return; }

          /* 境界1pxを背景色との距離でなだらかに（ギザギザ・フチ残り軽減） */
          const a0 = new Uint8ClampedArray(N);
          for (let p = 0; p < N; p++) a0[p] = d[p * 4 + 3];
          for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const p = y * W + x; if (a0[p] === 0) continue;
            let edge = false;
            for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx, ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
              if (a0[ny * W + nx] === 0) { edge = true; break; }
            }
            if (!edge) continue;
            const i = p * 4;
            const t = Math.max(0, Math.min(1, (dist(i) - tol * 0.6) / (tol * 0.8)));
            d[i + 3] = Math.min(d[i + 3], Math.round(40 + t * 215));
          }

          g.putImageData(im, 0, 0);
          resolve({ dataUrl: cv.toDataURL("image/png"), removedPct: Math.round((cnt / N) * 100), w: W, h: H });
        } catch (e) { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  }

  function bindBgRemove(selImg) {
    const btn = $("#btnBgRemove");
    const restore = $("#btnBgRestore");
    if (btn) btn.addEventListener("click", async () => {
      btn.disabled = true; btn.textContent = "処理中…";
      const tol = Number($("#bgTol").value) || 32;
      const res = await stripImageBackground(selImg.href, tol);
      btn.disabled = false; btn.textContent = "✨ 背景を消す";
      if (!res || res.removedPct === 0) { toast("背景らしい部分が見つかりませんでした（すでに透過済みの画像かもしれません）", "warn"); return; }
      if (res.removedPct > 92) { toast("画像のほぼ全体が背景と判定されたため中止しました。「弱」でお試しください", "warn"); return; }
      if (!app.bgBackup[selImg.id]) app.bgBackup[selImg.id] = { href: selImg.href, natW: selImg.natW, natH: selImg.natH };
      /* 長辺1600px超は処理時に縮小されるため、natW/natH も実データに合わせて更新する。
       * 据え置くと getPlacements の実効DPI計算が過大になり、低解像度警告が出なくなる */
      Editor.updateSelected({ href: res.dataUrl, natW: res.w, natH: res.h });
      renderToolPanel();
      toast(`背景を透過しました（画像の約${res.removedPct}%）。戻すときは「元に戻す」へ`);
    });
    if (restore) restore.addEventListener("click", () => {
      const orig = app.bgBackup[selImg.id];
      if (!orig) return;
      Editor.updateSelected({ href: orig.href, natW: orig.natW, natH: orig.natH });
      delete app.bgBackup[selImg.id];
      renderToolPanel();
      toast("元の画像に戻しました");
    });
  }

  function handleImageFile(file) {
    if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) {
      alert("対応していない形式です。JPG / PNG / GIF / WebP をご利用ください。\n（AI・EPS等はご注文後に入稿いただけます）");
      return;
    }
    const m = currentMethod();
    const p = Editor.state.product;
    if (!m.allowImages) {
      if (p.methods.includes("inkjet")) {
        if (confirm(`${m.name}では写真・画像を再現できません。\nこのプリント位置を「${METHODS.inkjet.name}」に切り替えて配置しますか？`)) {
          Editor.setMethod(Editor.state.areaId, "inkjet");
          renderAreaInfo();
        } else return;
      } else {
        alert(`この商品は${m.name}のみ対応のため、写真・画像はご利用いただけません。テキストやスタンプをご利用ください。`);
        return;
      }
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        Editor.addImage(reader.result, img.naturalWidth, img.naturalHeight);
        checkImageResolution();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function checkImageResolution() {
    const warnBox = $("#imageWarn");
    if (!warnBox) return;
    const pl = Editor.getPlacements().find((p) => p.areaId === Editor.state.areaId);
    warnBox.innerHTML = pl && pl.lowRes
      ? `<div class="alert warn">⚠ 画像の解像度が低いため、粗く仕上がる可能性があります（目安100dpi以上）。</div>`
      : "";
  }

  /* ---- プリント位置バー ---- */
  function renderPositionBar() {
    const bar = $("#positionBar");
    const p = Editor.state.product;
    if (!p) { bar.innerHTML = ""; return; }
    bar.innerHTML = Editor.areas().map((a) => {
      const d = Editor.state.designs[a.id];
      const count = d ? d.objects.length : 0;
      return `<button class="pos-thumb${a.id === Editor.state.areaId ? " selected" : ""}" data-area="${a.id}">
        ${Editor.areaThumbSVG(a)}
        <span class="pt-name">${a.name}</span>
        ${count ? `<span class="pt-count">${count}</span>` : ""}
      </button>`;
    }).join("");
    bar.querySelectorAll("[data-area]").forEach((b) =>
      b.addEventListener("click", () => {
        Editor.setArea(b.dataset.area);
        renderEditorPanels();
      })
    );
  }

  /* ---- レイヤーパネル ---- */
  function renderLayerList() {
    const list = $("#layerList");
    const p = Editor.state.product;
    if (!p) { list.innerHTML = ""; return; }
    const d = Editor.designFor(Editor.state.areaId);
    if (!d.objects.length) {
      list.innerHTML = `<div class="layer-empty">まだ何も配置されていません。<br>左のツールから追加してください。</div>`;
      return;
    }
    const rows = [...d.objects].reverse().map((o) => {
      let icon = "🖼", label = "画像";
      if (o.type === "text") { icon = "Ｔ"; label = (o.text || "").split("\n")[0]; }
      if (o.type === "stamp") { icon = "★"; label = (Stamps.getStamp(o.stampId) || {}).name || "スタンプ"; }
      return `<div class="layer-row${o.id === Editor.state.selectedId ? " selected" : ""}" data-obj="${o.id}">
        <span>${icon}</span><span class="lr-label">${escapeHtml(label)}</span>
        <button data-up title="前面へ">▲</button>
        <button data-down title="背面へ">▼</button>
        <button data-del title="削除">✕</button>
      </div>`;
    }).join("");
    list.innerHTML = rows;
    list.querySelectorAll(".layer-row").forEach((row) => {
      const id = row.dataset.obj;
      row.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
        Editor.selectObject(id);
        renderLayerList();
      });
      row.querySelector("[data-up]").addEventListener("click", () => { Editor.selectObject(id); Editor.reorderSelected(1); });
      row.querySelector("[data-down]").addEventListener("click", () => { Editor.selectObject(id); Editor.reorderSelected(-1); });
      row.querySelector("[data-del]").addEventListener("click", () => { Editor.selectObject(id); Editor.deleteSelected(); });
    });
  }

  /* ---- エリア情報 ---- */
  function renderAreaInfo() {
    const box = $("#areaInfoBox");
    const p = Editor.state.product;
    if (!p) { box.innerHTML = ""; return; }
    const area = Editor.areas().find((a) => a.id === Editor.state.areaId);
    const d = Editor.designFor(area.id);
    const m = methodOf(d.methodId);
    const pl = Editor.getPlacements().find((x) => x.areaId === area.id);
    box.innerHTML = `
      <h3>編集中の位置</h3>
      <div class="area-info">
        <b>${area.name}</b>（最大 ${area.mmW / 10} × ${area.mmH / 10} cm）<br>
        加工方法：<span class="method-chip">${m.icon} ${m.name}</span><br>
        ${pl ? `デザイン実寸：<b>約 ${(pl.widthMm / 10).toFixed(1)} × ${(pl.heightMm / 10).toFixed(1)} cm</b><br>使用色数：<b>${pl.hasImage ? "フルカラー" : pl.colorCount + "色"}</b>` : "デザイン未配置"}
      </div>`;
  }

  /* ================= エディタコールバック ================= */

  /* デザイン内容の指紋。商品・色・全プリント位置のオブジェクト構成が対象。
   * 画像の href（dataURLで巨大）は長さ＋先頭で代用し、毎回の全文比較を避ける */
  function designSignature() {
    try {
      const p = Editor.state.product;
      return (p ? p.id : "") + "|" + Editor.state.colorId + "|" +
        JSON.stringify(Editor.serialize().designs, (k, v) =>
          (k === "href" && typeof v === "string") ? v.length + ":" + v.slice(0, 48) : v);
    } catch (e) { return "err" + Date.now(); }
  }

  function onEditorChange() {
    /* デザインの中身が変わったときだけ注文番号を発番し直す（別内容の注文に
     * 同じ番号が使い回されると店舗側の追跡で衝突するため）。プリント位置の
     * タブ切替などデザインが変わらない操作では番号を維持し、
     * 「入稿データ書き出し→位置を眺めて→注文」でも番号が一致するようにする。 */
    const sig = designSignature();
    if (app.lastDesignSig !== undefined && sig !== app.lastDesignSig) app.orderNo = null;
    app.lastDesignSig = sig;
    renderPositionBar();
    renderLayerList();
    renderAreaInfo();
    refreshQuote();
    autosave();
    updateNav();
  }

  function onEditorSelect(obj) {
    renderLayerList();
    /* 選択オブジェクト用の操作バー */
    const bar = $("#selActions");
    bar.hidden = !obj;
    if (obj) $("#saFlip").disabled = obj.type === "text";
    if (obj) {
      if (obj.type === "text" && app.tab !== "text") setTab("text");
      else if (obj.type === "stamp" && app.tab !== "stamp") setTab("stamp");
      else if (obj.type === "image" && app.tab !== "image") setTab("image");
      else renderToolPanel();
    } else {
      renderToolPanel();
    }
  }

  /* ================= STEP3: 見積もり ================= */

  function buildSizeInputs() {
    const p = Editor.state.product;
    const box = $("#sizeInputs");
    if (!p) return;
    const byRoster = rosterActive();
    const rq = byRoster ? rosterQuantities() : null;
    box.innerHTML = p.sizes.map((s) => {
      const sur = p.sizeSurcharge[s];
      const val = byRoster ? (rq[s] || 0) : (cleanQty(app.quantities[s]) || "");
      return `<div class="size-cell">
        <label>${s === "FREE" ? "数量" : escapeHtml(s)}</label>
        <input type="number" min="0" max="99999" inputmode="numeric" data-size="${escapeHtml(s)}" value="${val}" placeholder="0" ${byRoster ? "readonly" : ""}>
        ${sur ? `<span class="size-note">+¥${sur}/枚</span>` : ""}
      </div>`;
    }).join("");
    if (byRoster) {
      box.insertAdjacentHTML("beforeend", `<p class="size-note" style="grid-column:1/-1">※ 数量は名簿（${app.roster.entries.length}名）から自動集計しています。</p>`);
    }
    box.querySelectorAll("input[data-size]").forEach((inp) =>
      inp.addEventListener("input", () => {
        if (byRoster) return;
        app.quantities[inp.dataset.size] = cleanQty(inp.value);
        refreshQuote();
        autosave();
      })
    );
  }

  /* 見積もり・注文に使う有効数量（名簿が有効なら名簿から） */
  function effectiveQuantities() {
    return rosterActive() ? rosterQuantities() : app.quantities;
  }

  /* 最悪ケース採寸の対象メンバー。
   * 通常規模（60名以下）は全員を採寸して確実に最大サイズを拾う。
   * 大規模名簿では、差し込み後の「実レンダリング幅」で候補を選ぶ。文字数ではなく
   * 実際の描画幅（canvas measureText＝描画と同じ字形メトリクス）で並べるので、
   * 比例フォントで幅広グリフ（例: W）が少数でも、その行が最大幅なら確実に選ばれる。
   * 縦書き・複数オブジェクト等の取りこぼし対策に、文字数上位も併せて採る。 */
  function rosterMeasureEntries() {
    const valid = app.roster.entries.filter((e) => e.sizeOk !== false);
    if (valid.length <= 60) return valid;
    const base = Editor.serialize().designs || {};
    const textObjs = [];
    for (const areaId in base) for (const o of (base[areaId].objects || []))
      if (o.type === "text" && /\{(名前|NAME|番号|NUMBER|背番号)\}/i.test(o.text || "")) textObjs.push(o);
    const ctx = document.createElement("canvas").getContext("2d");
    const fontOf = (o) => { const f = CONFIG.FONTS.find((x) => x.id === o.fontId) || {}; return `${f.weight || 400} ${(o.fontSize || 40)}px ${f.family || "sans-serif"}`; };
    const widthOf = (e) => { let w = 0; for (const o of textObjs) { ctx.font = fontOf(o); w = Math.max(w, ctx.measureText(substituteText(o.text, e)).width * (o.scale || 1)); } return w; };
    const lenOf = (e) => (e.name || "").length + String(e.number || "").length;
    const K = 40;
    const top = (keyFn) => [...valid].sort((a, b) => keyFn(b) - keyFn(a)).slice(0, K);
    return [...new Set([...top(widthOf), ...top(lenOf)])];
  }

  /* 名簿使用時の最悪ケース採寸：差し込み前テンプレ（{名前}/{番号}）ではなく、
   * 実際の名前・番号に差し替えた各案を測り、エリアごとに最大サイズを採る。
   * 長い名前がプリント範囲を超える／上のサイズ区分に入る場合も見積・警告へ反映する。 */
  function rosterMaxPlacements(base) {
    const byArea = {};
    for (const pl of base) byArea[pl.areaId] = { ...pl };
    for (const e of rosterMeasureEntries()) {
      const pls = Editor.getPlacements(memberDesigns(e));
      for (const pl of pls) {
        const b = byArea[pl.areaId];
        if (!b) { byArea[pl.areaId] = { ...pl }; continue; }
        b.widthMm = Math.max(b.widthMm, pl.widthMm);
        b.heightMm = Math.max(b.heightMm, pl.heightMm);
      }
    }
    return Object.values(byArea);
  }

  function refreshQuote() {
    const p = Editor.state.product;
    if (!p) return;
    let placements = Editor.getPlacements();
    if (rosterActive() && hasPlaceholders()) placements = rosterMaxPlacements(placements);
    const q = Quote.computeQuote({
      productId: p.id,
      quantities: effectiveQuantities(),
      placements,
    });
    app.lastQuote = q;

    /* 下部バー */
    if (q.ok) {
      $("#barTotal").textContent = Quote.yen(q.total);
      $("#barPer").textContent = `1枚あたり ${Quote.yen(q.perPiece)}（${q.totalQty}枚・${q.tierLabel}）`;
    } else {
      $("#barTotal").textContent = "¥ —";
      $("#barPer").textContent = "枚数を入力すると自動計算されます";
    }

    if (app.step === 3) renderQuoteResult(q, placements);
  }

  function renderQuoteResult(q, placements) {
    const body = $("#quoteBody");
    const alerts = $("#quoteAlerts");

    /* 警告・エラー表示（見積もり＋製造適性） */
    let alertHtml = "";
    for (const e of q.errors || []) alertHtml += `<div class="alert error">✕ ${escapeHtml(e)}</div>`;
    for (const w of q.warnings || []) alertHtml += `<div class="alert warn">⚠ ${escapeHtml(w)}</div>`;
    for (const w of productionWarnings(placements)) alertHtml += `<div class="alert warn">⚠ ${escapeHtml(w)}</div>`;
    alerts.innerHTML = alertHtml;

    /* デザインサマリ */
    $("#designSummary").innerHTML = placements.map((pl) => {
      const a = Editor.areas().find((x) => x.id === pl.areaId);
      return `<div class="ds-item">${Editor.areaThumbSVG(a)}
        <div class="ds-name">${pl.areaName}</div>
        <div class="ds-meta">${methodOf(pl.methodId).short}・${pl.hasImage ? "フルカラー" : pl.colorCount + "色"}<br>約${(pl.widthMm / 10).toFixed(1)}×${(pl.heightMm / 10).toFixed(1)}cm</div>
      </div>`;
    }).join("");

    if (!q.ok) {
      body.innerHTML = `<p class="quote-empty">数量を入力すると自動で計算されます。</p>`;
      return;
    }

    const rows = q.lines.map((l) => `
      <tr>
        <td>${l.label}${l.detail ? `<span class="q-detail">${l.detail}</span>` : ""}</td>
        <td class="num">${Quote.yen(l.unitPrice)}</td>
        <td class="num">${l.qty}</td>
        <td class="num">${Quote.yen(l.amount)}</td>
      </tr>`).join("");

    body.innerHTML = `
      <table class="quote-table">
        <thead><tr><th>項目</th><th class="num">単価</th><th class="num">数量</th><th class="num">金額</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="quote-totals">
        <div class="qt-row"><span>小計（税抜）</span><span>${Quote.yen(q.subtotal)}</span></div>
        <div class="qt-row"><span>消費税（${Math.round(SHOP.taxRate * 100)}%）</span><span>${Quote.yen(q.tax)}</span></div>
        <div class="qt-row"><span>送料${q.shippingFree ? "" : "（税込）"}</span><span>${q.shippingFree ? "無料" : Quote.yen(q.shipping)}</span></div>
        <div class="qt-row total"><span>合計（税込）</span><span>${Quote.yen(q.total)}</span></div>
        <div class="qt-row per"><span>参考：1枚あたり（税込・送料除く）</span><span>約 ${Quote.yen(q.perPiece)}</span></div>
      </div>`;
  }

  /* ================= 見積書印刷 ================= */

  function printQuoteSheet() {
    const q = app.lastQuote;
    if (!q || !q.ok) {
      alert("先に数量を入力してください。");
      return;
    }
    let placements = Editor.getPlacements();
    if (rosterActive() && hasPlaceholders()) placements = rosterMaxPlacements(placements);
    const now = new Date();
    const ymd = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
    const no = `Q${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
    const validUntil = new Date(now.getTime() + SHOP.quoteValidDays * 86400000);
    const customer = $("#customerName").value.trim();

    const rows = q.lines.map((l) => `
      <tr>
        <td>${l.label}${l.detail ? `<span class="q-detail">${l.detail}</span>` : ""}</td>
        <td class="num">${Quote.yen(l.unitPrice)}</td>
        <td class="num">${l.qty}</td>
        <td class="num">${Quote.yen(l.amount)}</td>
      </tr>`).join("");

    const designs = placements.map((pl) => {
      const a = Editor.areas().find((x) => x.id === pl.areaId);
      return `<figure>${Editor.areaThumbSVG(a)}<figcaption>${escapeHtml(pl.areaName)}（${methodOf(pl.methodId).short}）</figcaption></figure>`;
    }).join("");

    $("#quoteSheet").innerHTML = `
      <div class="qs-header">
        <div>
          <div class="qs-title">御 見 積 書</div>
          <div class="qs-meta">見積No：${no}　発行日：${ymd}</div>
        </div>
        <div class="qs-shop">
          <div class="qs-shopname">${SHOP.name}</div>
          ${SHOP.address}<br>TEL：${SHOP.tel}<br>Email：${SHOP.email}
        </div>
      </div>
      <div class="qs-to">${customer ? escapeHtml(customer) : "　　　　　　　　様"}</div>
      <div class="qs-meta">下記の通りお見積もり申し上げます。（有効期限：${validUntil.getFullYear()}年${validUntil.getMonth() + 1}月${validUntil.getDate()}日）</div>
      <div class="qs-grand">御見積金額　${Quote.yen(q.total)} <small>（税込）</small></div>
      <table class="qs-table">
        <thead><tr><th>品名・摘要</th><th>単価</th><th>数量</th><th>金額</th></tr></thead>
        <tbody>
          ${rows}
          <tr><td colspan="3" class="num">小計（税抜）</td><td class="num">${Quote.yen(q.subtotal)}</td></tr>
          <tr><td colspan="3" class="num">消費税（${Math.round(SHOP.taxRate * 100)}%）</td><td class="num">${Quote.yen(q.tax)}</td></tr>
          <tr><td colspan="3" class="num">送料${q.shippingFree ? "" : "（税込）"}</td><td class="num">${q.shippingFree ? "無料" : Quote.yen(q.shipping)}</td></tr>
          <tr><td colspan="3" class="num"><b>合計（税込）</b></td><td class="num"><b>${Quote.yen(q.total)}</b></td></tr>
        </tbody>
      </table>
      <div class="qs-designs">${designs}</div>
      <div class="qs-note">
        ※ 本見積もりはWEBシミュレーターによる概算です。正式なお見積もりはデザインデータ確認後にご案内いたします。<br>
        ※ 納期目安：デザイン確定後 7〜10営業日（数量・時期により変動します）。<br>
        ※ ${Quote.yen(SHOP.freeShippingMin)}（税抜）以上のご注文で送料無料。
      </div>`;
    window.print();
  }

  /* ================= 色の解決（入稿指示書用） ================= */

  /* 使用hexを、加工方法のパレット（糸/インク）の色名・コードへ逆引き */
  function resolveColor(hex, methodId) {
    const m = methodOf(methodId);
    const h = String(hex || "").toLowerCase();
    let palette = null;
    if (m.colorMode === "palette") palette = m.palette === "thread" ? THREAD_COLORS : INK_COLORS;
    if (palette) {
      const found = palette.find((c) => c.hex.toLowerCase() === h);
      if (found) return { hex: h, name: found.name, code: found.code || "" };
    }
    return { hex: h, name: h.toUpperCase(), code: "" };
  }
  function placementColors(pl) {
    if (pl.hasImage) return [];
    return (pl.usedColors || []).map((hex) => resolveColor(hex, pl.methodId));
  }
  function colorLabel(c) {
    return c.code ? `${c.name}（${c.code}）` : c.name;
  }

  /* 濃色ボディ×シルクで白下地版が要るか */
  function needsUnderbase(pl) {
    const p = Editor.state.product;
    const body = p && p.colors.find((c) => c.id === Editor.state.colorId);
    if (!body || !body.dark) return false;
    if (pl.methodId !== "silk") return false;
    // 白1色のみのデザインは下地不要
    const cols = placementColors(pl);
    const nonWhite = cols.filter((c) => c.hex !== "#ffffff" && c.hex !== "#fff");
    return nonWhite.length > 0;
  }

  /* 製造適性の警告（刺繍の微小文字・低解像度画像） */
  function productionWarnings(placements) {
    const out = [];
    for (const pl of placements) {
      if (pl.methodId === "embroidery" && pl.minTextMm != null && pl.minTextMm < 5) {
        out.push(`${pl.areaName}：文字が小さく（約${pl.minTextMm.toFixed(1)}mm）、刺繍では潰れる可能性があります。文字は5mm以上を推奨します。`);
      }
      if (pl.hasImage && pl.minImageDpi != null && pl.minImageDpi < 150) {
        out.push(`${pl.areaName}：画像の解像度が低め（約${Math.round(pl.minImageDpi)}dpi）です。原寸プリントでは粗くなる場合があります（150dpi以上推奨）。`);
      }
      if (needsUnderbase(pl)) {
        out.push(`${pl.areaName}：濃色ボディにシルクプリントのため、別途「白下地版（アンダーベース）」が必要です（版代が1版分加算される場合があります）。`);
      }
    }
    return out;
  }

  /* ================= 注文データの組み立て ================= */

  function orderNumber() {
    if (app.orderNo) return app.orderNo;
    const d = new Date();
    const pad = (v, n) => String(v).padStart(n || 2, "0");
    const ymd = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
    const hms = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    /* 秒精度の時刻＋暗号乱数3桁。衝突には同一秒の注文が同じ乱数を引く必要があり
     * 実用上重複しない。電話でも読み上げやすい数字のみの体系 */
    let r;
    try { r = crypto.getRandomValues(new Uint32Array(1))[0] % 1000; }
    catch (e) { r = Math.floor(Math.random() * 1000); }
    app.orderNo = `${(CONFIG.ORDER && CONFIG.ORDER.autoNumber) || "ORD"}-${ymd}-${hms}-${pad(r, 3)}`;
    return app.orderNo;
  }

  const CONTACT_FIELDS = {
    company: "#ordCompany", name: "#customerName", email: "#ordEmail", tel: "#ordTel",
    zip: "#ordZip", address: "#ordAddr", dueDate: "#ordDue", note: "#ordNote",
  };
  function contactInfo() {
    const out = {};
    for (const k in CONTACT_FIELDS) { const el = $(CONTACT_FIELDS[k]); out[k] = el ? el.value.trim() : ""; }
    return out;
  }
  function applyContact(c) {
    if (!c) return;
    for (const k in CONTACT_FIELDS) { const el = $(CONTACT_FIELDS[k]); if (el && c[k] != null) el.value = String(c[k]).slice(0, 300); }
  }

  /* 構造化された注文データ（メール本文・JSON・POST に共通で使う） */
  function buildOrder() {
    const p = Editor.state.product;
    const q = app.lastQuote;
    /* 名簿有効時は {名前}/{番号} を全員分に差し替えた最悪ケース寸法で報告する。
     * 見積（refreshQuote）と同じ展開をしないと、添付の個別SVGや請求根拠より
     * 小さい寸法がメール・JSONに記載され、超過警告も欠落してしまう */
    let placements = Editor.getPlacements();
    if (rosterActive() && hasPlaceholders()) placements = rosterMaxPlacements(placements);
    const color = p.colors.find((c) => c.id === Editor.state.colorId);
    const eq = effectiveQuantities();
    const sizes = p.sizes.filter((s) => eq[s] > 0).map((s) => ({ size: s, qty: eq[s] }));
    return {
      orderNo: orderNumber(),
      createdAt: new Date().toISOString(),
      product: { id: p.id, name: p.name, color: color ? color.name : "", colorDark: !!(color && color.dark) },
      quantities: sizes,
      totalQty: q ? q.totalQty : 0,
      roster: rosterActive() ? app.roster.entries.slice() : null,
      placements: placements.map((pl) => ({
        area: pl.areaName, view: pl.view, method: methodOf(pl.methodId).name,
        colors: pl.hasImage ? "フルカラー" : placementColors(pl).map(colorLabel),
        widthMm: Math.round(pl.widthMm), heightMm: Math.round(pl.heightMm),
        underbase: needsUnderbase(pl),
      })),
      amountTotal: q && q.ok ? q.total : null,
      contact: contactInfo(),
    };
  }

  /* 注文の本文テキスト（メール・フォールバック共通） */
  function orderText(order) {
    const L = [];
    L.push(`【ご注文】注文番号: ${order.orderNo}`, "");
    const c = order.contact;
    L.push("■ お客様情報");
    if (c.company) L.push(`会社名：${c.company}`);
    L.push(`お名前：${c.name || "（未記入）"}`);
    L.push(`メール：${c.email || "（未記入）"}`);
    L.push(`電話：${c.tel || "（未記入）"}`);
    if (c.zip || c.address) L.push(`納品先：〒${c.zip} ${c.address}`);
    if (c.dueDate) L.push(`希望納期：${c.dueDate}`);
    if (c.note) L.push(`備考：${c.note}`);
    L.push("", "■ ご注文内容");
    L.push(`商品：${order.product.name}（${order.product.color}）`);
    L.push(`数量：${order.quantities.map((x) => `${x.size}:${x.qty}枚`).join(" / ")}（計${order.totalQty}枚）`);
    for (const pl of order.placements) {
      const col = Array.isArray(pl.colors) ? pl.colors.join("・") : pl.colors;
      L.push(`・${pl.area}：${pl.method} / ${col} / 約${(pl.widthMm / 10).toFixed(1)}×${(pl.heightMm / 10).toFixed(1)}cm${pl.underbase ? " ※白下地版必要" : ""}`);
    }
    if (order.roster && order.roster.length) {
      L.push("", `■ チーム名簿（${order.roster.length}名｜背番号・名前）`);
      order.roster.forEach((e, i) => L.push(`${i + 1}. ${e.name}　背番号${e.number}　${e.size}`));
    }
    L.push("", `概算合計：${order.amountTotal != null ? Quote.yen(order.amountTotal) + "（税込）" : "未計算"}`);
    L.push("", "※ デザインの入稿データ（SVG）とプレビュー、デザインデータ(JSON)を添付します。");
    return L.join("\n");
  }

  function download(filename, blob) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a); // 一部ブラウザは DOM 接続時のみ download 属性を尊重
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
  }

  function stamp() {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}_${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
  }

  function downloadJSON() {
    if (!Editor.state.product) { alert("商品を選択してください。"); return; }
    const data = {
      app: "mitsumori-design-simulator",
      version: 2,
      savedAt: new Date().toISOString(),
      editor: Editor.serialize(),
      quantities: app.quantities,
      contact: contactInfo(),
      roster: app.roster,
    };
    download(`design_${stamp()}.json`, new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  }

  function loadJSONFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Editor.load(data.editor)) throw new Error("bad data");
        app.orderNo = null; /* 読み込んだデザインは別注文として発番し直す */
        app.quantities = cleanQuantities(data.quantities);
        applyContact(data.contact);
        restoreRoster(data.roster);
        if (data.customerName && $("#customerName")) $("#customerName").value = String(data.customerName).slice(0, 100); // 旧形式
        goStep(2);
        renderEditorPanels();
      } catch (e) {
        alert("デザインデータを読み込めませんでした。ファイルをご確認ください。");
      }
    };
    reader.readAsText(file);
  }

  /* 前面・背面など、デザインのある全ビューをビュー名付きで書き出す
   * （最後に見ていた面だけ書き出して反対面が入稿から欠落するのを防ぐ） */
  const VIEW_LABEL = { front: "前面", back: "背面", sleeveL: "左袖", sleeveR: "右袖", capSide: "サイド" };

  function downloadSVG() {
    if (!Editor.state.product) return;
    const views = Editor.designViews();
    if (views.length <= 1) {
      download(`design_${stamp()}.svg`, new Blob([Editor.exportSVG(views[0])], { type: "image/svg+xml" }));
    } else {
      views.forEach((v) => download(`design_${VIEW_LABEL[v] || v}_${stamp()}.svg`, new Blob([Editor.exportSVG(v)], { type: "image/svg+xml" })));
      toast(`${views.length}面（${views.map((v) => VIEW_LABEL[v] || v).join("・")}）のSVGを書き出しました`);
    }
  }

  function downloadPNG() {
    if (!Editor.state.product) return;
    const views = Editor.designViews();
    const list = views.length ? views : [undefined];
    Promise.all(list.map((v) => Editor.exportPNG(2, v).then((blob) => ({ v, blob }))))
      .then((items) => {
        items.forEach(({ v, blob }) => download(`design${v ? "_" + (VIEW_LABEL[v] || v) : ""}_${stamp()}.png`, blob));
        if (items.length > 1) toast(`${items.length}面のPNGを書き出しました`);
      })
      .catch(() => alert("PNGの生成に失敗しました。SVG形式をお試しください。"));
  }

  /* ================= チーム名簿（背番号・名前の一括） ================= */

  /* 名簿テキストを [{name, number, size, sizeOk}] に解析。
   * 表記ゆれは大文字化のみ吸収し、不明なサイズは別サイズへ勝手に置き換えず
   * sizeOk=false のまま見せて注文をブロックする（誤サイズ製作の防止） */
  function parseRoster(text) {
    const p = Editor.state.product;
    const validSizes = p ? p.sizes : [];
    return String(text || "").split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
      const parts = line.split(/[,、\t]/).map((s) => s.trim());
      const raw = (parts[2] || "").toUpperCase();
      let size = raw, sizeOk = true;
      if (validSizes.length) {
        if (validSizes.includes(raw)) size = raw;
        else if (!raw && validSizes.includes("FREE")) size = "FREE"; // サイズ欄なし×フリーサイズ商品はOK
        else sizeOk = false;
      }
      return { name: parts[0] || "", number: parts[1] || "", size, sizeOk };
    });
  }

  /* 名簿からサイズ別数量を集計（サイズ不明の行は数えない） */
  function rosterQuantities() {
    const q = {};
    for (const e of app.roster.entries) if (e.sizeOk !== false) q[e.size] = (q[e.size] || 0) + 1;
    return q;
  }

  function rosterBadRows() {
    return app.roster.entries.map((e, i) => ({ ...e, row: i + 1 })).filter((e) => e.sizeOk === false);
  }

  function rosterActive() {
    return app.roster.active && app.roster.entries.length > 0;
  }

  /* 保存/自動保存からの名簿復元（UIにも反映） */
  function restoreRoster(r) {
    if (!r || typeof r !== "object") { app.roster = { active: false, entries: [] }; return; }
    const entries = Array.isArray(r.entries) ? r.entries.map((e) => ({ name: e.name || "", number: e.number || "", size: e.size || "" })) : [];
    app.roster = { active: !!r.active, entries };
    const ta = $("#rosterText"), cb = $("#rosterActive"), box = $("#rosterBox");
    if (ta) ta.value = entries.map((e) => [e.name, e.number, e.size].join(", ")).join("\n");
    if (cb) cb.checked = app.roster.active;
    if (box && (app.roster.active || entries.length)) box.open = true;
    if (ta) renderRosterUI();
  }

  /* ================= マイデザイン（ブラウザ内保存・リピート注文向け） ================= */

  const MYDESIGNS_KEY = "mitsumori.mydesigns.v1";
  const MYDESIGNS_MAX = 12;

  function myDesignsList() {
    try { const v = JSON.parse(localStorage.getItem(MYDESIGNS_KEY)); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
  }
  function myDesignsStore(list) {
    try { localStorage.setItem(MYDESIGNS_KEY, JSON.stringify(list)); return true; }
    catch (e) { return false; }
  }

  async function saveCurrentToMyDesigns() {
    const p = Editor.state.product;
    if (!p) { toast("先に商品を選んでデザインを作成してください", "warn"); return; }
    if (!hasAnyDesign()) { toast("デザインがまだ空です。文字やスタンプを配置してから保存してください", "warn"); return; }
    const nameEl = $("#mdName");
    const name = ((nameEl && nameEl.value) || "").trim() || `${p.name}（${new Date().toLocaleDateString("ja-JP")}）`;
    /* サムネは低解像度PNG（商品写真込み・ローカル保存なので軽さ優先） */
    let thumb = "";
    try {
      const blob = await Editor.exportPNG(0.22, Editor.designViews()[0] || undefined);
      thumb = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => ok(""); r.readAsDataURL(blob); });
    } catch (e) { /* サムネ失敗は保存自体を妨げない */ }
    const entry = {
      id: "md" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: name.slice(0, 40),
      savedAt: new Date().toISOString(),
      productName: p.name,
      thumb,
      editor: Editor.serialize(),
      quantities: app.quantities,
      roster: app.roster && (app.roster.active || (app.roster.entries || []).length) ? app.roster : null,
    };
    const list = myDesignsList();
    list.unshift(entry);
    while (list.length > MYDESIGNS_MAX) list.pop();
    if (!myDesignsStore(list)) {
      entry.thumb = ""; /* 容量不足→サムネなしで再挑戦 */
      if (!myDesignsStore(list)) {
        toast("ブラウザの保存容量が足りません。マイデザインの古いものを削除するか、画像の少ないデザインでお試しください", "warn");
        return;
      }
    }
    if (nameEl) nameEl.value = "";
    renderMyDesigns();
    toast(`「${entry.name}」をマイデザインに保存しました`);
  }

  function loadMyDesign(id) {
    const e = myDesignsList().find((x) => x.id === id);
    if (!e) return;
    if (hasAnyDesign() && !confirm(`「${e.name}」を読み込みますか？\nいまのデザインは置き換えられます。`)) return;
    if (!Editor.load(e.editor)) { toast("読み込みに失敗しました（データが壊れている可能性があります）", "warn"); return; }
    app.orderNo = null; /* 読み込んだデザインは別注文として発番し直す */
    app.quantities = cleanQuantities(e.quantities);
    restoreRoster(e.roster);
    $("#myDesigns").hidden = true;
    goStep(2);
    renderEditorPanels();
    refreshQuote();
    autosave();
    toast(`「${e.name}」を読み込みました`);
  }

  function deleteMyDesign(id) {
    const list = myDesignsList();
    const e = list.find((x) => x.id === id);
    if (!e) return;
    if (!confirm(`「${e.name}」を削除しますか？（元に戻せません）`)) return;
    myDesignsStore(list.filter((x) => x.id !== id));
    renderMyDesigns();
  }

  function renderMyDesigns() {
    const inner = document.querySelector("#myDesigns .md-inner");
    if (!inner) return;
    const list = myDesignsList();
    const fmt = (iso) => { try { const d = new Date(iso); return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`; } catch (e) { return ""; } };
    const cards = list.map((e) => `
      <figure class="md-card">
        ${e.thumb ? `<img src="${escapeHtml(e.thumb)}" alt="">` : `<div class="md-noimg">🎨</div>`}
        <figcaption>
          <b>${escapeHtml(e.name)}</b>
          <span>${escapeHtml(e.productName || "")}・${fmt(e.savedAt)}${e.roster ? "・名簿あり" : ""}</span>
        </figcaption>
        <div class="md-actions">
          <button class="primary-btn" data-mdload="${e.id}">読込</button>
          <button data-mddel="${e.id}">削除</button>
        </div>
      </figure>`).join("");
    inner.innerHTML = `
      <h2>📁 マイデザイン</h2>
      <p class="md-note">このブラウザの中に保存されます（最大${MYDESIGNS_MAX}件）。リピート注文や作り直しにご利用ください。<br>
      ※ 端末やブラウザを変えると引き継がれません。確実に残したい場合は「💾 保存」でファイル保存も併用を。</p>
      <div class="md-savebar">
        <input id="mdName" placeholder="名前を付けて保存（例：野球部ユニフォーム2026）" maxlength="40">
        <button class="primary-btn" id="mdSaveBtn">いまのデザインを保存</button>
      </div>
      ${list.length ? `<div class="md-grid">${cards}</div>` : `<p class="md-empty">まだ保存されたデザインはありません。<br>デザインを作って「いまのデザインを保存」を押すと、ここに並びます。</p>`}
      <button class="primary-btn md-close" id="mdClose">閉じる</button>`;
    $("#mdSaveBtn").addEventListener("click", saveCurrentToMyDesigns);
    $("#mdClose").addEventListener("click", () => { $("#myDesigns").hidden = true; });
    inner.querySelectorAll("[data-mdload]").forEach((b) => b.addEventListener("click", () => loadMyDesign(b.dataset.mdload)));
    inner.querySelectorAll("[data-mddel]").forEach((b) => b.addEventListener("click", () => deleteMyDesign(b.dataset.mddel)));
  }

  /* {名前}{番号}{NAME}{NUMBER} を置換 */
  function substituteText(t, entry) {
    return String(t)
      .replace(/\{名前\}|\{NAME\}/gi, entry.name || "")
      .replace(/\{番号\}|\{NUMBER\}|\{背番号\}/gi, entry.number || "");
  }

  /* 1メンバー分のデザイン集合（プレースホルダー置換済み） */
  function memberDesigns(entry) {
    const base = Editor.serialize().designs || {};
    const out = {};
    for (const areaId in base) {
      const d = base[areaId];
      out[areaId] = {
        methodId: d.methodId,
        objects: (d.objects || []).map((o) => {
          const c = Object.assign({}, o);
          if (c.type === "text") c.text = substituteText(c.text, entry);
          return c;
        }),
      };
    }
    return out;
  }

  /* デザインにプレースホルダーが含まれるか */
  function hasPlaceholders() {
    const d = Editor.serialize().designs || {};
    return Object.values(d).some((a) => (a.objects || []).some((o) => o.type === "text" && /\{(名前|NAME|番号|NUMBER|背番号)\}/i.test(o.text || "")));
  }

  function renderRosterUI() {
    const box = $("#rosterBox");
    if (!box) return;
    const active = $("#rosterActive").checked;
    app.roster.active = active;
    app.roster.entries = parseRoster($("#rosterText").value);
    const n = app.roster.entries.length;
    const sizes = rosterQuantities();
    const sizeStr = Object.entries(sizes).map(([s, c]) => `${s}:${c}`).join(" / ");
    $("#rosterCount").textContent = n ? `${n}名（${sizeStr}）` : "名簿が空です";

    /* テーブル表示 */
    $("#rosterTable").innerHTML = n
      ? `<table><thead><tr><th>#</th><th>名前</th><th>番号</th><th>サイズ</th></tr></thead><tbody>${
          app.roster.entries.map((e, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(e.name)}</td><td>${escapeHtml(e.number)}</td><td>${
            e.sizeOk === false
              ? `<b style="color:#d33">⚠ ${escapeHtml(e.size) || "未入力"}</b>`
              : escapeHtml(e.size)
          }</td></tr>`).join("")
        }</tbody></table>`
      : "";

    const bad = rosterBadRows();
    if (bad.length) {
      const p = Editor.state.product;
      $("#rosterTable").insertAdjacentHTML("afterbegin", `<div class="alert warn" style="margin-bottom:8px">⚠ サイズが不明な行があります（${bad.map((b) => `${b.row}行目`).join("・")}）。この商品のサイズ：<b>${(p ? p.sizes : []).map(escapeHtml).join(" / ")}</b>。修正されるまでこの行は数量に含まれず、ご注文に進めません。</div>`);
    }

    if (active && !hasPlaceholders()) {
      $("#rosterTable").insertAdjacentHTML("afterbegin", `<div class="alert warn" style="margin-bottom:8px">⚠ デザインに <code>{名前}</code> または <code>{番号}</code> が見つかりません。STEP2でテキストに差し込み文字を入れてください（例：背番号のテキストを「{番号}」に）。</div>`);
    }
    buildSizeInputs();
    refreshQuote();
    autosave();
  }

  function showRosterPreview() {
    const p = Editor.state.product;
    if (!p) return;
    if (!app.roster.entries.length) { toast("先に名簿を入力してください", "warn"); return; }
    const views = Editor.designViews();
    const view = views[0] || "front";
    const el = $("#rosterPreview");
    const cards = app.roster.entries.map((e) => {
      /* 複数SVGを同一ページに並べるため realism(フィルタ)は無効化＝ID衝突回避 */
      const svg = Editor.variantSVG(memberDesigns(e), view, { realism: false });
      return `<figure class="fp-fig">
        <div class="fp-svg">${svg}</div>
        <figcaption><b>${escapeHtml(e.name || "(名前なし)")}</b>　背番号 ${escapeHtml(e.number || "-")}<br><span>サイズ ${escapeHtml(e.size)}</span></figcaption>
      </figure>`;
    }).join("");
    el.querySelector(".rp-inner").innerHTML = `
      <h2>👕 名簿プレビュー（${app.roster.entries.length}名・${VIEW_LABEL[view] || view}）</h2>
      <div class="fp-grid roster-grid">${cards}</div>
      <p class="fp-note">※ 差し込み文字（{名前}{番号}）を各メンバーの内容に置き換えて表示しています。</p>
      <button class="primary-btn" id="rpClose">閉じる</button>`;
    el.hidden = false;
    $("#rpClose").addEventListener("click", () => { el.hidden = true; });
  }

  /* ================= 全面プレビュー ================= */

  /* 前面・背面などデザインのある全ビューを1画面に並べて確認するモーダル。
   * SVGをライブDOMに直接差し込む（ページ側のフォントで正しく表示される。
   * <img>化すると secure static mode でフォントが壊れるため）。 */
  function showFullPreview() {
    const p = Editor.state.product;
    if (!p) return;
    const views = Editor.designViews();
    const list = views.length ? views : ["front"];
    const placements = Editor.getPlacements();
    const color = p.colors.find((c) => c.id === Editor.state.colorId);
    const el = $("#fullPreview");

    const panels = list.map((v) => {
      const meta = placements
        .filter((pl) => pl.view === v)
        .map((pl) => `${escapeHtml(pl.areaName)}：${methodOf(pl.methodId).short}・${pl.hasImage ? "フルカラー" : pl.colorCount + "色"}・約${(pl.widthMm / 10).toFixed(1)}×${(pl.heightMm / 10).toFixed(1)}cm`)
        .join("<br>");
      return `<figure class="fp-fig">
        <div class="fp-svg">${Editor.previewSVG(v)}</div>
        <figcaption><b>${VIEW_LABEL[v] || v}</b><br><span>${meta || "デザインなし"}</span></figcaption>
      </figure>`;
    }).join("");

    el.querySelector(".fp-inner").innerHTML = `
      <h2>🔍 仕上がりプレビュー（全面）</h2>
      <p class="fp-sub">${escapeHtml(p.name)}／カラー：${escapeHtml(color ? color.name : "-")}</p>
      <div class="fp-grid">${panels}</div>
      <p class="fp-note">※ 画面の色はsRGB表示です。実際のインク・糸の色味とは多少異なる場合があります。</p>
      <button class="primary-btn" id="fpClose">閉じる</button>`;
    el.hidden = false;
    $("#fpClose").addEventListener("click", () => { el.hidden = true; });
  }

  /* ================= 入稿データ（製造用） ================= */

  const AREA_SUFFIX = (id) => id;

  /* 入稿データ一式：位置ごとの入稿SVG(実寸・モックアップ無し) + 透過PNG + 指示書 + JSON */
  async function downloadProductionSet() {
    const p = Editor.state.product;
    if (!p) return;
    const areas = Editor.designAreas();
    if (!areas.length) { toast("先にデザインを作成してください", "warn"); return; }
    const no = orderNumber();
    let n = 0;

    if (rosterActive()) {
      /* 注文と同じ名簿バリデーションを通す（差し込み文字なし＝全員同一SVG、
       * サイズ不明行＝見積から除外した行の書き出しを防ぐ） */
      if (!hasPlaceholders()) { toast("名簿を使う場合は、デザインに {名前} または {番号} を入れてください", "warn"); return; }
      const bad = rosterBadRows();
      if (bad.length) { toast(`名簿のサイズが不明な行があります（${bad.map((b) => `${b.row}行目`).join("・")}）。修正してください`, "warn"); return; }
      /* 名簿：メンバーごとに差し込み済みの入稿SVGを書き出す */
      app.roster.entries.forEach((e, i) => {
        const dsn = memberDesigns(e);
        const tag = `${String(i + 1).padStart(2, "0")}_${e.number || ""}_${(e.name || "").replace(/[\\/:*?"<>|]/g, "")}`;
        for (const aid of areas) {
          const meta = Editor.areaMeta(aid);
          const svg = Editor.variantProductionSVG(dsn, aid);
          if (svg) { download(`${no}_${tag}_${meta.name}.svg`, new Blob([svg], { type: "image/svg+xml" })); n++; }
        }
      });
      download(`${no}_指示書.html`, new Blob([specSheetHTML()], { type: "text/html" }));
      downloadJSON();
      toast(`名簿${app.roster.entries.length}名分の入稿SVG（計${n}点）を書き出しました`);
      return;
    }

    for (const aid of areas) {
      const meta = Editor.areaMeta(aid);
      const svg = Editor.exportProductionSVG(aid);
      if (svg) { download(`${no}_${meta.name}_入稿.svg`, new Blob([svg], { type: "image/svg+xml" })); n++; }
      try {
        const png = await Editor.exportProductionPNG(aid, 200);
        download(`${no}_${meta.name}_入稿.png`, png);
      } catch (e) { /* PNGは補助なので失敗は無視 */ }
    }
    // 指示書HTMLとデザインデータJSON
    download(`${no}_指示書.html`, new Blob([specSheetHTML()], { type: "text/html" }));
    downloadJSON();
    toast(`入稿データ一式（${n}面）を書き出しました`);
  }

  /* 版下指示書（入稿指示書）のHTML。加工方法ごとに必要情報を出し分ける */
  function specSheetHTML() {
    const order = buildOrder();
    const p = Editor.state.product;
    /* 指示書の仕上がり実寸・製造警告も注文データと同じ名簿展開寸法で出す */
    let placements = Editor.getPlacements();
    if (rosterActive() && hasPlaceholders()) placements = rosterMaxPlacements(placements);
    const warns = productionWarnings(placements);

    const sections = placements.map((pl) => {
      const m = methodOf(pl.methodId);
      const thumb = Editor.areaThumbSVG(Editor.areas().find((a) => a.id === pl.areaId));
      let detail = "";
      /* 記載は必ず選択中の加工方法（pl.methodId）に従う。画像が置かれていても
       * シルク/刺繍を選んでいれば「フルカラー」とは書かない（指示の矛盾防止） */
      if (pl.methodId === "inkjet") {
        detail = `<tr><th>データ形式</th><td>フルカラー（インクジェット）。透過PNG／原寸。${pl.hasImage ? `実効解像度 約${pl.minImageDpi ? Math.round(pl.minImageDpi) : "-"}dpi（150dpi以上推奨）。` : ""}カラーはsRGB前提・当社でCMYK変換。</td></tr>`;
      } else {
        const cols = placementColors(pl);
        const rows = cols.map((c, i) =>
          `<tr><td><span class="chip" style="background:${c.hex}"></span></td><td>${i + 1}版</td><td>${escapeHtml(c.name)}</td><td>${c.code ? escapeHtml(c.code) : "（色指定未設定）"}</td></tr>`).join("");
        const sepLabel = pl.methodId === "silk" ? "色版分解（1色=1版）" : "使用糸色";
        detail = `<tr><th>${sepLabel}</th><td>
          <table class="cols"><tr><th></th><th>版</th><th>色名</th><th>指定色/糸番</th></tr>${rows}</table>
          ${needsUnderbase(pl) ? '<p class="u">＋ 白下地版（アンダーベース）1版</p>' : ""}
          ${pl.methodId === "embroidery" ? '<p class="u">※ 刺繍データ（DST/PES）は当社にてデジタイズします。</p>' : ""}
          ${pl.hasImage ? `<p class="u">⚠ この位置には<b>アップロード画像</b>が含まれます。${pl.methodId === "silk" ? "シルクスクリーンでは画像の色分解（1色=1版）が必要です。再現可否は製版前に確認してください。" : "刺繍では写真・グラデーションは再現できません。デジタイズ時に色数・表現を確定してください。"}</p>` : ""}
        </td></tr>`;
      }
      return `<div class="spec-area">
        <div class="spec-fig">${thumb}</div>
        <table class="spec-tbl">
          <tr><th>プリント位置</th><td><b>${escapeHtml(pl.areaName)}</b>（${VIEW_LABEL[pl.view] || "前面"}）</td></tr>
          <tr><th>加工方法</th><td>${m.icon} ${escapeHtml(m.name)}</td></tr>
          <tr><th>仕上がり実寸</th><td>約 ${(pl.widthMm / 10).toFixed(1)} × ${(pl.heightMm / 10).toFixed(1)} cm（範囲最大 ${pl.areaId && Editor.areaMeta(pl.areaId).mmW / 10}×${Editor.areaMeta(pl.areaId).mmH / 10}cm）</td></tr>
          ${detail}
        </table>
      </div>`;
    }).join("");

    const contactRows = [];
    const c = order.contact;
    if (c.company) contactRows.push(`会社名：${escapeHtml(c.company)}`);
    contactRows.push(`お名前：${escapeHtml(c.name || "-")}`, `メール：${escapeHtml(c.email || "-")}`, `電話：${escapeHtml(c.tel || "-")}`);
    if (c.zip || c.address) contactRows.push(`納品先：〒${escapeHtml(c.zip)} ${escapeHtml(c.address)}`);
    if (c.dueDate) contactRows.push(`希望納期：${escapeHtml(c.dueDate)}`);

    return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>入稿指示書 ${order.orderNo}</title>
<style>
  body{font-family:"Noto Sans JP",sans-serif;color:#111;margin:24px;font-size:13px;line-height:1.7}
  h1{font-size:20px;letter-spacing:.1em;border-bottom:3px solid #111;padding-bottom:6px}
  .meta{display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;margin:10px 0 18px;font-size:12px}
  .spec-area{display:flex;gap:16px;border:1px solid #999;border-radius:8px;padding:12px;margin:12px 0;page-break-inside:avoid}
  .spec-fig svg{width:150px;height:150px;border:1px solid #ddd;background:#fff}
  .spec-tbl{border-collapse:collapse;flex:1}
  .spec-tbl th,.spec-tbl td{border:1px solid #ccc;padding:6px 9px;text-align:left;vertical-align:top}
  .spec-tbl th{background:#f2f2f2;white-space:nowrap;width:120px}
  table.cols{border-collapse:collapse;margin:2px 0}
  table.cols th,table.cols td{border:1px solid #ddd;padding:3px 8px;font-size:12px}
  .chip{display:inline-block;width:16px;height:16px;border:1px solid #999;border-radius:3px;vertical-align:middle}
  .u{color:#b26a00;font-size:12px;margin:4px 0 0}
  .warn{background:#fff6e6;border:1px solid #e0b060;border-radius:6px;padding:8px 12px;margin:12px 0;font-size:12px}
  .note{color:#555;font-size:11px;margin-top:16px;line-height:1.9}
</style></head><body>
  <h1>入 稿 指 示 書</h1>
  <div class="meta">
    <div><b>注文番号：${order.orderNo}</b><br>${escapeHtml(order.product.name)}／カラー：${escapeHtml(order.product.color)}<br>数量：${order.quantities.map((x) => `${x.size}:${x.qty}`).join(" / ")}（計${order.totalQty}枚）</div>
    <div style="text-align:right">${contactRows.join("<br>")}</div>
  </div>
  ${warns.length ? `<div class="warn">⚠ 製造上の注意：<br>${warns.map(escapeHtml).join("<br>")}</div>` : ""}
  ${sections}
  ${order.roster && order.roster.length ? `
  <h2 style="font-size:15px;border-bottom:2px solid #111;padding-bottom:4px;margin:16px 0 6px">チーム名簿（${order.roster.length}名）— 各枚の差し込み内容</h2>
  <table class="spec-tbl" style="width:100%"><tr><th style="width:40px">#</th><th>名前（{名前}）</th><th>背番号（{番号}）</th><th style="width:80px">サイズ</th></tr>
  ${order.roster.map((e, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(e.name)}</td><td>${escapeHtml(e.number)}</td><td>${escapeHtml(e.size)}</td></tr>`).join("")}
  </table>
  <p class="u">※ 上記デザインの {名前}{番号} を、名簿の各内容に差し替えて1枚ずつ製作します。個別の入稿SVGも同梱しています。</p>` : ""}
  <div class="note">
    ※ 各プリント位置の入稿データ（SVG＝原寸ベクター／PNG＝透過原寸）を同梱しています。<br>
    ※ 文字は書体参照で書き出されています。確定製版前に当社にてアウトライン化（パス化）します。<br>
    ※ 色は画面表示（sRGB）です。実際のインク・糸色は上記の色名／指定色を基準とします。
  </div>
</body></html>`;
  }

  /* 指示書を印刷（新規ウィンドウ） */
  function printSpecSheet() {
    const p = Editor.state.product;
    if (!p || !Editor.designAreas().length) { toast("先にデザインを作成してください", "warn"); return; }
    const w = window.open("", "_blank");
    if (!w) { toast("ポップアップがブロックされました。ダウンロードをご利用ください", "warn"); return; }
    w.document.write(specSheetHTML());
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }

  /* ================= 注文送信 ================= */

  function validateOrder() {
    const errs = [];
    const p = Editor.state.product;
    if (!p) errs.push("商品が選択されていません。");
    if (!hasAnyDesign()) errs.push("デザインが作成されていません。");
    const eq = effectiveQuantities();
    const totalQty = p ? p.sizes.reduce((s, sz) => s + cleanQty(eq[sz]), 0) : 0;
    if (totalQty < 1) errs.push(rosterActive() ? "名簿が空です。名前・番号・サイズを入力してください。" : "数量が入力されていません。");
    if (rosterActive()) {
      const bad = rosterBadRows();
      if (bad.length) errs.push(`名簿にサイズが不明な行が${bad.length}行あります（${bad.map((b) => `${b.row}行目「${b.size || "未入力"}」`).join("、")}）。この商品のサイズ：${p ? p.sizes.join(" / ") : ""}`);
      /* 差し込み文字が無いと全員同じ仕上がりの入稿データが生成されてしまう */
      if (!hasPlaceholders()) errs.push("名簿を使う場合は、デザインの文字に {名前} または {番号}（{NAME}/{NUMBER}も可）を入れてください。STEP2のテキストで設定できます。");
    }
    const c = contactInfo();
    if (!c.name) errs.push("お名前を入力してください。");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email)) errs.push("有効なメールアドレスを入力してください。");
    if (!c.tel) errs.push("電話番号を入力してください。");
    const agree = $("#ordAgree");
    if (agree && !agree.checked) errs.push("利用規約・特定商取引法の表記に同意してください。");
    return errs;
  }

  async function submitOrder() {
    const errs = validateOrder();
    if (errs.length) {
      renderOrderErrors(errs);
      $("#orderErrors").scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    renderOrderErrors([]);
    const order = buildOrder();
    const btn = $("#btnOrder");
    btn.disabled = true;
    const orig = btn.textContent;
    btn.textContent = "送信中…";

    // 添付ファイル（入稿SVG＋プレビューPNG＋JSON）を用意
    let files = [];
    try {
      if (CONFIG.ORDER.attachFiles) files = await buildOrderFiles(order);
    } catch (e) { /* 添付生成失敗は本文送信で継続 */ }

    const provider = CONFIG.ORDER.provider;
    let sent = false;
    if (provider && provider !== "mailto" && CONFIG.ORDER.endpoint) {
      sent = await postOrder(order, files).catch(() => false);
    }

    btn.disabled = false;
    btn.textContent = orig;

    if (sent) {
      showOrderComplete(order, true);
    } else {
      // フォールバック：メール下書き＋本文コピー＋入稿データDL
      openMailFallback(order, files);
      showOrderComplete(order, false);
    }
  }

  async function buildOrderFiles(order) {
    const files = [];
    const areas = Editor.designAreas();
    /* 名簿モードでは基本版下（{名前}/{番号}のまま）は製作不可のため添付しない。
     * 手動書き出し（downloadProductionSet）と同じ挙動に合わせ、プレースホルダー
     * 入りのSVG/PNGが製作用データと誤認されるのを防ぐ。差し替え済みの
     * メンバー個別SVGのみを入稿データとする。 */
    const rosterMode = rosterActive() && hasPlaceholders();
    if (!rosterMode) {
      for (const aid of areas) {
        const meta = Editor.areaMeta(aid);
        const svg = Editor.exportProductionSVG(aid);
        if (svg) files.push({ name: `${order.orderNo}_${meta.name}.svg`, blob: new Blob([svg], { type: "image/svg+xml" }) });
        try { files.push({ name: `${order.orderNo}_${meta.name}.png`, blob: await Editor.exportProductionPNG(aid, 150) }); } catch (e) {}
      }
    }
    /* 名簿（チームユニフォーム）注文：{名前}{番号}を各メンバーに差し替えた
     * 個別の入稿SVGを添付する（テンプレのままでは製作できないため） */
    if (rosterMode) {
      app.roster.entries.forEach((e, i) => {
        const dsn = memberDesigns(e);
        const tag = `${String(i + 1).padStart(2, "0")}_${e.number || ""}_${(e.name || "").replace(/[\\/:*?"<>|]/g, "")}`;
        for (const aid of areas) {
          const meta = Editor.areaMeta(aid);
          const svg = Editor.variantProductionSVG(dsn, aid);
          if (svg) files.push({ name: `${order.orderNo}_${tag}_${meta.name}.svg`, blob: new Blob([svg], { type: "image/svg+xml" }) });
        }
      });
    }
    /* 入稿指示書（加工方法・色版/糸色・実寸・白下地警告・名簿一覧）も必ず添付する。
     * 店舗が受け取る製作情報の本体であり、手動書き出しと注文送信で内容を揃える */
    try {
      files.push({ name: `${order.orderNo}_指示書.html`, blob: new Blob([specSheetHTML()], { type: "text/html" }) });
    } catch (e) { /* 指示書生成失敗でも注文本文・他の添付は送る */ }
    const json = JSON.stringify({ app: "mitsumori", version: 2, order, editor: Editor.serialize() });
    files.push({ name: `${order.orderNo}_design.json`, blob: new Blob([json], { type: "application/json" }) });
    return files;
  }

  /* 依存ライブラリ無しの ZIP 生成（無圧縮/store方式・ファイル名UTF-8フラグ付き）。
   * web3forms が複数添付に対応していないため、入稿ファイル一式を1つに束ねる用途 */
  async function zipStore(files) {
    const enc = new TextEncoder();
    const T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
    const crc32 = (u8) => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = T[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
    const u16 = (v) => new Uint8Array([v & 255, (v >> 8) & 255]);
    const u32 = (v) => new Uint8Array([v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255]);
    const d = new Date();
    const dosTime = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF;
    const dosDate = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
    const parts = [], central = [];
    let offset = 0;
    for (const f of files) {
      const data = new Uint8Array(await f.blob.arrayBuffer());
      const name = enc.encode(f.name);
      const crc = crc32(data);
      parts.push(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(dosTime), u16(dosDate),
        u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name, data);
      central.push({ name, crc, size: data.length, offset });
      offset += 30 + name.length + data.length;
    }
    const cdStart = offset;
    for (const e of central) {
      parts.push(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(dosTime), u16(dosDate),
        u32(e.crc), u32(e.size), u32(e.size), u16(e.name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(e.offset), e.name);
      offset += 46 + e.name.length;
    }
    parts.push(u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length), u32(offset - cdStart), u32(cdStart), u16(0));
    return new Blob(parts, { type: "application/zip" });
  }

  async function postOrder(order, files) {
    const fd = new FormData();
    fd.append("orderNo", order.orderNo);
    fd.append("subject", `【注文】${order.orderNo} ${order.product.name}`);
    fd.append("message", orderText(order));
    fd.append("email", order.contact.email);
    fd.append("_replyto", order.contact.email);
    if (CONFIG.ORDER.provider === "web3forms" && CONFIG.ORDER.accessKey) fd.append("access_key", CONFIG.ORDER.accessKey);
    if (CONFIG.ORDER.attachFiles && files.length) {
      if (CONFIG.ORDER.provider === "web3forms" && files.length > 1) {
        /* web3forms は添付1つのみ対応 → ZIPに束ねて送る */
        fd.append("attachment", await zipStore(files), `${order.orderNo}_入稿データ.zip`);
      } else {
        for (const f of files) fd.append("attachment", f.blob, f.name);
      }
    }
    const res = await fetch(CONFIG.ORDER.endpoint, { method: "POST", body: fd, headers: { Accept: "application/json" } });
    if (!res.ok) return false;
    /* web3forms / formspree 等は HTTP 200 でも本文で失敗を返すことがある
     * （例: {success:false}）。JSON を見て成功フラグも確認する。 */
    try {
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      if (ct.includes("application/json")) {
        const j = await res.json();
        if (j && (j.success === false || j.ok === false || j.status === "error")) return false;
      }
    } catch (e) { /* JSON でなければ HTTP ステータスを信頼 */ }
    return true;
  }

  function openMailFallback(order, files) {
    // 入稿データを自動ダウンロードし、メール本文にも全文を載せる
    if (CONFIG.ORDER.attachFiles && files) files.forEach((f) => download(f.name, f.blob));
    const to = (CONFIG.ORDER && CONFIG.ORDER.toEmail) || SHOP.email;
    location.href = `mailto:${to}?subject=${encodeURIComponent(`【注文】${order.orderNo} ${order.product.name}`)}&body=${encodeURIComponent(orderText(order))}`;
  }

  function renderOrderErrors(errs) {
    const box = $("#orderErrors");
    if (!box) return;
    box.innerHTML = errs.length
      ? `<div class="alert error">ご注文の前に、次をご確認ください：<ul>${errs.map((e) => `<li>${escapeHtml(e)}</li>`).join("")}</ul></div>`
      : "";
  }

  /* 注文完了（または送信手順の案内）画面をオーバーレイ表示 */
  function showOrderComplete(order, autoSent) {
    const el = $("#orderComplete");
    if (!el) return;
    const to = (CONFIG.ORDER && CONFIG.ORDER.toEmail) || SHOP.email;
    el.querySelector(".oc-inner").innerHTML = `
      <div class="oc-badge">${autoSent ? "✅" : "✉"}</div>
      <h2>${autoSent ? "ご注文を受け付けました" : "メールソフトが開きます"}</h2>
      <p class="oc-no">注文番号：<b>${escapeHtml(order.orderNo)}</b></p>
      ${autoSent
        ? `<p>担当者より${escapeHtml(order.contact.email)}宛に確認のご連絡をいたします。デザイン確認後、正式なお見積もり・納期をご案内します。</p>`
        : `<p>開いたメールを<b>そのまま送信</b>してください。入稿データ（SVG・PNG・JSON）は自動でダウンロードされました。メールに<b>添付</b>してお送りください。</p>
           <p class="oc-fallback">メールが開かない場合は、下記の内容を <b>${escapeHtml(to)}</b> へお送りください。</p>
           <textarea class="oc-text" readonly rows="6">${escapeHtml(orderText(order))}</textarea>
           <button class="ghost-btn small" id="ocCopy">📋 本文をコピー</button>`}
      <p class="oc-tel">お急ぎ・ご不明な点は お電話ください：<b>${escapeHtml((CONFIG.LEGAL && CONFIG.LEGAL.tel) || SHOP.tel)}</b></p>
      <button class="primary-btn" id="ocClose">閉じる</button>
    `;
    el.hidden = false;
    const copy = $("#ocCopy");
    if (copy) copy.addEventListener("click", () => {
      navigator.clipboard.writeText(orderText(order)).then(() => toast("本文をコピーしました📋")).catch(() => {});
    });
    $("#ocClose").addEventListener("click", () => { el.hidden = true; });
  }

  /* ================= 共有URL =================
   * デザインを deflate 圧縮 + base64url にして URL ハッシュに埋め込みます。
   * サーバー不要でお客様にそのままリンクを送れます（画像は含まれません）。 */

  function b64urlEncode(bytes) {
    let s = "";
    bytes.forEach((b) => (s += String.fromCharCode(b)));
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function b64urlDecode(str) {
    const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  }
  async function deflate(str) {
    const stream = new Blob([new TextEncoder().encode(str)]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function inflate(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new TextDecoder().decode(await new Response(stream).arrayBuffer());
  }

  async function buildShareURL() {
    const data = Editor.serialize();
    let removed = 0;
    const designs = {};
    for (const [k, d] of Object.entries(data.designs || {})) {
      const objs = (d.objects || []).filter((o) => o.type !== "image");
      removed += (d.objects || []).length - objs.length;
      designs[k] = { methodId: d.methodId, objects: objs };
    }
    /* 共有URLは第三者に送るため、個人情報（氏名・連絡先・名簿）は一切含めない。
     * デザインと数量のみを埋め込む。名簿使用中はサイズ別集計値を数量として入れる
     * （名前・背番号は含まれない）。 */
    const payload = JSON.stringify({
      ...data, designs,
      quantities: cleanQuantities(effectiveQuantities()),
    });
    let url;
    if (typeof CompressionStream !== "undefined") {
      url = location.origin + location.pathname + "#d=" + b64urlEncode(await deflate(payload));
    } else {
      url = location.origin + location.pathname + "#D=" + b64urlEncode(new TextEncoder().encode(payload));
    }
    return { url, removed };
  }

  async function shareDesign() {
    if (!Editor.state.product) {
      toast("先に商品を選んでデザインを作成してください", "warn");
      return;
    }
    try {
      const { url, removed } = await buildShareURL();
      await navigator.clipboard.writeText(url);
      toast("共有リンクをコピーしました📋" + (removed ? `（画像${removed}点はリンクに含まれません）` : ""));
    } catch (e) {
      try {
        const { url } = await buildShareURL();
        prompt("このURLをコピーして共有してください", url);
      } catch (e2) {
        toast("共有リンクを作成できませんでした", "warn");
      }
    }
  }

  async function applyShareHash() {
    const h = location.hash || "";
    if (!h.startsWith("#d=") && !h.startsWith("#D=")) return false;
    const compressed = h[1] === "d";
    if (compressed && typeof DecompressionStream === "undefined") {
      toast("お使いのブラウザはこの共有リンクを開けません。最新のブラウザでお試しください", "warn");
      return false;
    }
    try {
      const raw = h.slice(3);
      const json = compressed
        ? await inflate(b64urlDecode(raw))
        : new TextDecoder().decode(b64urlDecode(raw));
      const data = JSON.parse(json);
      /* 共有デザインの読み込みで、閲覧者が作業中の自動保存を消さない
       * （実際に編集を始めるまで autosave をロックする） */
      /* 共有デザインの読み込みで、受け手の作業中データ（自動保存）を消さない。
       * shareLocked の間は自動保存をスキップし、受け手が実際に編集を始めた最初の
       * 変更でロック解除して保存する。shareLoadPending は「読込そのものが起こす
       * 変更（＝保存すべきでない）」を1回だけ読み飛ばすための目印。
       * ※onChange は 60ms デバウンスされるため、ここでの単純な cancel では防げない。 */
      shareLocked = true;
      shareLoadPending = true;
      if (!Editor.load(data)) { shareLocked = false; shareLoadPending = false; return false; }
      app.orderNo = null; /* 共有から読み込んだデザインは別注文として発番し直す */
      app.quantities = cleanQuantities(data.quantities || data.q);
      /* 共有リンクには個人情報を含めない方針のため、連絡先は復元しない */
      goStep(2);
      renderEditorPanels();
      /* 取り込み後はURLからハッシュを除去：このURLを再読み込みしても
       * 受け手の編集（自動保存）が共有デザインで上書きされないようにする */
      try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
      toast("共有されたデザインを読み込みました");
      return true;
    } catch (e) {
      shareLocked = false;
      console.warn("share hash decode failed", e);
      toast("共有リンクを読み込めませんでした", "warn");
      return false;
    }
  }

  /* ================= 自動保存 ================= */

  let shareLocked = false;
  let shareLoadPending = false;

  const autosave = debounce(() => {
    if (!Editor.state.product) return;
    /* 共有リンクを開いた直後のガード：読込自体が起こす変更は保存せず、
     * 受け手の実際の編集（次の変更）でロックを解除して保存する。 */
    if (shareLocked) {
      if (shareLoadPending) { shareLoadPending = false; return; }
      shareLocked = false;
    }
    try {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({
        editor: Editor.serialize(),
        quantities: cleanQuantities(app.quantities),
        contact: contactInfo(),
        roster: app.roster,
        savedAt: Date.now(),
      }));
    } catch (e) { /* 容量超過などは無視（画像入りは localStorage 上限に注意） */ }
  }, 500);

  function checkAutosave() {
    let data = null;
    try { data = JSON.parse(localStorage.getItem(AUTOSAVE_KEY)); } catch (e) { /* noop */ }
    if (!data || !data.editor || !data.editor.productId) return;
    const banner = $("#restoreBanner");
    banner.hidden = false;
    $("#btnRestore").addEventListener("click", () => {
      try {
        if (Editor.load(data.editor)) {
          app.quantities = cleanQuantities(data.quantities);
          applyContact(data.contact);
          restoreRoster(data.roster);
          if (data.customerName && $("#customerName")) $("#customerName").value = data.customerName; // 旧形式
          banner.hidden = true;
          goStep(2);
          renderEditorPanels();
        }
      } catch (e) {
        toast("保存データを復元できませんでした", "warn");
        banner.hidden = true;
      }
    });
    $("#btnDiscard").addEventListener("click", () => {
      localStorage.removeItem(AUTOSAVE_KEY);
      banner.hidden = true;
    });
  }

  /* ================= 小物 ================= */

  /** 画面右下の通知トースト */
  function toast(msg, type = "ok") {
    const box = $("#toastBox");
    if (!box) return;
    const el = document.createElement("div");
    el.className = "toast " + type;
    el.textContent = msg;
    box.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 350);
    }, 3200);
  }

  function escapeHtml(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function debounce(fn, ms) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  document.addEventListener("DOMContentLoaded", init);
})();
