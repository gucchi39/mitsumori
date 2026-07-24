# CLAUDE.md — ミツモリ刺繍プリント デザインシミュレーター

オリジナルウェアのWebデザインシミュレーター＋自動見積もり（design.s-graphi.co.jp を参考）。
お客様がブラウザでデザイン → 自動見積 → 注文送信、店舗は入稿データ（原寸SVG＋指示書）を受け取る。

## 開発ルール（must）

- 開発・プッシュは **`claude/embroidery-print-service-lakz9a` ブランチのみ**。他ブランチへは明示許可なしにプッシュしない。
- プッシュ → GitHub Pages が自動デプロイ（`.github/workflows/deploy-pages.yml`）。
  公開URL: **https://gucchi39.github.io/mitsumori/** 。作業後は必ずプッシュし、ユーザーへURLを添えて報告する。
  Pages の**初回有効化は手動**（Settings > Pages > Source: GitHub Actions）。GITHUB_TOKEN では API 有効化不可
  （configure-pages の enablement:true は「Resource not accessible by integration」で失敗する。実績あり・撤去済み）。
  この作業環境から `*.github.io` へのHTTP閲覧は**プロキシが403で遮断**するため、デプロイ確認は
  Actions API（run結論＋アーティファクトサイズ）で行う。curl で 000/403 でも慌てない。
  **Pages配信は約10分キャッシュ**され、更新直後は旧JSが届くことがある（「直したはずが直ってない」報告の定番原因）。
  deploy-pages.yml がステージング時に **JS/CSS参照へ `?v=<SHA8>` を自動付与**して対策済み（HTML側に手書きしない）。
  ユーザーへは「数分待つか、Ctrl+F5（スマホは再読み込み）」を案内する。
- PR #2 がレビュー用に開いている。Codex がレビューする（ユーザーが `@codex review` とコメント→結果はwebhookで届く）。
  指摘は1件ずつコード上で再現・精査してから直す。妥当なら修正＋専用E2Eを足す。GitHubへのコメントは最小限。
- コミットメッセージ・PR・コードに **モデルIDを書かない**（チャット返信のみ可）。
- 共有URL（#d=）には **個人情報（名簿の名前・連絡先）を含めない**。読込データは必ずサニタイズ（XSS対策・`sanitizeDesigns`）。
- ユーザーは開発者ではなく刺繍プリント会社の社長。報告は日本語で、専門用語をかみ砕き、画像（モンタージュ等）を添えて説明する。

## 構成（ビルド無し・素のJS）

- 静的サイト。`index.html` + `css/style.css` + `js/*.js`（IIFEでグローバル公開: `CONFIG` / `Quote` / `Mockups` / `Editor` / app）。
  Node（`tests/quote.test.js`）とブラウザ両対応のため `config.js`/`quote.js` は module.exports 分岐あり。
- エディタは 700×760 viewBox のSVG。ビュー: `front` / `back` / `sleeveL` / `sleeveR` / `capSide`（VIEW_LABEL は app.js）。
- `printAreas`（イラスト用版面）と `photoAreas`（写真表示時の版面）。実効版面は editor.js `productAreas()` が
  **表示側と同じ `Mockups.photoFor` 判定**で面単位に切り替える（写真が無い面はイラスト＋printAreas にフォールバック）。
- 保存座標が旧版とズレた場合は `migrateOffAreaObjects()`（load時に範囲外オブジェクトを版面中央へ移動）が救済する。
  版面座標を変えるときはこの仕組みがあることを前提にしてよい。

## 商品写真モックアップ（実写×全色自動生成）

- `PRODUCTS[].photos = { autoColor, baseLum, baseLumByView?, <view>: "assets/products/xxx.png" }`。
  無地写真1枚を `feColorMatrix`（グレースケール→目標色着色、`photoTintFilter`）で全色に変換。陰影・シワは保持される。
- `baseLum` は元写真の平均明度（0-1）。**面ごとに写真の明るさが違う場合は `baseLumByView` で面別指定**
  （例: Tシャツ front はグレー写真0.41、back/側面は白写真0.74-0.77）。
- tintフィルタIDは **`ptint-<商品>-<面>-<色>` で一意**にする。SVGのfragment IDは文書全体で解決されるため、
  色だけのIDだと商品グリッドで先頭商品のフィルタに横取りされ色が崩れる（Codex指摘済み・修正済み）。
