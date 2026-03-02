# @neruco/masonry-flow

[![Live Demo](https://img.shields.io/badge/Live-Demo-blue)](https://coder-ao.github.io/masonry-flow/)

## Demo

https://coder-ao.github.io/masonry-flow/


Pinterest風に「横方向へ詰める」Masonryレイアウト（absolute方式）。

WordPressでも使いやすく、imagesLoaded 不要を目標に
ResizeObserver / MutationObserver で高さ変化・DOM増減に追従します。


## 特徴

- Pinterestっぽく「横方向に詰める」Masonry
- 親の高さ0問題を自動解決（container heightを更新）
- lazyload / フォントロード / キャプション開閉に追従
- 追加要素（無限スクロール）に対応
- 画像 decode 待機オプションあり
- フェード / stagger 表示対応
- ESM（npm）と IIFE（WP直置き）両対応


## インストール（npm）

```bash
npm i @neruco/masonry-flow
```

```js
import { MasonryFlow } from "@neruco/masonry-flow";

new MasonryFlow("[data-masonry]", {
  gap: 16,
  minWidth: 240
});
```

## WordPressでの利用（直置き）

`dist/masonry-flow.iife.js`（IIFEビルド）をテーマに配置して読み込みます。
※ npm build後、dist内のファイルをテーマへ配置してください。

```html
<link rel="stylesheet" href="/wp-content/themes/your-theme/assets/css/masonry.css">

<script src="/wp-content/themes/your-theme/assets/js/masonry-flow.iife.js"></script>
<script>
  MasonryFlow.MasonryFlow.autoInit();
</script>
```

> IIFEビルドではグローバル `MasonryFlow` が生成されます。
> クラスは `MasonryFlow.MasonryFlow`
> `masonry.css`（is-mf-loading / is-mf-ready）は初期ちらつきを抑えるための最小CSSです。


## HTML例

```html
<div class="masonry"
  data-masonry
  data-gap="16"
  data-min="240"
  data-item=".masonry__item"
  data-animate="true"
  data-fade="true"
  data-stagger="true"
>
  <a class="masonry__item" href="#">
    <img loading="lazy" src="..." alt="">
  </a>
</div>
```

## オプション（JS）

```js
new MasonryFlow(root, {
  gap: 16,
  minWidth: 240,

  startOnLoad: false,

  animate: false,
  duration: 240,

  fadeIn: true,
  fadeDuration: 240,

  stagger: true,
  staggerDelay: 80,

  decodeOnInit: true,
  decodeOnAppend: true,
  decodeTimeout: 2000,

  resizeDebounce: 120
});
```

## data属性

- `data-item` : itemSelector
- `data-gap` : gap(px)
- `data-min` : minWidth(px)
- `data-observe="false"` : ResizeObserver / MutationObserver無効
- `data-start-on-load="true"` : window load 後に開始
- `data-animate="true"` : transformアニメON
- `data-duration="240"` : transform duration(ms)
- `data-fade="true"` : opacityフェードON
- `data-fade-duration="240"` : フェード時間
- `data-stagger="true"` : 上から順に1要素ずつ表示
- `data-stagger-delay="80"` : stagger間隔(ms)
- `data-decode-on-init="false"` : 初回decode待機OFF
- `data-decode-on-append="false"` : append時decode待機OFF
- `data-decode-timeout="2000"` : decode最大待機時間(ms)
- `data-resize-debounce="120"` : レイアウト再計算の待機(ms)


## スクロール連動フェード（オプション）

IntersectionObserver と併用可能。

```css
.masonry__inner {
  opacity: 0;
  transform: translateY(10px);
  transition: opacity 280ms ease, transform 280ms ease;
}

.masonry__item.is-inview .masonry__inner {
  opacity: 1;
  transform: translateY(0);
}
```
※ `.masonry__item` 自体は MasonryFlow が `transform` を使うため、演出は `.masonry__inner` に適用してください。


## API

- `layout()` : レイアウト計算
- `requestLayout()` : rAFでまとめて再計算
- `append(elements)` : 要素を追加して再計算
- `destroy()` : 解除してインラインを掃除
- `static autoInit(selector?, opts?)` : `[data-masonry]` 自動初期化


## 推奨設定（Pinterest風）

```js
{
  fadeIn: true,
  fadeDuration: 260,
  stagger: true,
  staggerDelay: 60,
  resizeDebounce: 120
}
```


## 開発

```bash
npm run dev
npm run build
```


## ライセンス

MIT
