import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createTree } from './tree.js';
import { MusicBox } from './audio.js';
import { photoPaths, thumbOf } from './photos.js';

const $ = (id) => document.getElementById(id);
const canvas = $('scene');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smoothstep = (edge0, edge1, x) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

const lowPower = window.matchMedia('(max-width: 760px)').matches || (navigator.hardwareConcurrency || 8) <= 4;
const quality = lowPower ? 0.55 : 1;
const dprCap = lowPower ? 1.6 : 2;

/* ------------------------------------------------------------------ */
/* renderer                                                            */
/* ------------------------------------------------------------------ */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (err) {
  window.__fatalShown = true;
  $('loaderText').textContent = '当前浏览器无法启用 WebGL（需要 WebGL2，建议 Chrome / Edge / Safari 15+）';
  throw err;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.setClearColor(0x05070f, 1);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070f);
scene.fog = new THREE.FogExp2(0x05070f, 0.00032);

const FOV = 42;
const camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 1, 7000);
const target = new THREE.Vector3(0, 50, 0);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.12, 0.8, 0.16
);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const tree = createTree(scene, { quality });

/* ------------------------------------------------------------------ */
/* photo cards                                                         */
/* ------------------------------------------------------------------ */
const CARD_W = 36;
const CARD_H = 48;
const PHOTOS = photoPaths.length;

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function makeFrameTexture(maxAniso) {
  const W = 384;
  const H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(30, 44, 68, 0.96)');
  g.addColorStop(0.55, 'rgba(13, 21, 36, 0.97)');
  g.addColorStop(1, 'rgba(22, 31, 48, 0.98)');
  roundRectPath(ctx, 3, 3, W - 6, H - 6, 22);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(226, 188, 122, 0.82)';
  ctx.stroke();

  // punch the photo window
  ctx.globalCompositeOperation = 'destination-out';
  roundRectPath(ctx, 20, 20, W - 40, H - 40 - 30, 10);
  ctx.fillStyle = '#000';
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  roundRectPath(ctx, 20, 20, W - 40, H - 40 - 30, 10);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(255, 226, 170, 0.55)';
  ctx.stroke();

  // bottom ornament
  ctx.fillStyle = 'rgba(232, 196, 131, 0.9)';
  ctx.font = '22px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('✦', W / 2, H - 25);
  ctx.strokeStyle = 'rgba(232, 196, 131, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(60, H - 25);
  ctx.lineTo(W / 2 - 24, H - 25);
  ctx.moveTo(W / 2 + 24, H - 25);
  ctx.lineTo(W - 60, H - 25);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

function makeFallbackTexture(maxAniso) {
  const c = document.createElement('canvas');
  c.width = 96;
  c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#16233a');
  g.addColorStop(1, '#0a1322');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 96, 128);
  ctx.fillStyle = 'rgba(232, 196, 131, 0.85)';
  ctx.font = '34px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('✦', 48, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

const maxAniso = renderer.capabilities.getMaxAnisotropy();
const frameTexture = makeFrameTexture(maxAniso);
const fallbackTexture = makeFallbackTexture(maxAniso);
const loader = new THREE.TextureLoader();

const cards = [];
const cardGroups = [];
let hovered = -1;

const loaderText = $('loaderText');
const loaderBar = $('loaderBar');
let loadedCount = 0;

function updateLoader() {
  const pct = Math.round((loadedCount / PHOTOS) * 100);
  loaderText.textContent = `载入回忆 ${loadedCount} / ${PHOTOS}`;
  loaderBar.style.width = pct + '%';
}

function loadTexture(src) {
  return new Promise((resolve) => {
    loader.load(
      src,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = maxAniso;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.generateMipmaps = true;
        loadedCount++;
        updateLoader();
        resolve(tex);
      },
      undefined,
      () => {
        loadedCount++;
        updateLoader();
        resolve(fallbackTexture);
      }
    );
  });
}