- 現状: tshirt/drytshirt（front/back/sleeveL/sleeveR）、polo/hoodie（同）、cap（front/back/capSide）、tote（frontのみ）が実写。
  towel は対象外（イラストのみ）。drytshirt は定番Tと同形状のため写真を流用。
- 元画像は `assets/products/src_*`（ユーザーがGitHub Web UIでアップロード。**コミット未完了のことがある**ので
  「アップした」と言われたら `git fetch` で確認し、無ければ「Commit changes を押したか」を確認する）。
  `src_*` は **Pagesアーティファクトから除外**（deploy-pages.yml の rsync ステージング）。サイト参照ファイルだけが
  デプロイされる。過去の元画像・旧アセットはツリーに置かず、必要なら git 履歴から（`git show <sha>:"<path>" > f.png`）。

## モデル着用イメージ（wornPhotos・2026-07。#btnWorn で表示）

- `PRODUCTS[].wornPhotos[view] = { base, shirt, lum, img, map }`。base=人物切り抜き（肌・髪の色は不変のまま表示）、
  shirt=シャツ生地だけの同位置レイヤー（photoTintFilter で全12色に着色）。現在 tshirt/drytshirt（同一写真流用）・
  **polo・hoodie** の front/back/sleeveL/sleeveR が対応。img=ステージ配置、map=デザイン写像先。
  **map の縦横比はビューと同名の実効版面と必ず一致させる**（歪み防止。editor.js がアフィン写像）。
  **polo/hoodie の sleeveR は sleeveL の鏡像**（左右対称。元sideR写真は切り抜きの背中側が乱れたため不採用。
  `mirror_polo.mjs`/`mirror_hoodie.mjs` で base/shirt 両方を反転。config の sleeveR.lum は sleeveL と同値にする）。
- 資産生成は scratchpad `process_worn.mjs`（単体・src_worn_<view>）／`process_worn_prod.mjs`（商品別・
  `PROD=polo VIEWS=front,back,sleeveL` 等で src_worn_<prod>_<view> を処理）：
  キャプション帯検出除去→std<1.3フラッド→最大成分→
  **モップアップ**（境界6px帯からシード。stdの高い縁リングを飛び越えて、行別背景色 dist<26 かつ lum>132 の
  残骸を除去。**穴埋めは行わない＝腕と胴の隙間を保持**）→closing(6)/erode(2)→シャツ分類
  （sat<22 && lum>105 && R-B<18 →最大成分→closing(5)→内包穴埋め）。出力は base/shirt 2枚（同一クロップ・高さ1300px）。
- map/img の調整は `grid_worn_prod.mjs`（PROD/IMG env・座標グリッド重ね）→ `calib_worn_prod.mjs`
  （PROD env・実機にサンプルデザインを載せて4ビュー撮影）。品質確認は `worn_montage_prod.mjs`（マゼンタ地×全色）。
- **採寸（getPlacements）は着用表示を一時解除して行う**（縮小グループ内の文字は getBBox が1%弱ブレて
  サイズ区分境界で見積が揺れるため。savedWorn で復元）。
- ボタン表示は updateWornButton：wornPhotos があれば表示。実写商品で wornPhotos が無いものは非表示のまま
  （旧トルソー演出はイラスト商品専用）。検証は scratchpad `worn_test.mjs`(21)。
- 他商品へ展開する手順：同条件のモデル着用写真（無地グレーor白・単色薄背景・1人・文字/方眼なし・
  1ビュー1枚）をもらう→ process_worn.mjs の VIEWS/パスを合わせて実行→ config に wornPhotos を追記→
  grid/calib で img・map 調整→ worn_test 追加。

### 写真を追加するときのパイプライン（確立済み）

