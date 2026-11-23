import * as THREE from 'three';

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp01 = (v) => Math.min(1, Math.max(0, v));

const BASE_Y = -255;
const TOP_Y = 305;
const HEIGHT = TOP_Y - BASE_Y;
const BASE_R = 208;

function coneRadius(t) {
  return Math.max(2, BASE_R * Math.pow(1 - clamp01(t), 1.08));
}

/* ------------------------------------------------------------------ */
/* shared point-sprite shader                                          */
/* ------------------------------------------------------------------ */
function makePointMaterial(opacity) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uScale: { value: 1300 },
      uOpacity: { value: opacity },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      attribute float aSize;
      attribute float aPhase;
      uniform float uTime;
      uniform float uScale;
      varying vec3 vColor;
      varying float vTwinkle;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float tw = 0.68 + 0.32 * sin(uTime * 1.6 + aPhase * 6.2831853);
        vTwinkle = tw;
        vColor = aColor;
        float s = aSize * uScale / max(60.0, -mv.z);
        gl_PointSize = clamp(s * (0.82 + 0.35 * tw), 1.0, 90.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      varying vec3 vColor;
      varying float vTwinkle;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r = length(d) * 2.0;
        if (r > 1.0) discard;
        float a = pow(1.0 - r, 2.1);
        float core = pow(1.0 - r, 5.0);
        vec3 col = vColor * (0.42 + 1.25 * core) * vTwinkle;
        gl_FragColor = vec4(col, a * uOpacity);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

function buildPoints(items, opacity) {
  const n = items.length;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const phase = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const it = items[i];
    pos[i * 3] = it.x;
    pos[i * 3 + 1] = it.y;
    pos[i * 3 + 2] = it.z;
    col[i * 3] = it.c.r;
    col[i * 3 + 1] = it.c.g;
    col[i * 3 + 2] = it.c.b;
    size[i] = it.s;
    phase[i] = it.p;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  const mat = makePointMaterial(opacity);
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return { points: pts, material: mat };
}

/* ------------------------------------------------------------------ */
/* textures                                                            */
/* ------------------------------------------------------------------ */
function radialTexture(stops, size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) g.addColorStop(o, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function flareTexture(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const half = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - half;
      const dy = y - half;
      const d = Math.hypot(dx, dy);
      const core = Math.exp(-Math.pow(d / 15, 2));
      const horiz = Math.exp(-Math.pow(Math.abs(dy) / 2.6, 1.5)) * Math.exp(-Math.pow(Math.abs(dx) / 105, 2));
      const vert = Math.exp(-Math.pow(Math.abs(dx) / 2.6, 1.5)) * Math.exp(-Math.pow(Math.abs(dy) / 105, 2));
      const a = Math.min(1, core * 1.15 + horiz * 0.85 + vert * 0.85);
      const warm = Math.min(1, d / 90);
      const i = (y * size + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 245 - warm * 55;
      img.data[i + 2] = 215 - warm * 105;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ------------------------------------------------------------------ */
/* builders                                                            */
/* ------------------------------------------------------------------ */
function buildFoliage(quality) {
  const items = [];
  const tiers = Math.round(38 * quality);

  for (let k = 0; k < tiers; k++) {
    const t = (k + 0.5) / tiers;
    const y0 = BASE_Y + HEIGHT * Math.pow(t, 0.92) * 0.995;
    const r0 = coneRadius(t) + 7;
    const branches = Math.max(4, Math.round(13 - 8 * t));
    const phase = k * 0.72;

    for (let b = 0; b < branches; b++) {
      const ang = phase + (b / branches) * TAU + rand(-0.12, 0.12);
      const length = r0 * rand(0.62, 1.0);
      const count = Math.round((24 + r0 * 0.24) * Math.min(1, quality + 0.35));
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);

      for (let j = 0; j < count; j++) {
        const u = j / count;
        const dist = Math.pow(u, 0.86) * length;
        const droop = Math.pow(dist / Math.max(1, r0), 1.55) * 20;
        const spread = 2.2 + (1 - u) * 3.4;
        const r = dist * rand(0.93, 1.04);
        const a = ang + rand(-0.035, 0.035);
        const x = Math.cos(a) * r + rand(-spread, spread) * 0.35;
        const z = Math.sin(a) * r + rand(-spread, spread) * 0.35;
        const y = y0 - droop + rand(-spread, spread);

        const gold = Math.random() < 0.035;
        const c = gold
          ? new THREE.Color('#ffd98a').multiplyScalar(rand(0.6, 1.0))
          : new THREE.Color('#17624a').lerp(new THREE.Color('#43c98d'), Math.pow(Math.random(), 1.7)).multiplyScalar(rand(0.4, 0.95));

        items.push({
          x, y, z,
          c,
          s: rand(1.0, 2.1) * Math.min(1.15, 0.75 + t * 0.5),
          p: Math.random(),
        });
      }
    }
  }

  // soft interior fill so the cone reads solid
  const fill = Math.round(3200 * quality);
  for (let i = 0; i < fill; i++) {
    const t = Math.pow(Math.random(), 0.85);
    const a = Math.random() * TAU;
    const r = coneRadius(t) * Math.pow(Math.random(), 0.6) * 0.92;
    items.push({
      x: Math.cos(a) * r,
      y: BASE_Y + HEIGHT * t + rand(-6, 6),
      z: Math.sin(a) * r,
      c: new THREE.Color('#0f4a36').lerp(new THREE.Color('#2b9c72'), Math.random() * 0.7).multiplyScalar(rand(0.35, 0.75)),
      s: rand(1.2, 2.4),
      p: Math.random(),
    });
  }

  return items;
}

function buildSparkles(quality) {
  const items = [];
  const n = Math.round(2600 * quality);
  for (let i = 0; i < n; i++) {
    const t = Math.pow(Math.random(), 0.8);
    const a = Math.random() * TAU;
    const r = coneRadius(t) * rand(0.75, 1.06);
    const cool = Math.random() < 0.55;
    items.push({
      x: Math.cos(a) * r + rand(-4, 4),
      y: BASE_Y + HEIGHT * t + rand(-7, 7),
      z: Math.sin(a) * r + rand(-4, 4),
      c: cool ? new THREE.Color('#bdf3ff') : new THREE.Color('#ffe9b8'),
      s: rand(0.5, 1.5),
      p: Math.random(),
    });
  }
  return items;
}

function buildGarland(quality) {
  const items = [];
  const helices = 3;
  const per = Math.round(760 * quality);
  const palette = ['#ffd07a', '#fff0cf', '#ff7a7a', '#9fd8ff', '#7ee0a3'];
  const weights = [0.62, 0.2, 0.09, 0.05, 0.04];

  function pick() {
    let r = Math.random();
    for (let i = 0; i < palette.length; i++) {
      r -= weights[i];
      if (r <= 0) return palette[i];
    }
    return palette[0];
  }

  for (let h = 0; h < helices; h++) {
    for (let i = 0; i < per; i++) {
      const t = i / (per - 1);
      const y = BASE_Y + 8 + (HEIGHT - 16) * t;
      const a = t * TAU * 5.4 + (h / helices) * TAU + 0.6;
      const r = coneRadius(t) + 5 + Math.sin(t * 18 + h) * 2.5;
      const bulb = i % 11 === 0;
      items.push({
        x: Math.cos(a) * r + rand(-1.6, 1.6),
        y: y + rand(-1.4, 1.4),
        z: Math.sin(a) * r + rand(-1.6, 1.6),
        c: new THREE.Color(bulb ? pick() : Math.random() < 0.8 ? '#ffd58c' : '#fff4d8'),
        s: bulb ? rand(3.2, 5.0) : rand(1.7, 3.2),
        p: Math.random(),
      });
    }
  }
  return items;
}

function buildOrnaments(group, quality) {
  const n = Math.round(150 * quality);
  const palette = ['#ff5964', '#ffd98a', '#9fd8ff', '#7ee0a3', '#fff6e4', '#ffb84d', '#e8e2ff'];
  const weights = [0.24, 0.3, 0.13, 0.1, 0.1, 0.08, 0.05];
  const geo = new THREE.SphereGeometry(1, 14, 12);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.28,
    metalness: 0.55,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.14,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();

  for (let i = 0; i < n; i++) {
    const t = rand(0.03, 0.95);
    const a = Math.random() * TAU;
    const r = coneRadius(t) * rand(0.86, 1.0);
    const s = rand(2.2, 4.6);
    dummy.position.set(Math.cos(a) * r, BASE_Y + HEIGHT * t + rand(-4, 4), Math.sin(a) * r);
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);

    let pick = Math.random();
    let hex = palette[0];
    for (let k = 0; k < palette.length; k++) {
      pick -= weights[k];
      if (pick <= 0) { hex = palette[k]; break; }
    }
    col.set(hex);
    mesh.setColorAt(i, col);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  group.add(mesh);

  // each ornament gets a faint halo point for the bloom to grab
  const halo = [];
  for (let i = 0; i < n; i++) {
    const m = new THREE.Matrix4();
    mesh.getMatrixAt(i, m);
    const p = new THREE.Vector3().setFromMatrixPosition(m);
    const c = new THREE.Color();
    mesh.getColorAt(i, c);
    halo.push({ x: p.x, y: p.y, z: p.z, c: c.clone().multiplyScalar(0.55), s: rand(7, 12), p: Math.random() });
  }
  const haloPts = buildPoints(halo, 0.55);
  group.add(haloPts.points);
  return { mesh, haloMaterial: haloPts.material };
}

function makeGift(w, h, d, color, accent) {
  const g = new THREE.Group();
  const boxMat = new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.25 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), boxMat);
  box.position.y = h / 2;
  g.add(box);

  const ribbonMat = new THREE.MeshStandardMaterial({
    color: accent,
    roughness: 0.3,
    metalness: 0.6,
    emissive: new THREE.Color(accent).multiplyScalar(0.35),
  });
  const r1 = new THREE.Mesh(new THREE.BoxGeometry(w * 0.15, h * 1.03, d * 1.03), ribbonMat);
  r1.position.y = h / 2;
  const r2 = new THREE.Mesh(new THREE.BoxGeometry(w * 1.03, h * 1.03, d * 0.15), ribbonMat);
  r2.position.y = h / 2;
  g.add(r1, r2);

  const bow = new THREE.Group();
  const knot = new THREE.Mesh(new THREE.SphereGeometry(Math.min(w, d) * 0.09, 10, 8), ribbonMat);
  bow.add(knot);
  for (const side of [-1, 1]) {
    const loop = new THREE.Mesh(new THREE.TorusGeometry(w * 0.16, w * 0.035, 8, 18), ribbonMat);
    loop.rotation.set(Math.PI / 2, 0, side * 0.55);
    loop.position.set(side * w * 0.18, w * 0.03, 0);
    bow.add(loop);
  }
  bow.position.y = h * 1.04;
  g.add(bow);
  return g;
}

function buildGifts(group) {
  const defs = [
    [-1.15, 0.72, 0x9e2b3c, '#ffd98a', 34, 26, 30],
    [-0.62, 0.98, 0x21456e, '#9fd8ff', 28, 22, 26],
    [-0.18, 1.05, 0x2d6b4d, '#ffe4a8', 40, 30, 34],
    [0.3, 1.02, 0x7a2233, '#ffd98a', 26, 20, 24],
    [0.78, 0.92, 0x6d5426, '#fff0cf', 34, 26, 30],
    [1.22, 0.7, 0x223a5e, '#ffb84d', 24, 20, 22],
    [-0.9, 0.35, 0x3d2f5e, '#ffd98a', 22, 30, 20],
    [0.55, 0.3, 0x8c2f3f, '#c8f0ff', 30, 18, 26],
    [-0.35, 0.4, 0x1f4f3c, '#ffd98a', 18, 22, 18],
    [0.95, 0.32, 0x5b3a2a, '#ffce7a', 20, 16, 20],
  ];
  for (const [ax, az, color, accent, w, h, d] of defs) {
    const a = ax * 0.9 + rand(-0.08, 0.08);
    const r = 250 + az * 55;
    const g = makeGift(w, h, d, color, accent);
    g.position.set(Math.cos(a) * r, BASE_Y + 2, Math.sin(a) * r);
    g.rotation.y = -a + rand(-0.4, 0.4);
    group.add(g);
  }
}

function buildSnow(quality) {
  const n = Math.round(1800 * quality);
  const items = [];
  const state = [];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU;
    const r = Math.sqrt(Math.random()) * 820;
    const y = rand(BASE_Y - 20, 900);
    items.push({
      x: Math.cos(a) * r,
      y,
      z: Math.sin(a) * r,
      c: new THREE.Color('#dbe9ff'),
      s: rand(1.0, 2.6),
      p: Math.random(),
    });
    state.push({ vy: rand(14, 46), drift: rand(4, 16), phase: Math.random() * TAU });
  }
  const { points, material } = buildPoints(items, 0.7);
  return { points, material, state, base: items, n };
}

