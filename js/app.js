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
    $("#btnPreview").addEventListener("click", (e) => e.currentTarget.classList.toggle("on", Editor.togglePreview()));

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
      card.innerHTML = `
        <svg viewBox="40 70 620 620">${Mockups.renderMockup(p.mockup, p.colors[0].hex, "front")}</svg>
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
    if (Editor.state.product && Editor.state.product.id !== p.id && hasAnyDesign()) {
      if (!confirm("商品を変更すると現在のデザインはリセットされます。よろしいですか？")) return;
    }
    if (!Editor.state.product || Editor.state.product.id !== p.id) {
      Editor.setProduct(p);
      app.quantities = {};
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
          <p class="upload-note" style="margin:0 0 10px">クリックで現在のプリント位置（${(p.printAreas.find((a) => a.id === Editor.state.areaId) || {}).name || ""}）に配置。文字はあとから自由に書き換えできます。</p>
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
        </div>`;
      bindImagePanel();

    } else if (app.tab === "method") {
      const d = Editor.designFor(Editor.state.areaId);
      const area = p.printAreas.find((a) => a.id === Editor.state.areaId);
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
    bar.innerHTML = p.printAreas.map((a) => {
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
    const area = p.printAreas.find((a) => a.id === Editor.state.areaId);
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

  function onEditorChange() {
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
    box.innerHTML = p.sizes.map((s) => {
      const sur = p.sizeSurcharge[s];
      return `<div class="size-cell">
        <label>${s === "FREE" ? "数量" : escapeHtml(s)}</label>
        <input type="number" min="0" max="99999" inputmode="numeric" data-size="${escapeHtml(s)}" value="${cleanQty(app.quantities[s]) || ""}" placeholder="0">
        ${sur ? `<span class="size-note">+¥${sur}/枚</span>` : ""}
      </div>`;
    }).join("");
    box.querySelectorAll("input[data-size]").forEach((inp) =>
      inp.addEventListener("input", () => {
        app.quantities[inp.dataset.size] = cleanQty(inp.value);
        refreshQuote();
        autosave();
      })
    );
  }

  function refreshQuote() {
    const p = Editor.state.product;
    if (!p) return;
    const placements = Editor.getPlacements();
    const q = Quote.computeQuote({
      productId: p.id,
      quantities: app.quantities,
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
      const a = Editor.state.product.printAreas.find((x) => x.id === pl.areaId);
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
    const placements = Editor.getPlacements();
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
      const a = Editor.state.product.printAreas.find((x) => x.id === pl.areaId);
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
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    const rnd = String(Math.floor(1000 + (Date.now() % 9000)));
    app.orderNo = `${(CONFIG.ORDER && CONFIG.ORDER.autoNumber) || "ORD"}-${ymd}-${rnd}`;
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
    const placements = Editor.getPlacements();
    const color = p.colors.find((c) => c.id === Editor.state.colorId);
    const sizes = p.sizes.filter((s) => app.quantities[s] > 0).map((s) => ({ size: s, qty: app.quantities[s] }));
    return {
      orderNo: orderNumber(),
      createdAt: new Date().toISOString(),
      product: { id: p.id, name: p.name, color: color ? color.name : "", colorDark: !!(color && color.dark) },
      quantities: sizes,
      totalQty: q ? q.totalQty : 0,
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
    };
    download(`design_${stamp()}.json`, new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  }

  function loadJSONFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Editor.load(data.editor)) throw new Error("bad data");
        app.quantities = cleanQuantities(data.quantities);
        applyContact(data.contact);
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
  const VIEW_LABEL = { front: "前面", back: "背面" };

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
    const placements = Editor.getPlacements();
    const warns = productionWarnings(placements);

    const sections = placements.map((pl) => {
      const m = methodOf(pl.methodId);
      const thumb = Editor.areaThumbSVG(p.printAreas.find((a) => a.id === pl.areaId));
      let detail = "";
      if (pl.hasImage) {
        detail = `<tr><th>データ形式</th><td>フルカラー（インクジェット）。透過PNG／原寸。実効解像度 約${pl.minImageDpi ? Math.round(pl.minImageDpi) : "-"}dpi（150dpi以上推奨）。カラーはsRGB前提・当社でCMYK変換。</td></tr>`;
      } else {
        const cols = placementColors(pl);
        const rows = cols.map((c, i) =>
          `<tr><td><span class="chip" style="background:${c.hex}"></span></td><td>${i + 1}版</td><td>${escapeHtml(c.name)}</td><td>${c.code ? escapeHtml(c.code) : "（色指定未設定）"}</td></tr>`).join("");
        const sepLabel = pl.methodId === "silk" ? "色版分解（1色=1版）" : "使用糸色";
        detail = `<tr><th>${sepLabel}</th><td>
          <table class="cols"><tr><th></th><th>版</th><th>色名</th><th>指定色/糸番</th></tr>${rows}</table>
          ${needsUnderbase(pl) ? '<p class="u">＋ 白下地版（アンダーベース）1版</p>' : ""}
          ${pl.methodId === "embroidery" ? '<p class="u">※ 刺繍データ（DST/PES）は当社にてデジタイズします。</p>' : ""}
        </td></tr>`;
      }
      return `<div class="spec-area">
        <div class="spec-fig">${thumb}</div>
        <table class="spec-tbl">
          <tr><th>プリント位置</th><td><b>${escapeHtml(pl.areaName)}</b>（${pl.view === "back" ? "背面" : "前面"}）</td></tr>
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
    const totalQty = p ? p.sizes.reduce((s, sz) => s + cleanQty(app.quantities[sz]), 0) : 0;
    if (totalQty < 1) errs.push("数量が入力されていません。");
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
    for (const aid of Editor.designAreas()) {
      const meta = Editor.areaMeta(aid);
      const svg = Editor.exportProductionSVG(aid);
      if (svg) files.push({ name: `${order.orderNo}_${meta.name}.svg`, blob: new Blob([svg], { type: "image/svg+xml" }) });
      try { files.push({ name: `${order.orderNo}_${meta.name}.png`, blob: await Editor.exportProductionPNG(aid, 150) }); } catch (e) {}
    }
    const json = JSON.stringify({ app: "mitsumori", version: 2, order, editor: Editor.serialize() });
    files.push({ name: `${order.orderNo}_design.json`, blob: new Blob([json], { type: "application/json" }) });
    return files;
  }

  async function postOrder(order, files) {
    const fd = new FormData();
    fd.append("orderNo", order.orderNo);
    fd.append("subject", `【注文】${order.orderNo} ${order.product.name}`);
    fd.append("message", orderText(order));
    fd.append("email", order.contact.email);
    fd.append("_replyto", order.contact.email);
    if (CONFIG.ORDER.provider === "web3forms" && CONFIG.ORDER.accessKey) fd.append("access_key", CONFIG.ORDER.accessKey);
    if (CONFIG.ORDER.attachFiles) for (const f of files) fd.append("attachment", f.blob, f.name);
    const res = await fetch(CONFIG.ORDER.endpoint, { method: "POST", body: fd, headers: { Accept: "application/json" } });
    return res.ok;
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
    /* 共有URLは第三者に送るため、個人情報（氏名・連絡先）は一切含めない。
     * デザインと数量のみを埋め込む。 */
    const payload = JSON.stringify({
      ...data, designs,
      quantities: cleanQuantities(app.quantities),
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
      shareLocked = true;
      if (!Editor.load(data)) { shareLocked = false; return false; }
      app.quantities = cleanQuantities(data.quantities || data.q);
      /* 共有リンクには個人情報を含めない方針のため、連絡先は復元しない */
      ["pointerdown", "keydown"].forEach((ev) =>
        document.addEventListener(ev, function unlock() { shareLocked = false; document.removeEventListener(ev, unlock); }, { once: true }));
      goStep(2);
      renderEditorPanels();
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

  const autosave = debounce(() => {
    if (!Editor.state.product || shareLocked) return;
    try {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({
        editor: Editor.serialize(),
        quantities: cleanQuantities(app.quantities),
        contact: contactInfo(),
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
