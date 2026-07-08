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
- 写真を設定した後、`js/config.js` の `printAreas`（プリント範囲の位置 x/y/w/h）を
  写真の胸位置・袖位置に合うよう微調整すると、より正確な仕上がりイメージになります
- 該当する色・面の写真が無い場合は自動的にイラスト表示に戻ります（安全）