1. ユーザーに無地（グレーor白）・単色背景・1商品1ビュー1枚の写真を依頼（方眼や説明文字は入れないでもらう）。
2. 背景透過: `python3 -m http.server 8945` を立て、Playwright（`/opt/node22/lib/node_modules/playwright/index.mjs`）の
   headless Chromium canvas で処理。スクリプトは scratchpad の `process_sides.mjs`（側面/背面用・最新版）と
   `bg_white3.mjs`（前面用）が原型。
   - 判定は**局所分散（5×5窓の輝度std・積分画像で計算）**が主役: 背景（AI生成の滑らかなグラデ）は std<1.1、
     生地テクスチャは std≥1.3。白い製品×薄グレー背景でも分離できる（明度・背景色距離では不可能）。
   - フラッドの通過条件は **std<1.3 のみ**（背景色距離を混ぜると影の袖が食われる）。焼き込み方眼は
     フラッド後に**空間ガード付き**で除去: 「製品らしい画素（背景色距離≥25）を8px膨張した領域」の外側だけ、
     dist<14&&std<12・明るい無彩色を透明化。行スパン補完は試して**撤去済み**（迷い込みブロックで灰色の階段が出る）。
   - 後処理: キャプション文字/透かし→最大連結成分のみ残す→クロージング(10)→囲まれた穴埋め
     （キャップ背面はアジャスター穴があるため `noSpanFill` で除外）→erode(2)でハロー削り。
     **フェザーは白製品にNG**（濃色時に白フチが出る）→半解像度縮小AAで代替。bboxクロップ（7%パディング）。
   - どうしても分離不能な局所欠陥は `eraseRects`（ソース座標）でピンポイント消去、または
     **左右対称商品なら反対側面の鏡像を採用**（Tシャツ左側面は右側面の鏡像。正当な常套手段）。
3. `baseLum` はスクリプトが出力する値を `config.js` に転記。photoAreas は scratchpad `calib_iter.mjs`
   （候補座標を緑枠でズーム描画）で**縫い目・シルエット端との関係まで**目視調整する。
   「生地の上に乗っているか」だけでは不十分：**袖の版面は縫い目を越えて胴体側に掛かりやすい**
   （ユーザー指摘済み）。仕上げに `calib_guard_test.mjs`（生地上≥98%・袖/cap側面は12px拡張でも≥97%）を通す。
   ただしこのガードは「シルエットから外れた」しか検出できない。**縫い目の内側かはズーム画像の目視が必須**。
4. 検証: 全色×全ビューのモンタージュ（`montage_sides.mjs`）で**濃色（紺・黒）を必ず確認**
   （切り抜きノイズは白では見えず濃色で露出する）。マゼンタ背景合成（`holecheck.mjs`）で穴・ハローを確認。

## 検証コマンド

- ユニット: `node --test tests/quote.test.js`（13件）
- E2E: scratchpad に Playwright スクリプト群。静的サーバは `python3 -m http.server 8945`
  （注文POST捕捉が要る回帰は `codex_server.mjs`・ポート8932）。サーバは Bash の run_in_background で起動する（`&` は死ぬ）。
- 回帰セット: `codex5_test.mjs`(7・要8932)・`codex6_test.mjs`(5)・`codex7_test.mjs`(5)・`codex8_test.mjs`(11)・
  `codex9_test.mjs`(13)・`codex10_test.mjs`(14)・`codex11_test.mjs`(7)・写真スモーク `smoke2.mjs`(26)・新機能 `features_test.mjs`(33)・
  側面UI `ui3_fixes_test.mjs`(11)・版面ガード `calib_guard_test.mjs`(33)・着用 `worn_test.mjs`(21)。
  コード変更時はユニット含め全部回してからコミットする。

## 過去に直した罠（再発させない）

- **採寸はライブDOMの getBBox() 依存**。`Editor.getPlacements(designsObj)` で別デザインを測るときは
  差し替え直後に `render()`、採寸後に戻して再 `render()`（editor.js内で実装済み。壊さないこと）。
- **名簿（チームユニフォーム）の最悪ケース採寸**: 60名以下は全員、超過時は canvas measureText の
  **実描画幅**で候補選抜（文字数ではダメ。比例フォントで "WWWW" を取りこぼす）。
- 名簿注文の添付に **プレースホルダー入り基本版下を含めない**（`buildOrderFiles` は rosterActive&&hasPlaceholders で
  メンバー個別SVGのみ）。手動書き出し `downloadProductionSet` と挙動を揃える。
- 注文送信の成功判定は `res.ok` だけでなく **レスポンスJSONの success/ok/status も見る**（web3formsは200でfalseを返す）。
- 共有リンクの自動保存ガード: `onChange` が60msデバウンスされるため、ガードは `autosave` 本体に実装。
  判定は**内容指紋（shareFingerprint＝デザイン＋数量＋名簿）の比較**（Codex 11巡目で
  「1回読み飛ばし」方式から変更。読込直後500ms内の最初の編集がデバウンス窓で読込と合流しても保存される）。
  タイミング依存の実装に戻さない。
