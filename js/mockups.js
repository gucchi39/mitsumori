/* =========================================================================
 * mockups.js — 商品モックアップ（SVG）
 *
 * 各商品の前面・背面イラストを 700×760 の viewBox に描画します。
 * ボディカラーを引数に取り、縫い目・影は色から自動生成します。
 * ========================================================================= */
(function () {
  "use strict";

  /* hex カラーを暗く/明るくする（amt: -1.0〜1.0） */
  function shade(hex, amt) {
    const n = hex.replace("#", "");
    const num = parseInt(n.length === 3 ? n.split("").map((c) => c + c).join("") : n, 16);
    let r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
    if (amt < 0) {
      const f = 1 + amt;
      r *= f; g *= f; b *= f;
    } else {
      r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt;
    }
    const to = (v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0");
    return `#${to(r)}${to(g)}${to(b)}`;
  }

  /* 共通: 白ボディでも輪郭が見えるようにストローク色を決める */
  function edge(c) { return shade(c, -0.28); }
  function seam(c) { return shade(c, -0.16); }
  function rib(c)  { return shade(c, -0.08); }

  const GROUND = `<ellipse cx="350" cy="650" rx="250" ry="26" fill="rgba(30,40,60,0.07)"/>`;

  /* ---------------- Tシャツ ---------------- */
  function tshirt(c, view) {
    const E = edge(c), S = seam(c), R = rib(c);
    const body = `
      M285 178 C250 186 215 198 192 210 L88 296 L118 366 C118 366 176 340 212 320
      L222 602 L478 602 L488 320 C524 340 582 366 582 366 L612 296 L508 210
      C485 198 450 186 415 178`;
    const neckFront = `C404 214 350 232 350 232 C350 232 296 214 285 178 Z`;
    const neckBack  = `C404 190 350 197 350 197 C350 197 296 190 285 178 Z`;
    const shape = `${body} ${view === "back" ? neckBack : neckFront}`;
    const collarFront = `M285 178 C296 214 350 232 350 232 C350 232 404 214 415 178
      C408 176 402 174 396 173 C388 200 350 214 350 214 C350 214 312 200 304 173 C298 174 292 176 285 178 Z`;
    const collarBack = `M285 178 C296 190 350 197 350 197 C350 197 404 190 415 178
      C408 176 402 174 396 173 C390 183 350 188 350 188 C350 188 310 183 304 173 C298 174 292 176 285 178 Z`;
    const collar = view === "back" ? collarBack : collarFront;
    /* 立体シェーディング（生地の丸み・脇の影・裾のたわみ）を本体色の上に重ねる */
    const shade3d = `<g clip-path="url(#tsc)">
      <rect x="80" y="170" width="540" height="450" fill="url(#tsg-vert)"/>
      <rect x="80" y="170" width="540" height="450" fill="url(#tsg-side)"/>
      <ellipse cx="350" cy="352" rx="158" ry="188" fill="url(#tsg-hi)"/>
      <path d="M212 320 C244 344 254 386 248 430 C230 388 218 352 206 330 Z" fill="#000" opacity="0.06"/>
      <path d="M488 320 C456 344 446 386 452 430 C470 388 482 352 494 330 Z" fill="#000" opacity="0.06"/>
      <path d="M300 452 C306 508 301 556 296 600 L285 600 C292 552 295 508 291 454 Z" fill="#000" opacity="0.05"/>
      <path d="M400 452 C394 508 399 556 404 600 L415 600 C408 552 405 508 409 454 Z" fill="#000" opacity="0.045"/>
      <path d="M350 236 C330 250 318 268 314 300 C300 268 316 244 340 232 Z" fill="#000" opacity="0.05"/>
    </g>`;
    /* 襟のリブ（編み目）を細線で表現 */
    const collarRibs = view === "back" ? "" :
      `<path d="M312 196 C330 210 350 216 350 216 C350 216 370 210 388 196" fill="none" stroke="${shade(c, -0.22)}" stroke-width="1.4" opacity="0.6"/>`;
    const defs = `<defs>
      <clipPath id="tsc"><path d="${shape}"/></clipPath>
      <radialGradient id="tsg-hi" cx="50%" cy="37%" r="44%">
        <stop offset="0%" stop-color="#fff" stop-opacity="0.20"/>
        <stop offset="55%" stop-color="#fff" stop-opacity="0.06"/>
        <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="tsg-side" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#000" stop-opacity="0.26"/>
        <stop offset="15%" stop-color="#000" stop-opacity="0.02"/>
        <stop offset="50%" stop-color="#000" stop-opacity="0"/>
        <stop offset="85%" stop-color="#000" stop-opacity="0.02"/>
        <stop offset="100%" stop-color="#000" stop-opacity="0.26"/>
      </linearGradient>
      <linearGradient id="tsg-vert" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#000" stop-opacity="0.12"/>
        <stop offset="16%" stop-color="#000" stop-opacity="0"/>
        <stop offset="82%" stop-color="#000" stop-opacity="0"/>
        <stop offset="100%" stop-color="#000" stop-opacity="0.13"/>
      </linearGradient>
    </defs>`;
    return `${GROUND}
      ${defs}
      <path d="${shape}" fill="${c}" stroke="${E}" stroke-width="4" stroke-linejoin="round"/>
      ${shade3d}
      <path d="${collar}" fill="${R}" stroke="${E}" stroke-width="3" stroke-linejoin="round"/>
      ${collarRibs}
      <path d="M192 210 C202 258 208 290 212 320" fill="none" stroke="${S}" stroke-width="3"/>
      <path d="M508 210 C498 258 492 290 488 320" fill="none" stroke="${S}" stroke-width="3"/>
      <path d="M226 588 L474 588" stroke="${S}" stroke-width="2.5" stroke-dasharray="7 5" fill="none"/>
      <path d="M122 358 L206 326 M578 358 L494 326" stroke="${S}" stroke-width="2.5" stroke-dasharray="7 5" fill="none"/>`;
  }

  /* ---------------- 袖ビュー（Tシャツを側面から見たシルエット） ----------------
   * 参考サービスのように、シャツ全体を真横から見た自然な大きさで表示する。
   * 上部が肩・半袖、下が胴・裾。版面（プリント範囲）は袖側の面にのる。
   * 「袖だけ拡大」ではなく、シャツ1枚をそのまま側面表示。 */
  function sleeveSide(c) {
    const E = edge(c), S = seam(c), R = rib(c);
    /* シャツの側面シルエット（1枚もの・大きめ）。前（左）に首の開き、
     * 上に袖山、右へ背中、下に裾。 */
    const shirt = `
      M250 252
      C252 224 262 202 280 192
      C302 178 334 170 366 170
      C416 170 456 204 474 256
      C488 300 493 350 494 398
      C496 478 493 552 487 580
      Q483 608 449 609
      L267 609
      Q233 608 231 577
      C225 500 227 398 233 340
      C236 298 240 268 250 252 Z`;
    /* 首の開き（側面から見た衿ぐり）：前上部の小さなえぐり */
    const neck = `M258 250 C260 226 268 206 284 198 C298 191 312 196 316 208 C300 210 286 224 282 248 Z`;
    return `${GROUND}
      <defs>
        <clipPath id="slsc"><path d="${shirt}"/></clipPath>
        <radialGradient id="slg-hi" cx="48%" cy="36%" r="60%">
          <stop offset="0%" stop-color="#fff" stop-opacity="0.20"/>
          <stop offset="60%" stop-color="#fff" stop-opacity="0.05"/>
          <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="slg-side" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#000" stop-opacity="0.16"/>
          <stop offset="22%" stop-color="#000" stop-opacity="0"/>
          <stop offset="78%" stop-color="#000" stop-opacity="0"/>
          <stop offset="100%" stop-color="#000" stop-opacity="0.20"/>
        </linearGradient>
      </defs>
      <path d="${shirt}" fill="${c}" stroke="${E}" stroke-width="4" stroke-linejoin="round"/>
      <g clip-path="url(#slsc)">
        <rect x="220" y="160" width="290" height="450" fill="url(#slg-side)"/>
        <ellipse cx="350" cy="360" rx="170" ry="220" fill="url(#slg-hi)"/>
        <!-- 首の開き（衿） -->
        <path d="${neck}" fill="${R}" stroke="${S}" stroke-width="2"/>
        <!-- 袖ぐり（袖と身頃の切り替え縫い目） -->
        <path d="M300 196 C270 250 262 320 268 392 C272 448 288 520 312 574" fill="none" stroke="${S}" stroke-width="2.5"/>
        <!-- 袖口（半袖の裾）＝袖側の面の下端 -->
        <path d="M268 392 C320 372 430 372 470 388" fill="none" stroke="${S}" stroke-width="2.5" stroke-dasharray="7 5"/>
        <!-- 裾リブ -->
        <path d="M235 566 L485 566" stroke="${S}" stroke-width="2.5" stroke-dasharray="7 5"/>
      </g>`;
  }

  /* ---------------- ポロシャツ ---------------- */
  function polo(c, view) {
    const E = edge(c), S = seam(c), R = rib(c);
    const body = `
      M290 182 C252 190 220 200 196 212 L100 290 L128 356 C160 340 190 328 214 318
      L222 604 L478 604 L486 318 C510 328 540 340 572 356 L600 290 L504 212
      C480 200 448 190 410 182`;
    if (view === "back") {
      return `${GROUND}
        <path d="${body} C400 194 350 198 350 198 C350 198 300 194 290 182 Z"
          fill="${c}" stroke="${E}" stroke-width="4" stroke-linejoin="round"/>
        <path d="M290 182 C300 194 350 198 350 198 C350 198 400 194 410 182 L404 168 C380 178 320 178 296 168 Z"
          fill="${R}" stroke="${E}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M196 212 C206 256 210 288 214 318 M504 212 C494 256 490 288 486 318" fill="none" stroke="${S}" stroke-width="3"/>
        <path d="M226 590 L474 590" stroke="${S}" stroke-width="2.5" stroke-dasharray="7 5" fill="none"/>`;
    }
    return `${GROUND}
      <path d="${body} L396 186 L364 246 L350 250 L336 246 L304 186 Z"
        fill="${c}" stroke="${E}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M336 246 L364 246 L362 330 L338 330 Z" fill="${R}" stroke="${S}" stroke-width="2.5"/>
      <circle cx="350" cy="272" r="4.5" fill="${shade(c, -0.35)}"/>
      <circle cx="350" cy="304" r="4.5" fill="${shade(c, -0.35)}"/>
      <path d="M304 186 L290 182 C282 170 300 158 316 156 L350 208 L384 156 C400 158 418 170 410 182 L396 186 L364 246 L350 250 L336 246 Z"
        fill="${R}" stroke="${E}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M196 212 C206 256 210 288 214 318 M504 212 C494 256 490 288 486 318" fill="none" stroke="${S}" stroke-width="3"/>
      <path d="M132 348 L210 320 M568 348 L490 320" stroke="${S}" stroke-width="2.5" stroke-dasharray="7 5" fill="none"/>
      <path d="M226 590 L474 590" stroke="${S}" stroke-width="2.5" stroke-dasharray="7 5" fill="none"/>`;
  }

  /* ---------------- パーカー ---------------- */
  function hoodie(c, view) {
    const E = edge(c), S = seam(c), R = rib(c);
    const body = `
      M282 190 C240 198 210 210 188 224 L120 320 L128 560 L168 566 L176 470
      L186 576 C186 600 200 612 222 612 L478 612 C500 612 514 600 514 576
      L524 470 L532 566 L572 560 L580 320 L512 224 C490 210 460 198 418 190`;
    const hoodFront = `C420 236 384 262 350 262 C316 262 280 236 282 190 Z`;
    const hoodBack = `C420 208 384 218 350 218 C316 218 280 208 282 190 Z`;
    if (view === "back") {
      return `${GROUND}
        <path d="${body} ${hoodBack}" fill="${c}" stroke="${E}" stroke-width="4" stroke-linejoin="round"/>
        <path d="M282 190 C270 130 310 96 350 96 C390 96 430 130 418 190 C420 208 384 218 350 218 C316 218 280 208 282 190 Z"
          fill="${shade(c, -0.06)}" stroke="${E}" stroke-width="4" stroke-linejoin="round"/>
        <path d="M296 186 C290 140 318 112 350 112 C382 112 410 140 404 186" fill="none" stroke="${S}" stroke-width="3"/>
        <path d="M188 224 C180 300 178 400 176 470 M512 224 C520 300 522 400 524 470" fill="none" stroke="${S}" stroke-width="3"/>
        <path d="M196 566 L504 566" stroke="${S}" stroke-width="2.5" stroke-dasharray="8 5" fill="none"/>
        <rect x="186" y="576" width="328" height="36" rx="10" fill="${R}" stroke="${E}" stroke-width="3"/>`;
    }
    return `${GROUND}
      <path d="${body} ${hoodFront}" fill="${c}" stroke="${E}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M282 190 C300 224 320 244 350 246 C380 244 400 224 418 190 C430 232 400 274 350 274 C300 274 270 232 282 190 Z"
        fill="${shade(c, -0.06)}" stroke="${E}" stroke-width="3.5" stroke-linejoin="round"/>
      <path d="M332 262 L328 330 M368 262 L372 330" stroke="${shade(c, -0.4)}" stroke-width="4" stroke-linecap="round" fill="none"/>
      <path d="M256 476 L444 476 L424 566 L276 566 Z" fill="${shade(c, -0.05)}" stroke="${S}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M276 566 L296 480 M424 566 L404 480" stroke="${S}" stroke-width="2.5" fill="none"/>
      <rect x="186" y="576" width="328" height="36" rx="10" fill="${R}" stroke="${E}" stroke-width="3"/>
      <path d="M188 224 C180 300 178 400 176 470 M512 224 C520 300 522 400 524 470" fill="none" stroke="${S}" stroke-width="3"/>
      <path d="M128 548 L168 552 M572 548 L532 552" stroke="${S}" stroke-width="2.5" fill="none"/>`;
  }

  /* ---------------- キャップ ---------------- */
  function cap(c, view) {
    const E = edge(c), S = seam(c);
    if (view === "back") {
      return `<ellipse cx="350" cy="560" rx="220" ry="22" fill="rgba(30,40,60,0.07)"/>
        <path d="M170 420 C170 260 250 190 350 190 C450 190 530 260 530 420 C470 448 230 448 170 420 Z"
          fill="${c}" stroke="${E}" stroke-width="4" stroke-linejoin="round"/>
        <path d="M350 190 L350 432 M255 205 C240 280 238 360 244 430 M445 205 C460 280 462 360 456 430"
          stroke="${S}" stroke-width="3" fill="none"/>
        <circle cx="350" cy="188" r="10" fill="${shade(c, -0.2)}" stroke="${E}" stroke-width="3"/>
        <path d="M290 398 L410 398 L406 434 L294 434 Z M316 408 L384 408 L382 424 L318 424 Z"
          fill="${shade(c, -0.12)}" fill-rule="evenodd" stroke="${E}" stroke-width="3" stroke-linejoin="round"/>`;
    }
    return `<ellipse cx="350" cy="560" rx="220" ry="22" fill="rgba(30,40,60,0.07)"/>
      <path d="M170 420 C170 260 250 190 350 190 C450 190 530 260 530 420 C470 442 230 442 170 420 Z"
        fill="${c}" stroke="${E}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M258 206 C244 280 242 360 248 428 M442 206 C456 280 458 360 452 428"
        stroke="${S}" stroke-width="3" fill="none"/>
      <circle cx="350" cy="188" r="10" fill="${shade(c, -0.2)}" stroke="${E}" stroke-width="3"/>
      <path d="M168 414 C240 462 460 462 532 414 C548 418 556 430 548 442 C470 502 230 502 152 442 C144 430 152 418 168 414 Z"
        fill="${shade(c, -0.1)}" stroke="${E}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M180 428 C260 472 440 472 520 428" stroke="${S}" stroke-width="2.5" fill="none"/>`;
  }

  /* ---------------- トートバッグ ---------------- */
  function tote(c) {
    const E = edge(c), S = seam(c);
    return `<ellipse cx="350" cy="620" rx="230" ry="22" fill="rgba(30,40,60,0.07)"/>
      <path d="M262 290 C262 180 318 180 318 290" fill="none" stroke="${shade(c, -0.22)}" stroke-width="17" stroke-linecap="round"/>
      <path d="M382 290 C382 180 438 180 438 290" fill="none" stroke="${shade(c, -0.22)}" stroke-width="17" stroke-linecap="round"/>
      <path d="M212 288 L488 288 L498 588 L202 588 Z" fill="${c}" stroke="${E}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M214 306 L486 306" stroke="${S}" stroke-width="2.5" stroke-dasharray="7 5" fill="none"/>
      <path d="M206 548 L494 548" stroke="${S}" stroke-width="2.5" fill="none"/>
      <path d="M253 288 L262 306 M327 288 L318 306 M373 288 L382 306 M447 288 L438 306" stroke="${S}" stroke-width="2.5" fill="none"/>`;
  }

  /* ---------------- タオル ---------------- */
  function towel(c) {
    const E = edge(c), S = seam(c);
    return `<ellipse cx="350" cy="600" rx="260" ry="20" fill="rgba(30,40,60,0.07)"/>
      <rect x="115" y="200" width="470" height="360" rx="10" fill="${c}" stroke="${E}" stroke-width="4"/>
      <rect x="145" y="200" width="22" height="360" fill="${shade(c, -0.07)}"/>
      <rect x="533" y="200" width="22" height="360" fill="${shade(c, -0.07)}"/>
      <path d="M167 208 L167 552 M533 208 L533 552 M145 208 L145 552 M555 208 L555 552"
        stroke="${S}" stroke-width="2" fill="none"/>
      <path d="M240 200 L240 560 M350 200 L350 560 M460 200 L460 560" stroke="rgba(0,0,0,0.045)" stroke-width="14" fill="none"/>`;
  }

  const MOCKUPS = {
    tshirt: (c, view) => tshirt(c, view),
    polo:   (c, view) => polo(c, view),
    hoodie: (c, view) => hoodie(c, view),
    cap:    (c, view) => cap(c, view),
    tote:   (c) => tote(c),
    towel:  (c) => towel(c),
  };

  /** モックアップのSVG内部マークアップを返す */
  function renderMockup(mockupId, colorHex, view) {
    /* 袖ビュー（sleeveL/sleeveR）は、どの商品でも側面から見た袖を正面向きで大きく描く */
    if (view && String(view).indexOf("sleeve") === 0) {
      return `<g class="mockup">${sleeveSide(colorHex)}</g>`;
    }
    const fn = MOCKUPS[mockupId];
    if (!fn) return "";
    return `<g class="mockup">${fn(colorHex, view || "front")}</g>`;
  }

  /* ---------------- 実写真モックアップ ----------------
   * config.js の PRODUCTS に photos を設定すると、イラストの代わりに
   * 実際の商品写真を表示できます（700×760の枠に収まるよう自動フィット）。
   *   photos: { front: "assets/products/tshirt_front.png", back: "..." }
   * 色ごとに写真を分ける場合:
   *   photos: { white: { front: "...", back: "..." }, black: { ... } }
   * 該当する写真が無い色・面は、自動的にイラストにフォールバックします。 */

  function photoFor(product, colorId, view) {
    const ph = product && product.photos;
    if (!ph) return null;
    const set = ph[colorId] && typeof ph[colorId] === "object" ? ph[colorId] : ph;
    /* 要求された面の写真のみ返す（前面写真を背面に流用しない）。
     * 無い面は null → イラスト表示＋printAreas にフォールバックする */
    const url = set[view];
    return typeof url === "string" && url ? url : null;
  }

  /* ---------------- 写真の自動カラー変更（グレー無地→各色） ----------------
   * 1枚のグレー無地写真から、選択カラーに応じて色替えした見た目を作る。
   * 生地のシワ・陰影（＝明度）を保ったまま色相・彩度だけ変える。
   *   手順: いったんグレースケール化（明度L）→ 目標色でLを着色。
   *   さらに baseLum（元写真の平均的な明るさ）で割ってスケールするので、
   *   ネイビー等の濃色は暗く、白等の淡色は明るく、自然に振れる。 */
  function photoTintFilter(id, colorHex, baseLum) {
    const n = String(colorHex || "#808080").replace("#", "");
    const num = parseInt(n.length === 3 ? n.split("").map((x) => x + x).join("") : n, 16);
    const r = ((num >> 16) & 255) / 255, g = ((num >> 8) & 255) / 255, b = (num & 255) / 255;
    const Lb = Math.max(0.15, Math.min(0.95, baseLum || 0.55));
    const gr = r / Lb, gg = g / Lb, gb = b / Lb;            // 各チャンネルのゲイン
    const lr = 0.2126, lg = 0.7152, lb = 0.0722;            // 輝度係数
    const m = [
      gr * lr, gr * lg, gr * lb, 0, 0,
      gg * lr, gg * lg, gg * lb, 0, 0,
      gb * lr, gb * lg, gb * lb, 0, 0,
      0, 0, 0, 1, 0,
    ].map((v) => Math.round(v * 10000) / 10000).join(" ");
    return `<filter id="${id}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${m}"/></filter>`;
  }

  /** 商品のモックアップ（写真があれば写真、なければイラスト） */
  function renderProductMockup(product, colorHex, colorId, view) {
    const url = photoFor(product, colorId, view || "front");
    if (url) {
      const e = String(url).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
      const ph = product.photos;
      let defs = "", fattr = "";
      /* autoColor: グレー無地写真1枚を選択カラーへ自動で色替え */
      if (ph && ph.autoColor) {
        const tid = "ptint-" + String(colorId || "x").replace(/[^a-z0-9_-]/gi, "");
        defs = `<defs>${photoTintFilter(tid, colorHex, ph.baseLum)}</defs>`;
        fattr = ` filter="url(#${tid})"`;
      }
      return `<g class="mockup">${defs}<image href="${e}" xlink:href="${e}" x="0" y="0" width="700" height="760" preserveAspectRatio="xMidYMid meet"${fattr}/></g>`;
    }
    return renderMockup(product.mockup, colorHex, view);
  }

  /* ---------------- 着用イメージ（背景＋トルソー） ----------------
   * 商品の「後ろ」に置く、スタジオ背景と首・肩のマネキン形。
   * アパレルは着用感、キャップは頭にかぶせた感じを演出します。 */

  const WEARABLE = { tshirt: 1, drytshirt: 1, polo: 1, hoodie: 1, cap: 1 };

  function wornBackdrop(product, view) {
    const bg = `
      <defs>
        <radialGradient id="wbg" cx="50%" cy="38%" r="75%">
          <stop offset="0%" stop-color="#f3efe9"/>
          <stop offset="60%" stop-color="#e7e1d8"/>
          <stop offset="100%" stop-color="#d5cec3"/>
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="700" height="760" fill="url(#wbg)"/>
      <ellipse cx="350" cy="690" rx="250" ry="30" fill="rgba(40,34,26,0.13)"/>`;

    const skin = "#e9cbaa", skinSh = "#d3ad84";
    let form = "";
    const mk = product.mockup;

    if (mk === "cap") {
      /* 頭にかぶせたイメージ：頭部シルエット＋首 */
      form = `
        <ellipse cx="350" cy="300" rx="120" ry="140" fill="${skin}"/>
        <path d="M250 360 Q350 470 450 360 L450 470 L250 470 Z" fill="${skin}"/>
        <ellipse cx="350" cy="300" rx="120" ry="140" fill="none" stroke="${skinSh}" stroke-width="2" opacity=".5"/>`;
    } else if (WEARABLE[mk]) {
      /* 首＋肩のトルソー（頭は写さないマネキン風） */
      const neckTop = view === "back" ? 150 : 138;
      form = `
        <path d="M300 ${neckTop} Q300 210 322 236 L378 236 Q400 210 400 ${neckTop} Q392 120 350 120 Q308 120 300 ${neckTop} Z" fill="${skin}"/>
        <path d="M322 236 L378 236 Q372 250 350 252 Q328 250 322 236 Z" fill="${skinSh}" opacity=".6"/>
        <path d="M150 300 Q250 250 350 250 Q450 250 550 300 L560 360 Q350 300 140 360 Z" fill="${skin}" opacity=".9"/>`;
    }
    return `<g class="worn-back" pointer-events="none">${bg}${form}</g>`;
  }

  function isWearable(product) { return !!(product && WEARABLE[product.mockup]); }

  globalThis.Mockups = { renderMockup, renderProductMockup, photoFor, wornBackdrop, isWearable, shade };
})();