function makeCard(i, texture) {
  const group = new THREE.Group();

  const imgMat = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.DoubleSide,
    toneMapped: false,
    transparent: true,
  });
  const img = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W * 1.04, CARD_H * 1.04), imgMat);
  img.userData.index = i;

  const frameMat = new THREE.MeshBasicMaterial({
    map: frameTexture,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const frame = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W * 1.14, CARD_H * 1.14), frameMat);
  frame.position.z = 0.5;
  frame.userData.index = i;

  group.add(img, frame);

  const angle = i * 2.399963229728653 + 0.42;
  const baseY = -180 + 400 * (i / Math.max(1, PHOTOS - 1)) + Math.sin(i * 1.7) * 5;
  const baseR = 346 + Math.sin(i * 2.31) * 16;

  group.position.set(Math.cos(angle) * baseR, baseY, Math.sin(angle) * baseR);
  group.userData.index = i;

  const card = { group, img, frame, index: i, angle, baseY, baseR, scale: 1, op: 1 };
  cards.push(card);
  cardGroups.push(group);
  scene.add(group);
  return card;
}

async function buildCards() {
  const textures = await Promise.all(photoPaths.map((p) => loadTexture(thumbOf(p))));
  // build in a random-ish order so the tree fills evenly as they pop in
  for (let i = 0; i < textures.length; i++) makeCard(i, textures[i]);
}

/* ------------------------------------------------------------------ */
/* lightbox                                                            */
/* ------------------------------------------------------------------ */
let lbIndex = 0;

function openLightbox(i) {
  lbIndex = (i + PHOTOS) % PHOTOS;
  const dlg = $('lightbox');
  $('lbImg').src = photoPaths[lbIndex];
  $('lbCount').textContent = `${lbIndex + 1} / ${PHOTOS}`;
  if (!dlg.open) dlg.showModal();

  // warm the neighbours
  for (const d of [1, PHOTOS - 1]) {
    const im = new Image();
    im.src = photoPaths[(lbIndex + d) % PHOTOS];
  }
}

function stepLightbox(delta) {
  openLightbox(lbIndex + delta);
}

/* ------------------------------------------------------------------ */
/* camera + input                                                      */
/* ------------------------------------------------------------------ */
const MIN_R = 860;
const MAX_R = 1320;
let theta = 0.42;
let phi = 1.42;
let radius = 1120;
let targetRadius = 1120;
let autoRotate = true;
let lastInteraction = 0;
let elapsed = 0;
let reveal = 0;
let cardFit = 1;

const pointers = new Map();
let pinchStartDist = 0;
let pinchStartRadius = 1120;
let dragMoved = 0;
let downId = null;
let downAt = 0;
let lastHoverCheck = 0;

function pointerDistance() {
  const pts = [...pointers.values()];
  if (pts.length < 2) return 0;
  return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
}

function setNdcFromClient(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  ndc.set(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1
  );
}

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

function pickPhoto(clientX, clientY) {
  if (!cardGroups.length) return null;
  setNdcFromClient(clientX, clientY);
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(cardGroups, true);
  if (!hits.length) return null;
  const obj = hits[0].object;
  return typeof obj.userData.index === 'number' ? obj.userData.index : null;
}

canvas.addEventListener('pointerdown', (e) => {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  try { canvas.setPointerCapture(e.pointerId); } catch {}
  if (pointers.size === 1) {
    downId = e.pointerId;
    dragMoved = 0;
    downAt = performance.now();
    lastInteraction = elapsed;
    canvas.classList.add('dragging');
    canvas.style.cursor = 'grabbing';
  }
  if (pointers.size === 2) {
    pinchStartDist = pointerDistance();
    pinchStartRadius = targetRadius;
    dragMoved = 999; // a pinch is never a click
  }
});

window.addEventListener('pointermove', (e) => {
  if (pointers.has(e.pointerId)) {
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1 && downId === e.pointerId) {
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      dragMoved += Math.abs(dx) + Math.abs(dy);
      theta -= dx * 0.0034;
      phi = clamp(phi - dy * 0.0026, 1.08, 1.58);
      lastInteraction = elapsed;
    } else if (pointers.size === 2) {
      const d = pointerDistance();
      if (pinchStartDist > 0 && d > 0) {
        targetRadius = clamp(pinchStartRadius * (pinchStartDist / d), MIN_R, MAX_R);
        lastInteraction = elapsed;
      }
    }
    return;
  }

  // hover (only when not dragging)
  if (pointers.size === 0 && performance.now() - lastHoverCheck > 45) {
    lastHoverCheck = performance.now();
    const idx = pickPhoto(e.clientX, e.clientY);
    if (idx !== hovered) {
      hovered = idx;
      canvas.style.cursor = idx === null ? 'grab' : 'pointer';
    }
  }
});