- web3forms は添付1つのみ → 依存無しZIP（`zipStore`・store方式）に束ねる。
- 注文番号は `ORD-YYYYMMDD-HHMMSS-NNN`（crypto乱数）。`Date.now()%9000` に戻さない。
  **リセットは「デザイン内容の指紋（designSignature）が変わったときだけ」**（Codex 9巡目）。
  onEditorChange は位置タブ切替でも発火するため、無条件リセットにすると
  「入稿書き出し→位置を眺める→注文」で番号がズレる。指紋は商品/色/designs
  （画像hrefは長さ+先頭48字に短縮してstringify）。商品切替・読込・共有読込は明示リセット。
  **名簿の編集・有効切替でもリセット**（renderRosterUI の rosterSig。デザイン指紋は名簿を含まないため・Codex 11巡目）。
- **注文添付には指示書HTML（specSheetHTML）も同梱**（buildOrderFiles・名簿モード含む）。
  店舗が受け取る製作情報の本体。SVG/PNG/JSONだけに戻さない。
- **刺繍の潰れ判定（minTextMm）は1文字の高さ**：複数行は行数、縦書きは1列の文字数で
  bb.h を割る。ブロック全体の高さでは複数行の小文字を見逃す。
- **背景透過で縮小（長辺1600px超）したら natW/natH も更新**（app.js bindBgRemove）。
  据え置くとDPI計算が過大になり低解像度警告が消える。「元に戻す」はhref+natW/natHのセットで復元。
- **setup.html のテスト送信も postOrder と同じJSON成功判定**（success/ok/status）。res.okだけに戻さない。
- **注文メタデータ（buildOrder）と指示書（specSheetHTML）の採寸も名簿展開する**
  （rosterActive&&hasPlaceholders なら rosterMaxPlacements）。見積だけ展開して
  メール/JSON/指示書が {名前} のままの小さい寸法になっていた（Codex 8巡目指摘・修正済み）。
- **色別写真（photos[colorId]={...}）の商品は、色替えで実効版面が変わる**。
  `setBodyColor` が版面ジオメトリの変化を検知し `remapDesignsForAreaChange` で
  オブジェクトを新版面へ写像（相対位置維持・px/mm補正で実寸不変）。この仕組みを壊さない。
- E2Eの共有リンクテストは **送信側と別の browser context** で開く（同一contextだとlocalStorageを共有して偽陽性）。
- **migrateOffAreaObjects（読込時の範囲外救済）は実効版面（productAreas）で判定**（Codex 10巡目）。
  printAreas優先の判定に戻すと、写真版面（袖 y170等）に正しく置かれた保存データが「範囲外」扱いされ
  版面中央へ誤移動→リロードで消える。load() は colorId 設定後に migrate を呼ぶ順序も前提。
- **採寸の縦mm換算は pxPerMmY（a.h/a.mmH）**（getPlacements の heightMm・minTextMm）。photoAreas は
  遠近で縦横の px/mm が違う（capサイド16%差）。横比率で縦を割ると見積・指示書・潰れ判定が実物とズレる
  （exportSVG は mmW×mmH 出力なのでそちらが正）。
- **背景透過・元に戻すの適用先は「依頼時のオブジェクトID」**（`Editor.updateObjectById`）。
  updateSelected に戻すと、非同期処理中に選択が移った場合に別オブジェクトを上書きする。
  対象が削除済みなら警告トーストのみ（成功トーストを出さない）。
- **注文本文の添付案内は ORDER.attachFiles に連動**（orderText）。**メールフォールバックの完了画面も
  実際のDLファイル数に連動**（showOrderComplete の attachedCount・Codex 11巡目）。OFF運用で「添付します」と書くと
  店舗が存在しないファイルを待つ。setup.html のテスト送信は attachFiles 時に**小さなZIPを実際に添付**して
  「本文は通るが添付で落ちる」プラン制限を開業前に検出する。
