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
    const collarFront = `M285 178 C296 214 350 232 350 232 C350 232 404 214 415 178
      C408 176 402 174 396 173 C388 200 350 214 350 214 C350 214 312 200 304 173 C298 174 292 176 285 178 Z`;
    const collarBack = `M285 178 C296 190 350 197 350 197 C350 197 404 190 415 178
      C408 176 402 174 396 173 C390 183 350 188 350 188 C350 188 310 183 304 173 C298 174 292 176 285 178 Z`;
    const shading = `
      <path d="M222 602 L222 340 C240 420 240 520 230 602 Z" fill="rgba(0,0,0,0.05)"/>
      <path d="M478 602 L478 340 C460 420 460 520 470 602 Z" fill="rgba(0,0,0,0.05)"/>`;
    return `${GROUND}
      <path d="${body} ${view === "back" ? neckBack : neckFront}" fill="${c}" stroke="${E}" stroke-width="4" stroke-linejoin="round"/>
      <path d="${view === "back" ? collarBack : collarFront}" fill="${R}" stroke="${E}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M192 210 C202 258 208 290 212 320" fill="none" stroke="${S}" stroke-width="3"/>
      <path d="M508 210 C498 258 492 290 488 320" fill="none" stroke="${S}" stroke-width="3"/>
      <path d="M226 588 L474 588" stroke="${S}" stroke-width="2.5" stroke-dasharray="7 5" fill="none"/>
      <path d="M122 358 L206 326 M578 358 L494 326" stroke="${S}" stroke-width="2.5" stroke-dasharray="7 5" fill="none"/>
      ${shading}`;
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
    const url = set[view] || set.front;
    return typeof url === "string" && url ? url : null;
  }

  /** 商品のモックアップ（写真があれば写真、なければイラスト） */
  function renderProductMockup(product, colorHex, colorId, view) {
    const url = photoFor(product, colorId, view || "front");
    if (url) {
      const e = String(url).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
      return `<g class="mockup"><image href="${e}" xlink:href="${e}" x="0" y="0" width="700" height="760" preserveAspectRatio="xMidYMid meet"/></g>`;
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