function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (pointers.size === 0) {
    canvas.classList.remove('dragging');
    canvas.style.cursor = '';
    if (e.pointerId === downId && dragMoved < 8 && performance.now() - downAt < 650) {
      const idx = pickPhoto(e.clientX, e.clientY);
      if (idx !== null) openLightbox(idx);
    }
    downId = null;
  }
  if (pointers.size < 2) pinchStartDist = 0;
}

window.addEventListener('pointerup', endPointer);
window.addEventListener('pointercancel', (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (pointers.size === 0) {
    canvas.classList.remove('dragging');
    downId = null;
  }
  pinchStartDist = 0;
});
window.addEventListener('blur', () => {
  pointers.clear();
  pinchStartDist = 0;
  downId = null;
  canvas.classList.remove('dragging');
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  targetRadius = clamp(targetRadius * Math.exp(e.deltaY * 0.0011), MIN_R, MAX_R);
  lastInteraction = elapsed;
  hideHintSoon();
}, { passive: false });

canvas.addEventListener('dblclick', () => {
  targetRadius = targetRadius > 1000 ? MIN_R : 1120;
  lastInteraction = elapsed;
});

// keyboard zoom / rotate
window.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]')) return;
  if (e.key === '+' || e.key === '=') targetRadius = clamp(targetRadius * 0.88, MIN_R, MAX_R);
  else if (e.key === '-' || e.key === '_') targetRadius = clamp(targetRadius * 1.12, MIN_R, MAX_R);
  else if (e.key === 'ArrowLeft') theta += 0.12;
  else if (e.key === 'ArrowRight') theta -= 0.12;
  else return;
  lastInteraction = elapsed;
});

/* ------------------------------------------------------------------ */
/* ui                                                                  */
/* ------------------------------------------------------------------ */
const btnSnow = $('btnSnow');
const btnRotate = $('btnRotate');
const btnMusic = $('btnMusic');
const btnWish = $('btnWish');
const hint = $('hint');
const hero = document.querySelector('.hero');
const music = new MusicBox();
let hintTimer = null;

function hideHintSoon() {
  if (hintTimer) return;
  hintTimer = setTimeout(() => { hint.style.opacity = '0.0'; }, 6000);
}

btnSnow.addEventListener('click', () => {
  tree.setSnowing(!tree.snowing);
  btnSnow.setAttribute('aria-pressed', String(tree.snowing));
});

btnRotate.addEventListener('click', () => {
  autoRotate = !autoRotate;
  btnRotate.setAttribute('aria-pressed', String(autoRotate));
});

btnMusic.addEventListener('click', async () => {
  try {
    const on = await music.toggle();
    btnMusic.setAttribute('aria-pressed', String(on));
    btnMusic.textContent = on ? '❚❚ 音乐' : '♫ 音乐';
  } catch {
    btnMusic.textContent = '♫ 音乐不可用';
  }
});

btnWish.addEventListener('click', () => {
  const saved = $('greeting').dataset.saved || '';
  $('wishInput').value = saved;
  $('wishDialog').showModal();
});

$('wishDialog').addEventListener('close', () => {
  const dlg = $('wishDialog');
  if (dlg.returnValue !== 'save') return;
  const text = $('wishInput').value.trim();
  if (!text) return;
  $('greeting').textContent = text;
  $('greeting').dataset.saved = text;
  try { localStorage.setItem('christmas-wish', text); } catch {}
});

document.querySelectorAll('[data-close]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const dlg = $(btn.dataset.close);
    if (dlg && dlg.open) dlg.close();
  });
});

$('lbPrev').addEventListener('click', () => stepLightbox(-1));
$('lbNext').addEventListener('click', () => stepLightbox(1));
$('lightbox').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') { e.preventDefault(); stepLightbox(-1); }
  if (e.key === 'ArrowRight') { e.preventDefault(); stepLightbox(1); }
});
// clicking the dim backdrop closes
$('lightbox').addEventListener('click', (e) => {
  if (e.target === $('lightbox')) $('lightbox').close();
});