- **マウスの役割は「左=クリック（選択/解除）のみ、右=ドラッグ全般（オブジェクト移動＋表示パン）」**
  （2026-07ユーザー指定・2度確定。左ボタンでは商品表示のパンもさせない＝drag.frozen）。
  stage上は contextmenu 抑止。選択オーバーレイは枠・接続線が pointer-events:none／ハンドルだけ all
  （これを戻すと、選択中オブジェクトへの右ドラッグが枠線に横取りされて動かない）。タッチ・ペンは従来通り
  指ドラッグで移動。操作ヒント `.drag-hint` はマウス環境のみ表示（pointer:coarse では非表示）。
  選択すると #selActions が現れてキャンバスが下がるため、**E2Eでは選択後に座標を取り直す**こと。
- **着用イメージ（#btnWorn）は実写写真の商品では非表示**（app.js updateWornButton）。イラスト用トルソー演出が
  実写と混ざり「袖から肌色がはみ出す」破綻を起こすため。モデル着用写真（服だけマスク着色）対応時に再有効化する。
- プリント位置バー（.position-bar）は**キャンバス上部**（canvas-col の先頭）。「最初に選ぶものが下にあって
  見つけづらい」というユーザー指摘による配置。下へ戻さない。

## その他

- **競合調査由来の機能（2026-07実装）**：①画像の背景透過（app.js `stripImageBackground`・外周フラッド色距離方式、
  「元に戻す」は app.bgBackup にセッション内保持）②フォント45種（既存10のIDは不変・保存互換。<link>とconfig FONTSの両方を更新すること）
  ④マイデザイン（localStorage `mitsumori.mydesigns.v1`・最大12件・サムネはexportPNG(0.22)）
  ⑤商品切替の引き継ぎ（editor.js `carryDesignsToProduct`・同名エリア＋front⇄capFront/back⇄capBack別名・実寸維持・
  収まらなければ `fitOversizeObjects` が自動縮小）⑦作品集 works.html（データは js/works-data.js の WORKS 配列。
  追加手順はマニュアル運営編に記載。sample:true は「制作イメージ」バッジ）。検証は scratchpad `features_test.mjs`(33)。
- **ブランドデザイン（2026-07刷新・タスク#39）**：「藍 #2c4e79 × 金糸 #c69a35 × 生成り #f4f1e8」＋
  なみ縫いステッチ点線モチーフ（CSS変数 `--stitch`。ヘッダー下辺・見出し下線・ホバーの縫い付き枠・概算バー上辺）。
  参考サイト（design.s-graphi.co.jp のオレンジ×白）とは視覚的に完全分離。見出しは明朝（`--font-head`）。
  概算バーは濃藍地に明るい金（`--gold-bright`）の合計＋金のCTA。姉妹ページ（works/manual/setup/terms）も同パレット。
  エディタの版面枠・スナップガイドは金 #b8891f（editor.js内に直書き。オレンジに戻さない）。
  **構成・クラス名・IDは不変**（E2E互換）。カラーは :root のトークンで一元管理。
- 商品グリッドのサムネは viewBox="0 0 700 760" 全体表示＋スタジオ調背景＋drop-shadow（白商品の視認性）。
- エディタ背景もスタジオ調グラデ（チェッカー柄は廃止）。`#stage .mockup` に接地シャドウ。
- マニュアルは `docs/MANUAL.md` / `docs/manual.html`（お客様向け＋運営向け）。機能を足したら更新する。
- 定期的な自己チェック（send_later等）は**ユーザーが不要と明言済み**。Codex等のイベントはwebhookで届くので、
  届いたときだけ動く。無変化の状況報告は送らない。

## 後日検討リスト（ユーザー承認済みの保留案件。勝手に着手しない）

- **納期表示＋早割**：見積に「今注文でいつ発送」を出し、納期に余裕があると自動割引。
  ユーザー判断で保留（納期を確約できる生産体制になってから）。competitor: originalprint.jp の早割5%。
- **ネーム刺繍パック**：書体・糸色を選ぶだけの定型名入れ刺繍メニュー。実運用の値付けは既に同方式だが、
  シミュレーター上の商品化は保留。
- **受注生産販売の代行**（BASE連携的なもの）：見送り。
- **レビュー投稿割引・次回クーポン**：不要と明言済み。
- **サイトデザインの差別化**（タスク#39）は **2026-07 実施済み**（上記ブランドデザイン参照）。
  今後の微調整はトークン（--accent/--gold/--bg等）で行う。
