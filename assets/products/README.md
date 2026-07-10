# 商品写真の置き場所

ここに商品写真（PNG/JPG）を置き、`js/config.js` の各商品に `photos` を設定すると、
イラストの代わりに実写真がシミュレーターに表示されます。

```js
photos: { front: "assets/products/tshirt_front.png", back: "assets/products/tshirt_back.png" },
// 色ごとに分ける場合（キーはカラーID: white, black, navy...）
photos: {
  white: { front: "assets/products/tshirt_white_front.png", back: "assets/products/tshirt_white_back.png" },
  black: { front: "assets/products/tshirt_black_front.png", back: "assets/products/tshirt_black_back.png" },
},
```

## 撮影・準備のコツ

- **正面からの平置きまたはトルソー着用写真**を使う（斜めだとプリント位置がずれて見えます）
- 背景は白または透過PNGがきれいです
- 700×760 の縦長枠に自動フィットします。商品が枠の中央に大きく写るようトリミングしてください
- 該当する色・面の写真が無い場合は自動的にイラスト表示に戻ります（安全）

## プリント位置を写真に合わせる（photoAreas）

写真の胸・背中の位置が、イラスト用の `printAreas` とズレる場合は、
商品に **`photoAreas`** を足すと、写真使用時だけプリント範囲を写真に合わせられます。

```js
{
  id: "tshirt", ...
  photos: { front: "assets/products/tshirt_front.png", back: "assets/products/tshirt_back.png" },
  photoAreas: [   // printAreas をコピーして x/y/w/h を写真に合わせて調整（id は同じに）
    { id: "front", name: "前面", view: "front", x: 250, y: 250, w: 200, h: 260, mmW: 300, mmH: 360 },
    { id: "back",  name: "背面", view: "back",  x: 250, y: 240, w: 200, h: 270, mmW: 300, mmH: 384 },
  ],
}
```

**合わせ方**：シミュレーターで商品を選び、STEP2でプリント範囲の点線枠が写真の胸・背中に
重なるよう、`x`（左からの位置）`y`（上からの位置）`w`（幅）`h`（高さ）を少しずつ調整します。
`mmW`/`mmH`（実寸）は見積もり計算に使われるので、実際の最大プリントサイズに合わせてください。

> ※ 斜め・遠近のある写真に完全に沿わせる（変形合成）機能は今後の対応予定です。現状は
> 正面平置き・トルソー正面の写真が最もきれいに合います。