function buildMotes(quality) {
  const items = [];
  const n = Math.round(700 * quality);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU;
    const r = rand(420, 1500);
    const y = rand(BASE_Y - 80, 720);
    const gold = Math.random() < 0.6;
    items.push({
      x: Math.cos(a) * r,
      y,
      z: Math.sin(a) * r,
      c: gold ? new THREE.Color('#c69a52') : new THREE.Color('#6f93c8'),
      s: rand(1.5, 4.6),
      p: Math.random(),
    });
  }
  return buildPoints(items, 0.5);
}

function buildStar(group) {
  const star = new THREE.Group();
  star.position.set(0, TOP_Y + 14, 0);

  const glowTex = radialTexture([
    [0, 'rgba(255,248,225,1)'],
    [0.18, 'rgba(255,219,150,0.75)'],
    [0.5, 'rgba(255,183,90,0.22)'],
    [1, 'rgba(255,170,70,0)'],
  ]);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.9,
  }));
  glow.scale.setScalar(82);
  star.add(glow);

  const flare = new THREE.Sprite(new THREE.SpriteMaterial({
    map: flareTexture(256), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.6,
  }));
  flare.scale.set(150, 150, 1);
  flare.material.rotation = 0;
  star.add(flare);

  const core = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTexture([[0, 'rgba(255,255,255,1)'], [0.45, 'rgba(255,246,220,0.9)'], [1, 'rgba(255,240,200,0)']]),
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  }));
  core.scale.setScalar(26);
  star.add(core);

  group.add(star);
  return { star, glow, flare, core };
}