try {
  const saved = localStorage.getItem('christmas-wish');
  if (saved) {
    $('greeting').textContent = saved;
    $('greeting').dataset.saved = saved;
  }
} catch {}

/* countdown */
function tickCountdown() {
  const now = new Date();
  const year = now.getFullYear();
  let target = new Date(year, 11, 25, 0, 0, 0);
  const end = new Date(year, 11, 26, 0, 0, 0);
  const el = $('countdown');
  if (now >= target && now < end) {
    el.textContent = '圣诞快乐 · MERRY CHRISTMAS';
    return;
  }
  if (now >= target) target = new Date(year + 1, 11, 25, 0, 0, 0);
  const s = Math.max(0, Math.floor((target - now) / 1000));
  const d = Math.floor(s / 86400);
  const hh = String(Math.floor(s / 3600) % 24).padStart(2, '0');
  const mm = String(Math.floor(s / 60) % 60).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  el.textContent = `距圣诞节 ${d} 天 · ${hh} 时 · ${mm} 分 · ${ss} 秒`;
}
tickCountdown();
setInterval(tickCountdown, 1000);

/* ------------------------------------------------------------------ */
/* resize + loop                                                       */
/* ------------------------------------------------------------------ */
function applySize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h);
  composer.setPixelRatio(dpr);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();

  // keep the whole ring of photos in frame on narrow / portrait screens
  const aspect = w / h;
  const fit = clamp(aspect / 0.85, 0.7, 1);
  scene.scale.setScalar(fit);
  cardFit = clamp(aspect / 0.85, 0.62, 1);

  const db = renderer.getDrawingBufferSize(new THREE.Vector2());
  tree.setViewport(db.y, (FOV * Math.PI) / 180);
}
applySize();
window.addEventListener('resize', applySize);

const clock = new THREE.Clock();
let hintSwapped = false;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;

  if (autoRotate && elapsed - lastInteraction > 2.2) theta += dt * 0.05;

  radius += (targetRadius - radius) * Math.min(1, dt * 4.5);
  reveal = smoothstep(1090, 900, radius);

  const sp = Math.sin(phi);
  camera.position.set(
    target.x + radius * sp * Math.sin(theta),
    target.y + radius * Math.cos(phi),
    target.z + radius * sp * Math.cos(theta)
  );
  camera.lookAt(target);

  tree.update(elapsed, dt);

  for (const c of cards) {
    // only the cards currently on the camera-facing side grow, so the
    // zoomed view stays readable instead of piling 57 large cards together
    const front = Math.sin(c.angle + theta);
    const w = smoothstep(0.45, 0.96, front);
    const r = (c.baseR + 46 * reveal * w) * cardFit;
    const bob = Math.sin(elapsed * 0.55 + c.index * 1.7) * 3;
    c.group.position.set(Math.cos(c.angle) * r, c.baseY + bob, Math.sin(c.angle) * r);
    const want = (1 + 0.8 * reveal * w) * (c.index === hovered ? 1.07 : 1);
    c.scale += (want - c.scale) * Math.min(1, dt * 8);
    c.group.scale.setScalar(c.scale);
    c.group.lookAt(camera.position);

    const op = c.index === hovered ? 1 : 1 - 0.55 * reveal * (1 - w);
    if (Math.abs(c.op - op) > 0.004) {
      c.op = op;
      c.img.material.opacity = op;
      c.frame.material.opacity = Math.min(1, op + 0.12);
    }
  }

  hero.style.opacity = String(1 - 0.45 * reveal);

  if (!hintSwapped && reveal > 0.55) {
    hintSwapped = true;
    hint.textContent = '照片已展开 · 点击任意一张查看大图';
  }
  if (hintSwapped && reveal < 0.2) {
    hintSwapped = false;
    hint.textContent = '拖动旋转 · 滚轮 / 双指缩放 · 放大后点击照片查看';
  }

  composer.render();
}

buildCards().then(() => {
  updateLoader();
  requestAnimationFrame(() => {
    $('loader').classList.add('done');
    hideHintSoon();
  });
});

animate();
