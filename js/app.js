/* =========================================================================
 * app.js — アプリケーション本体（画面遷移・パネルUI・見積もり連携）
 * ========================================================================= */
(function () {
  "use strict";

  const { SHOP, PRODUCTS, METHODS, FONTS, THREAD_COLORS, INK_COLORS, FREE_COLORS } = CONFIG;
  const $ = (sel) => document.querySelector(sel);
  const AUTOSAVE_KEY = "mitsumori.autosave.v1";

  const app = {
    step: 1,
    tab: "color",
    quantities: {},
    lastQuote: null,
    textDefaults: { text: "サンプル", fontId: "gothic", fontSize: 40, fill: "#111111", stroke: "#ffffff", strokeWidth: 0, letterSpacing: 0, arch: 0, vertical: false },
    stampFill: "#111111",
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
    $("#btnOrderMail").addEventListener("click", orderByMail);
    $("#btnDlPng").addEventListener("click", downloadPNG);
    $("#btnDlSvg").addEventListener("click", downloadSVG);
    $("#btnDlJson").addEventListener("click", downloadJSON);
    $("#customerName").addEventListener("input", autosave);
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
    const m = METHODS[d.methodId];
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
        <label>${s === "FREE" ? "数量" : s}</label>
        <input type="number" min="0" max="9999" inputmode="numeric" data-size="${s}" value="${app.quantities[s] || ""}" placeholder="0">
        ${sur ? `<span class="size-note">+¥${sur}/枚</span>` : ""}
      </div>`;
    }).join("");
    box.querySelectorAll("input[data-size]").forEach((inp) =>
      inp.addEventListener("input", () => {
        app.quantities[inp.dataset.size] = Number(inp.value) || 0;
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

    /* 警告・エラー表示 */
    let alertHtml = "";
    for (const e of q.errors || []) alertHtml += `<div class="alert error">✕ ${e}</div>`;
    for (const w of q.warnings || []) alertHtml += `<div class="alert warn">⚠ ${w}</div>`;
    for (const pl of placements.filter((x) => x.lowRes)) {
      alertHtml += `<div class="alert warn">⚠ ${pl.areaName}: 画像の解像度が低いため粗く仕上がる可能性があります。</div>`;
    }
    alerts.innerHTML = alertHtml;

    /* デザインサマリ */
    $("#designSummary").innerHTML = placements.map((pl) => {
      const a = Editor.state.product.printAreas.find((x) => x.id === pl.areaId);
      return `<div class="ds-item">${Editor.areaThumbSVG(a)}
        <div class="ds-name">${pl.areaName}</div>
        <div class="ds-meta">${METHODS[pl.methodId].short}・${pl.hasImage ? "フルカラー" : pl.colorCount + "色"}<br>約${(pl.widthMm / 10).toFixed(1)}×${(pl.heightMm / 10).toFixed(1)}cm</div>
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
        <div class="qt-row"><span>小計（税抜）</span><span>${Quote.yen(q.subtotal + q.shipping)}</span></div>
        <div class="qt-row"><span>消費税（${Math.round(SHOP.taxRate * 100)}%）</span><span>${Quote.yen(q.tax)}</span></div>
        <div class="qt-row total"><span>合計（税込）</span><span>${Quote.yen(q.total)}</span></div>
        <div class="qt-row per"><span>1枚あたり（税込・送料除く）</span><span>${Quote.yen(q.perPiece)} × ${q.totalQty}枚</span></div>
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
      return `<figure>${Editor.areaThumbSVG(a)}<figcaption>${pl.areaName}（${METHODS[pl.methodId].short}）</figcaption></figure>`;
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
          <tr><td colspan="3" class="num">小計（税抜）</td><td class="num">${Quote.yen(q.subtotal + q.shipping)}</td></tr>
          <tr><td colspan="3" class="num">消費税（${Math.round(SHOP.taxRate * 100)}%）</td><td class="num">${Quote.yen(q.tax)}</td></tr>
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

  /* ================= 注文メール・ダウンロード ================= */

  function orderByMail() {
    const q = app.lastQuote;
    const p = Editor.state.product;
    if (!p) return;
    const placements = Editor.getPlacements();
    const sizes = p.sizes.filter((s) => app.quantities[s] > 0).map((s) => `${s}:${app.quantities[s]}枚`).join(" / ") || "（未入力）";
    const color = p.colors.find((c) => c.id === Editor.state.colorId);
    const lines = [
      "【デザインシミュレーターからの注文・問い合わせ】", "",
      `商品：${p.name}`,
      `カラー：${color ? color.name : "-"}`,
      `数量：${sizes}`,
      ...placements.map((pl) => `・${pl.areaName}：${METHODS[pl.methodId].name} ${pl.hasImage ? "フルカラー" : pl.colorCount + "色"} 約${(pl.widthMm / 10).toFixed(1)}×${(pl.heightMm / 10).toFixed(1)}cm`),
      "",
      q && q.ok ? `概算合計：${Quote.yen(q.total)}（税込）` : "概算：未計算",
      "",
      "※ このメールにデザインデータ（保存したJSONファイル）を添付してお送りください。",
    ];
    location.href = `mailto:${SHOP.email}?subject=${encodeURIComponent("【見積もり・注文】" + p.name)}&body=${encodeURIComponent(lines.join("\n"))}`;
  }

  function download(filename, blob) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  function stamp() {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}_${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
  }

  function downloadJSON() {
    if (!Editor.state.product) { alert("商品を選択してください。"); return; }
    const data = {
      app: "mitsumori-design-simulator",
      version: 1,
      savedAt: new Date().toISOString(),
      editor: Editor.serialize(),
      quantities: app.quantities,
      customerName: $("#customerName") ? $("#customerName").value : "",
    };
    download(`design_${stamp()}.json`, new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  }

  function loadJSONFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Editor.load(data.editor)) throw new Error("bad data");
        app.quantities = data.quantities || {};
        if (data.customerName) $("#customerName").value = data.customerName;
        goStep(2);
        renderEditorPanels();
      } catch (e) {
        alert("デザインデータを読み込めませんでした。ファイルをご確認ください。");
      }
    };
    reader.readAsText(file);
  }

  function downloadSVG() {
    if (!Editor.state.product) return;
    download(`design_${stamp()}.svg`, new Blob([Editor.exportSVG()], { type: "image/svg+xml" }));
  }

  function downloadPNG() {
    if (!Editor.state.product) return;
    Editor.exportPNG(2)
      .then((blob) => download(`design_${stamp()}.png`, blob))
      .catch(() => alert("PNGの生成に失敗しました。SVG形式をお試しください。"));
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
    const payload = JSON.stringify({ ...data, designs, q: app.quantities });
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
    try {
      const raw = h.slice(3);
      const json = h[1] === "d"
        ? await inflate(b64urlDecode(raw))
        : new TextDecoder().decode(b64urlDecode(raw));
      const data = JSON.parse(json);
      if (!Editor.load(data)) return false;
      app.quantities = data.q || {};
      goStep(2);
      renderEditorPanels();
      toast("共有されたデザインを読み込みました");
      return true;
    } catch (e) {
      console.warn("share hash decode failed", e);
      return false;
    }
  }

  /* ================= 自動保存 ================= */

  const autosave = debounce(() => {
    if (!Editor.state.product) return;
    try {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({
        editor: Editor.serialize(),
        quantities: app.quantities,
        savedAt: Date.now(),
      }));
    } catch (e) { /* 容量超過などは無視 */ }
  }, 500);

  function checkAutosave() {
    let data = null;
    try { data = JSON.parse(localStorage.getItem(AUTOSAVE_KEY)); } catch (e) { /* noop */ }
    if (!data || !data.editor || !data.editor.productId) return;
    const banner = $("#restoreBanner");
    banner.hidden = false;
    $("#btnRestore").addEventListener("click", () => {
      if (Editor.load(data.editor)) {
        app.quantities = data.quantities || {};
        banner.hidden = true;
        goStep(2);
        renderEditorPanels();
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
