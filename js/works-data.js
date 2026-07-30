/* =========================================================
 * お客様作品集のデータ
 * =========================================================
 * 作品を追加する手順（画像1枚につき下の {...} を1ブロック追記するだけ）:
 *   1. 写真を assets/works/ にアップロードする（GitHubの「Add file > Upload files」
 *      で assets/works フォルダを開いてアップ →「Commit changes」を必ず押す）
 *   2. このファイルの WORKS の先頭に以下の形で追記する:
 *        {
 *          img:   "assets/works/写真ファイル名.jpg",
 *          title: "作品のタイトル（例：野球チーム様 ユニフォームTシャツ）",
 *          note:  "ひとこと説明（加工方法・枚数・用途など）",
 *          tags:  ["Tシャツ", "刺繍"],          // 自由なラベル。2〜3個まで
 *          sample: false,                        // 実際のお客様作品は false
 *        },
 *   3. 保存（コミット）すると works.html に自動で並びます（先頭が一番上）。
 * ※ お客様の作品を掲載するときは、必ず掲載許可をもらってから。
 * ========================================================= */

const WORKS = [
  {
    img: "assets/works/sample_team_tee.jpg",
    title: "チームTシャツ（背番号入り）",
    note: "チーム名と背番号をシルクスクリーンで。名簿を貼り付ければ全員分の背番号・名前入りもまとめて注文できます。",
    tags: ["Tシャツ", "チームウェア"],
    sample: true,
  },
  {
    img: "assets/works/sample_hoodie.jpg",
    title: "クラスパーカー",
    note: "卒業記念・クラス行事に人気。濃色ボディ×2色プリントの定番デザインです。",
    tags: ["パーカー", "クラスウェア"],
    sample: true,
  },
  {
    img: "assets/works/sample_tote.jpg",
    title: "ショップのノベルティトート",
    note: "厚手キャンバスにワンポイント。開店記念やイベント配布用に1枚から作れます。",
    tags: ["トートバッグ", "ノベルティ"],
    sample: true,
  },
  {
    img: "assets/works/sample_cap.jpg",
    title: "ロゴ刺繍キャップ",
    note: "フロントにイニシャルを刺繍。立体感のある仕上がりはプリントにない高級感があります。",
    tags: ["キャップ", "刺繍"],
    sample: true,
  },
];

if (typeof globalThis !== "undefined") globalThis.WORKS = WORKS;
