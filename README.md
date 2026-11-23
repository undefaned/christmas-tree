# 璀璨圣诞树 · Merry Christmas

Three.js + 后处理泛光（Bloom）实现的粒子圣诞树。纯静态站点，无构建步骤、无 CDN 依赖（three.js 已随仓库内置）。

## 预览

由于使用了 ES Module 与纹理加载，请通过 HTTP 服务器打开，不要直接双击 `index.html`：

```bash
python3 -m http.server 8000
# 浏览器访问 http://localhost:8000/
```

部署到 GitHub Pages：Settings → Pages → Deploy from a branch → main → / (root)。

## 交互

- 拖动旋转，滚轮 / 双指缩放
- 默认每张照片是树周围的小预览卡；**放大后**朝向镜头一侧的照片会展开成可读大小，背面的自动缩小淡出
- 点击任意照片查看原图（左右方向键切换），也可从「回忆相册」进入网格视图
- ❄ 飘雪 / ↻ 自动旋转 / ♫ 音乐盒（WebAudio 合成，无音频文件）/ ♡ 写下心愿（localStorage 保存）
- 圣诞倒计时

## 结构

```
index.html          页面与 UI
styles.css          界面样式
js/main.js          渲染器、相机、泛光、照片卡片、交互
js/tree.js          粒子树、花环、彩球、礼盒、星星、雪、地面光晕
js/audio.js         八音盒合成器（Jingle Bells，公有领域旋律）
js/photos.js        照片清单
photos/             原图
photos/thumbs/      360px 预览图（卡片使用，节省显存）
vendor/three/       three r160 + EffectComposer / UnrealBloomPass / OutputPass
```

## 备注

- 照片卡在树上只做小预览；点击后用原图打开大图，避免一次性把 57 张原图全部作为纹理载入。
- 视觉灵感：https://nobody-r.github.io/christmas-tree/ ，本实现为独立编写。
- 浏览器需支持 WebGL2 与 import maps（Chrome/Edge 89+、Safari 16.4+、Firefox 108+）。