/* ------------------------------------------------------------------ */
/* public factory                                                      */
/* ------------------------------------------------------------------ */
export function createTree(scene, opts = {}) {
  const quality = opts.quality ?? 1;
  const group = new THREE.Group();
  group.scale.setScalar(1.15);
  scene.add(group);

  const foliage = buildPoints(buildFoliage(quality), 0.9);
  const sparkles = buildPoints(buildSparkles(quality), 0.95);
  const garland = buildPoints(buildGarland(quality), 1.0);
  group.add(foliage.points, sparkles.points, garland.points);

  // trunk
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(3.2, 15, HEIGHT * 0.98, 10),
    new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.95, metalness: 0.05 })
  );
  trunk.position.y = BASE_Y + HEIGHT * 0.49;
  group.add(trunk);

  const ornaments = buildOrnaments(group, quality);
  buildGifts(group);

  // ground glow
  const glowTex = radialTexture([
    [0, 'rgba(255,205,135,0.55)'],
    [0.35, 'rgba(150,130,180,0.18)'],
    [1, 'rgba(20,30,50,0)'],
  ], 512);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1500, 1500),
    new THREE.MeshBasicMaterial({
      map: glowTex, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, opacity: 0.8,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = BASE_Y - 4;
  group.add(ground);

  // warm atmospheric halo behind the tree
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTexture([
      [0, 'rgba(255, 214, 150, 0.55)'],
      [0.45, 'rgba(160, 140, 190, 0.16)'],
      [1, 'rgba(20, 30, 60, 0)'],
    ], 512),
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.22,
  }));
  halo.position.set(0, 60, -420);
  halo.scale.set(1500, 1500, 1);
  group.add(halo);

  const starParts = buildStar(group);
  const snow = buildSnow(quality);
  group.add(snow.points);
  const motes = buildMotes(quality);
  group.add(motes.points);

  // lights for the solid bits
  const amb = new THREE.AmbientLight(0x334466, 0.9);
  const key = new THREE.DirectionalLight(0xffe2b0, 1.1);
  key.position.set(320, 620, 420);
  const warm = new THREE.PointLight(0xffa755, 1.7, 1200, 2);
  warm.position.set(0, 110, 230);
  const cool = new THREE.PointLight(0x7fb6ff, 1.05, 1100, 2);
  cool.position.set(-320, -120, 210);
  scene.add(amb, key, warm, cool);

  const materials = [
    foliage.material, sparkles.material, garland.material,
    ornaments.haloMaterial, snow.material, motes.material,
  ];

  let snowing = true;
  let snowPos = null;

  const api = {
    group,
    setViewport(heightPx, fovRad) {
      const scale = heightPx / (2 * Math.tan(fovRad / 2));
      for (const m of materials) m.uniforms.uScale.value = scale;
    },
    setSnowing(v) {
      snowing = v;
      snow.points.visible = v;
    },
    get snowing() { return snowing; },
    update(time, dt) {
      for (const m of materials) m.uniforms.uTime.value = time;

      // star pulse
      const pulse = 1 + 0.07 * Math.sin(time * 1.7);
      starParts.glow.scale.setScalar(82 * pulse);
      starParts.flare.scale.set(150 * (1 + 0.05 * Math.sin(time * 1.1)), 150 * (1 + 0.05 * Math.sin(time * 1.1)), 1);
      starParts.flare.material.rotation += dt * 0.09;
      starParts.core.scale.setScalar(26 * (0.92 + 0.12 * Math.sin(time * 2.3)));

      motes.points.rotation.y += dt * 0.012;

      if (!snowing) return;
      if (!snowPos) {
        snowPos = snow.points.geometry.getAttribute('position');
      }
      const arr = snowPos.array;
      for (let i = 0; i < snow.n; i++) {
        const st = snow.state[i];
        let y = arr[i * 3 + 1] - st.vy * dt;
        let x = arr[i * 3] + Math.sin(time * 0.55 + st.phase) * st.drift * dt;
        if (y < BASE_Y - 30) {
          y = 900;
          const a = Math.random() * TAU;
          const r = Math.sqrt(Math.random()) * 820;
          x = Math.cos(a) * r;
          arr[i * 3 + 2] = Math.sin(a) * r;
        }
        arr[i * 3] = x;
        arr[i * 3 + 1] = y;
      }
      snowPos.needsUpdate = true;
    },
  };

  return api;
}
