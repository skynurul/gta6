// city3d.js — turns the island data into a Three.js scene: displaced terrain
// with painted vertex colours, ribbon roads with sidewalks and crosswalks,
// instanced buildings with real facades and rooftop props, the volcano's lava
// and smoke, an animated sea, a gradient sky with drifting clouds, and the
// island's daylight.
import * as THREE from 'three';
import {
  WORLD, CENTER, VOLCANO, AVENUES, STREETS, ROAD_HALF,
  CLIMB_WAYPOINTS, terrainHeight, LAVA_ZONES, districtFor,
} from './terrain3d.js';
import { dist } from './util.js';

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// A soft round blob (radial gradient) for smoke puffs, embers and clouds.
function softSpriteTexture() {
  return canvasTexture(64, 64, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

// Asphalt with a dashed centre line, concrete shoulders and speckle.
function roadTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#474340';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#5f594f';
    g.fillRect(0, 0, 10, h);
    g.fillRect(w - 10, 0, 10, h);
    g.fillStyle = '#d8c860';
    g.fillRect(w / 2 - 3, 8, 6, 48);
    g.fillStyle = '#38342f';
    for (let i = 0; i < 60; i++) {
      g.fillRect(Math.random() * w, Math.random() * h, 3, 2);
    }
    g.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 30; i++) {
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  });
}

// Concrete sidewalk slabs with joints.
function sidewalkTexture() {
  return canvasTexture(64, 64, (g, w, h) => {
    g.fillStyle = '#9a948a';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, 0, w, 3);
    g.fillRect(0, h / 2, w, 3);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    for (let i = 0; i < 24; i++) {
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  });
}

// Building facades: brick, stucco, glass curtain wall, concrete panels.
// Windows are baked in, some lit, with a darker ground floor and a door.
function facadeTexture(style) {
  return canvasTexture(128, 256, (g, w, h) => {
    if (style === 'brick') {
      g.fillStyle = '#8a4a34';
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(0,0,0,0.18)';
      for (let y = 0; y < h; y += 12) g.fillRect(0, y, w, 2);
      g.fillStyle = 'rgba(255,255,255,0.08)';
      for (let y = 6; y < h; y += 12) g.fillRect(0, y, w, 1);
    } else if (style === 'stucco') {
      g.fillStyle = '#e0c090';
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(120,80,40,0.28)';
      for (let y = 0; y < h; y += 64) g.fillRect(0, y, w, 3);
      g.fillStyle = 'rgba(255,255,255,0.15)';
      for (let y = 32; y < h; y += 64) g.fillRect(0, y, w, 2);
    } else if (style === 'glass') {
      g.fillStyle = '#3d4e60';
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,0.16)';
      for (let y = 0; y < h; y += 16) g.fillRect(0, y, w, 1);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 2, h);
    } else {
      g.fillStyle = '#8a8d90';
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(0,0,0,0.2)';
      for (let y = 0; y < h; y += 32) g.fillRect(0, y, w, 2);
      g.fillStyle = 'rgba(255,255,255,0.1)';
      for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 2, h);
    }
    for (let y = 14; y < h - 14; y += 26) {
      for (let x = 10; x < w - 12; x += 26) {
        const lit = Math.random() < 0.22;
        g.fillStyle = lit ? '#ffd98a' : (style === 'glass' ? '#9ab8d0' : '#20262e');
        g.fillRect(x, y, 16, 18);
        g.fillStyle = 'rgba(255,255,255,0.28)';
        g.fillRect(x, y, 16, 3);
      }
    }
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(0, h - 22, w, 22);
    g.fillStyle = '#3a2a1a';
    g.fillRect(w / 2 - 9, h - 22, 18, 22);
  });
}

// Wooden planks for the docks.
function plankTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#6a4a2a';
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) {
      g.fillStyle = y % 32 === 0 ? '#7a5632' : '#5f4022';
      g.fillRect(0, y, w, 14);
      g.fillStyle = 'rgba(0,0,0,0.4)';
      g.fillRect(0, y + 14, w, 2);
    }
    g.fillStyle = 'rgba(0,0,0,0.35)';
    for (let i = 0; i < 20; i++) {
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  });
}

// Wooden shipping crate: planks with a nailed frame so it reads as a crate.
function crateTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#8a6a3a';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.2)';
    for (let y = 0; y < h; y += 24) g.fillRect(0, y, w, 3);
    g.fillStyle = '#6a4a22';
    g.fillRect(0, 0, w, 10);
    g.fillRect(0, h - 10, w, 10);
    g.fillRect(0, 0, 10, h);
    g.fillRect(w - 10, 0, 10, h);
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(w, h);
    g.moveTo(w, 0);
    g.lineTo(0, h);
    g.stroke();
    g.fillStyle = 'rgba(0,0,0,0.4)';
    for (const [x, y] of [[16, 16], [w - 16, 16], [16, h - 16], [w - 16, h - 16]]) {
      g.beginPath();
      g.arc(x, y, 3, 0, Math.PI * 2);
      g.fill();
    }
  });
}

// Molten rock: dark basalt crust split by glowing orange cracks.
function lavaTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#1a0a06';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ff6a00';
    g.lineWidth = 5;
    for (let i = 0; i < 14; i++) {
      g.beginPath();
      let x = Math.random() * w;
      let y = Math.random() * h;
      g.moveTo(x, y);
      for (let j = 0; j < 5; j++) {
        x += (Math.random() - 0.5) * 90;
        y += (Math.random() - 0.5) * 90;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    g.strokeStyle = '#ffd040';
    g.lineWidth = 2;
    for (let i = 0; i < 10; i++) {
      g.beginPath();
      let x = Math.random() * w;
      let y = Math.random() * h;
      g.moveTo(x, y);
      for (let j = 0; j < 4; j++) {
        x += (Math.random() - 0.5) * 70;
        y += (Math.random() - 0.5) * 70;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    g.fillStyle = 'rgba(255,90,0,0.25)';
    for (let i = 0; i < 12; i++) {
      g.beginPath();
      g.arc(Math.random() * w, Math.random() * h, 8 + Math.random() * 20, 0, Math.PI * 2);
      g.fill();
    }
  });
}

// Sea surface: turquoise with soft wave streaks.
function waveTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#1e8a9c';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.22)';
    g.lineWidth = 3;
    for (let i = 0; i < 10; i++) {
      g.beginPath();
      const y = Math.random() * h;
      g.moveTo(0, y);
      g.bezierCurveTo(w * 0.3, y - 8, w * 0.6, y + 8, w, y);
      g.stroke();
    }
    g.strokeStyle = 'rgba(0,40,60,0.25)';
    for (let i = 0; i < 8; i++) {
      g.beginPath();
      const y = Math.random() * h;
      g.moveTo(0, y);
      g.lineTo(w, y + (Math.random() - 0.5) * 12);
      g.stroke();
    }
  });
}

// Foam blotches for the shoreline ring.
function foamTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 60; i++) {
      g.beginPath();
      g.arc(Math.random() * w, Math.random() * h, 4 + Math.random() * 14, 0, Math.PI * 2);
      g.fill();
    }
  });
}

// Near-white grain so the ground reads as textured, not flat colour.
function detailTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#e8e8e8';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      const v = 200 + Math.floor(Math.random() * 55);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  });
}

// Vertical sky gradient: warm haze at the horizon, deep blue up top.
function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#2f6fc0');
  grad.addColorStop(0.45, '#7fb2e0');
  grad.addColorStop(0.72, '#c8d8e8');
  grad.addColorStop(0.88, '#e8d8b0');
  grad.addColorStop(1, '#d8c8a8');
  g.fillStyle = grad;
  g.fillRect(0, 0, 16, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// A ribbon (triangle strip) through points, hugging the ground.
function ribbon(points, width, yFn, uvRepeat) {
  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[Math.min(i + 1, points.length - 1)];
    const r = points[Math.max(i - 1, 0)];
    let dx = q.x - r.x;
    let dz = q.z - r.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    const nx = -dz * width / 2;
    const nz = dx * width / 2;
    const y1 = yFn(p.x + nx, p.z + nz);
    const y2 = yFn(p.x - nx, p.z - nz);
    pos.push(p.x + nx, y1, p.z + nz, p.x - nx, y2, p.z - nz);
    const v = (i / Math.max(1, points.length - 1)) * uvRepeat;
    uv.push(0, v, 1, v);
    if (i > 0) {
      const a = (i - 1) * 2;
      // Wind counter-clockwise from above so the ribbon faces up.
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// Merge several indexed geometries (position + uv + index) into one mesh.
function mergeGeos(geos) {
  let vCount = 0;
  let iCount = 0;
  for (const g of geos) {
    vCount += g.attributes.position.count;
    iCount += g.index.count;
  }
  const pos = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const idx = new Uint32Array(iCount);
  let vo = 0;
  let io = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, vo * 3);
    uv.set(g.attributes.uv.array, vo * 2);
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i++) idx[io + i] = ix[i] + vo;
    vo += g.attributes.position.count;
    io += ix.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeVertexNormals();
  return out;
}

function terrainColor(x, z, h) {
  const dv = dist(x, z, VOLCANO.x, VOLCANO.z);
  const r = Math.hypot(x - CENTER.x, z - CENTER.z) / 1700;
  const c = new THREE.Color();
  if (h < 1.5) c.setHex(0x2e2a26); // black volcanic sand, under the waterline
  else if (r > 0.92) c.setHex(0x2e2a26); // black-sand beach
  else if (dv < 150) c.setHex(0x3a1f1a); // scorched crater
  else if (dv < 420) c.setHex(0x4a3a34); // basalt rock
  else if (dv < 720) c.setHex(0x5a4a3c); // ash slopes
  else if (r > 0.8) c.setHex(0x8a7a5a); // dry grass near the shore
  else c.setHex(0x5f7a4a); // green inland
  // A little variation so the ground does not look flat.
  const n = 0.92 + 0.16 * Math.abs(Math.sin(x * 0.021 + z * 0.017));
  c.multiplyScalar(n);
  return c;
}

export function buildIslandMeshes(island) {
  const group = new THREE.Group();
  const roadTex = roadTexture();
  const softTex = softSpriteTexture();
  const detailTex = detailTexture();
  detailTex.repeat.set(48, 48);

  // --- Sky dome: a gradient shell around the island, fog-free.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(5200, 24, 12),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  sky.position.set(CENTER.x, 0, CENTER.z);
  group.add(sky);

  // --- Clouds: soft sprites drifting high above the island.
  const clouds = [];
  for (let i = 0; i < 14; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: softTex, color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false, fog: false,
    }));
    const a = Math.random() * Math.PI * 2;
    const r = 600 + Math.random() * 2200;
    sp.position.set(CENTER.x + Math.cos(a) * r, 650 + Math.random() * 300, CENTER.z + Math.sin(a) * r);
    const s = 350 + Math.random() * 350;
    sp.scale.set(s, s * 0.42, 1);
    sp.userData.speed = 6 + Math.random() * 8;
    group.add(sp);
    clouds.push(sp);
  }

  // --- Terrain: a displaced plane, vertex-coloured by district and height,
  // with a grain texture so the ground is not a flat colour.
  const seg = 128;
  const terrainGeo = new THREE.PlaneGeometry(WORLD, WORLD, seg, seg);
  terrainGeo.rotateX(-Math.PI / 2);
  const tPos = terrainGeo.attributes.position;
  const colors = new Float32Array(tPos.count * 3);
  const col = new THREE.Color();
  for (let i = 0; i < tPos.count; i++) {
    const x = tPos.getX(i) + CENTER.x;
    const z = tPos.getZ(i) + CENTER.z;
    const h = terrainHeight(x, z);
    tPos.setY(i, h);
    col.copy(terrainColor(x, z, h));
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();
  const terrain = new THREE.Mesh(
    terrainGeo,
    new THREE.MeshStandardMaterial({ vertexColors: true, map: detailTex, roughness: 0.92, metalness: 0 }),
  );
  terrain.position.set(CENTER.x, 0, CENTER.z);
  terrain.receiveShadow = true;
  group.add(terrain);

  // --- The sea: a turquoise plane with a scrolling wave texture.
  const waveTex = waveTexture();
  waveTex.repeat.set(24, 24);
  const seaMat = new THREE.MeshStandardMaterial({
    color: 0x1e8a9c, map: waveTex, transparent: true, opacity: 0.92,
    metalness: 0.15, roughness: 0.22,
  });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(CENTER.x, 0.8, CENTER.z);
  group.add(sea);

  // --- Foam ring where the surf meets the black sand.
  const foamTex = foamTexture();
  const foamMat = new THREE.MeshBasicMaterial({
    map: foamTex, transparent: true, opacity: 0.35, depthWrite: false,
  });
  const foam = new THREE.Mesh(new THREE.RingGeometry(1460, 1690, 72), foamMat);
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(CENTER.x, 1.05, CENTER.z);
  group.add(foam);

  // --- Roads: ribbons hugging the ground, textured with dashes.
  const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.9, metalness: 0 });
  const roadY = (x, z) => terrainHeight(x, z) + 0.25;
  for (const a of AVENUES) {
    const pts = [];
    for (let z = 80; z <= 3320; z += 160) pts.push({ x: a, z });
    const mesh = new THREE.Mesh(ribbon(pts, ROAD_HALF * 2, roadY, 52), roadMat);
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  for (const s of STREETS) {
    const pts = [];
    for (let x = 80; x <= 3320; x += 160) pts.push({ x, z: s });
    const mesh = new THREE.Mesh(ribbon(pts, ROAD_HALF * 2, roadY, 52), roadMat);
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  // The climb spiral, paved in dark basalt.
  const climbPts = CLIMB_WAYPOINTS.map((p) => ({ x: p.x, z: p.z }));
  climbPts.push(CLIMB_WAYPOINTS[0]);
  const climbMesh = new THREE.Mesh(
    ribbon(climbPts, 34, roadY, 26),
    new THREE.MeshStandardMaterial({ color: 0x3a3634, roughness: 0.95 }),
  );
  climbMesh.receiveShadow = true;
  group.add(climbMesh);

  // --- Sidewalks: light concrete strips flanking every road, one mesh.
  const walkGeos = [];
  const walkY = (x, z) => terrainHeight(x, z) + 0.35;
  for (const a of AVENUES) {
    for (const off of [-27, 27]) {
      const pts = [];
      for (let z = 80; z <= 3320; z += 160) pts.push({ x: a + off, z });
      walkGeos.push(ribbon(pts, 8, walkY, 80));
    }
  }
  for (const s of STREETS) {
    for (const off of [-27, 27]) {
      const pts = [];
      for (let x = 80; x <= 3320; x += 160) pts.push({ x, z: s + off });
      walkGeos.push(ribbon(pts, 8, walkY, 80));
    }
  }
  const walks = new THREE.Mesh(
    mergeGeos(walkGeos),
    new THREE.MeshStandardMaterial({ map: sidewalkTexture(), roughness: 0.95 }),
  );
  walks.receiveShadow = true;
  group.add(walks);

  // --- Crosswalks: zebra stripes at every intersection, one mesh.
  const crossGeos = [];
  const crossY = (x, z) => terrainHeight(x, z) + 0.38;
  for (const a of AVENUES) {
    for (const s of STREETS) {
      for (let k = -2; k <= 2; k++) {
        crossGeos.push(ribbon([{ x: a + k * 9, z: s - 20 }, { x: a + k * 9, z: s + 20 }], 5, crossY, 1));
        crossGeos.push(ribbon([{ x: a - 20, z: s + k * 9 }, { x: a + 20, z: s + k * 9 }], 5, crossY, 1));
      }
    }
  }
  const crosswalks = new THREE.Mesh(
    mergeGeos(crossGeos),
    new THREE.MeshStandardMaterial({ color: 0xf0eee8, roughness: 0.9 }),
  );
  crosswalks.receiveShadow = true;
  group.add(crosswalks);

  // --- Buildings: four facade styles (brick, stucco, glass, concrete),
  // one instanced mesh per style, plus rooftop AC units and water tanks.
  const styles = ['brick', 'stucco', 'glass', 'concrete'];
  const styleTex = {};
  for (const s of styles) styleTex[s] = facadeTexture(s);
  const buckets = { brick: [], stucco: [], glass: [], concrete: [] };
  const roofProps = [];
  for (const b of island.buildings) {
    const cx = b.x + b.w / 2;
    const cz = b.z + b.d / 2;
    const d = districtFor(cx, cz);
    let style = 'stucco';
    if (b.h > 60) style = 'glass';
    else if (d.id === 'ash') style = 'brick';
    else if (d.id === 'slag' || d.id === 'cinder') style = 'concrete';
    buckets[style].push(b);
    if (b.h > 25) {
      roofProps.push({ x: cx, z: cz, y: terrainHeight(cx, cz) - 1 + b.h, kind: 'ac' });
      if ((b.x + b.z) % 3 === 0) roofProps.push({ x: cx - b.w * 0.22, z: cz, y: terrainHeight(cx, cz) - 1 + b.h, kind: 'tank' });
    }
  }
  const bGeo = new THREE.BoxGeometry(1, 1, 1);
  bGeo.translate(0, 0.5, 0);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const pv = new THREE.Vector3();
  const bc = new THREE.Color();
  for (const s of styles) {
    const list = buckets[s];
    if (!list.length) continue;
    const mat = new THREE.MeshStandardMaterial({ map: styleTex[s], roughness: 0.85, metalness: 0.05 });
    const mesh = new THREE.InstancedMesh(bGeo, mat, list.length);
    list.forEach((b, i) => {
      const cx = b.x + b.w / 2;
      const cz = b.z + b.d / 2;
      const gy = terrainHeight(cx, cz) - 1;
      pv.set(cx, gy, cz);
      sc.set(b.w, b.h, b.d);
      m.compose(pv, q, sc);
      mesh.setMatrixAt(i, m);
      bc.setHex(b.wall);
      mesh.setColorAt(i, bc);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  // Rooftop props.
  const acGeo = new THREE.BoxGeometry(5, 2.4, 4);
  acGeo.translate(0, 1.2, 0);
  const acs = roofProps.filter((r) => r.kind === 'ac');
  const acMesh = new THREE.InstancedMesh(acGeo, new THREE.MeshStandardMaterial({ color: 0x7a7d80, roughness: 0.7, metalness: 0.3 }), Math.max(1, acs.length));
  acs.forEach((r, i) => {
    pv.set(r.x, r.y, r.z);
    sc.set(1, 1, 1);
    m.compose(pv, q, sc);
    acMesh.setMatrixAt(i, m);
  });
  acMesh.castShadow = true;
  group.add(acMesh);
  const tanks = roofProps.filter((r) => r.kind === 'tank');
  if (tanks.length) {
    const tankGeo = new THREE.CylinderGeometry(3, 3, 6, 10);
    tankGeo.translate(0, 3, 0);
    const tankMesh = new THREE.InstancedMesh(tankGeo, new THREE.MeshStandardMaterial({ color: 0x9a7a4a, roughness: 0.8 }), tanks.length);
    tanks.forEach((r, i) => {
      pv.set(r.x, r.y, r.z);
      sc.set(1, 1, 1);
      m.compose(pv, q, sc);
      tankMesh.setMatrixAt(i, m);
    });
    tankMesh.castShadow = true;
    group.add(tankMesh);
  }

  // --- Trees: trunks + two canopy styles, all instanced.
  const trunkGeo = new THREE.CylinderGeometry(0.5, 0.8, 6, 5);
  trunkGeo.translate(0, 3, 0);
  const coneGeo = new THREE.ConeGeometry(5, 12, 6);
  coneGeo.translate(0, 10, 0);
  const ballGeo = new THREE.SphereGeometry(5.5, 7, 5);
  ballGeo.scale(1, 0.75, 1);
  ballGeo.translate(0, 9, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.95 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, island.trees.length);
  const cones = new THREE.InstancedMesh(coneGeo, leafMat, island.trees.length);
  const balls = new THREE.InstancedMesh(ballGeo, leafMat, island.trees.length);
  const treeCol = new THREE.Color();
  let coneCount = 0;
  let ballCount = 0;
  island.trees.forEach((t, i) => {
    const gy = terrainHeight(t.x, t.z);
    pv.set(t.x, gy, t.z);
    sc.set(t.s, t.s, t.s);
    m.compose(pv, q, sc);
    trunks.setMatrixAt(i, m);
    const isCone = t.kind !== 'leaf';
    const mesh = isCone ? cones : balls;
    const idx = isCone ? coneCount++ : ballCount++;
    mesh.setMatrixAt(idx, m);
    if (t.kind === 'palm') treeCol.setHex(0x2a7a3a);
    else if (t.kind === 'pine') treeCol.setHex(0x24401f);
    else treeCol.setHex(0x4a7a2a);
    treeCol.offsetHSL(0, 0, (t.tint - 0.5) * 0.12);
    mesh.setColorAt(idx, treeCol);
  });
  cones.count = coneCount;
  balls.count = ballCount;
  trunks.castShadow = true;
  cones.castShadow = true;
  balls.castShadow = true;
  group.add(trunks);
  group.add(cones);
  group.add(balls);

  // --- Street lamps.
  const lampGeo = new THREE.CylinderGeometry(0.25, 0.35, 9, 5);
  lampGeo.translate(0, 4.5, 0);
  const lamps = new THREE.InstancedMesh(lampGeo, new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.6, metalness: 0.5 }), island.lamps.length);
  const lampHeadGeo = new THREE.BoxGeometry(1.6, 0.5, 1.6);
  lampHeadGeo.translate(0, 9.2, 0);
  const lampHeads = new THREE.InstancedMesh(
    lampHeadGeo,
    new THREE.MeshStandardMaterial({ color: 0xffe9a0, emissive: 0xffd860, emissiveIntensity: 0.6 }),
    island.lamps.length,
  );
  island.lamps.forEach((l, i) => {
    pv.set(l.x, terrainHeight(l.x, l.z), l.z);
    sc.set(1, 1, 1);
    m.compose(pv, q, sc);
    lamps.setMatrixAt(i, m);
    lampHeads.setMatrixAt(i, m);
  });
  group.add(lamps);
  group.add(lampHeads);

  // --- Crates.
  const crateGeo = new THREE.BoxGeometry(6, 6, 6);
  crateGeo.translate(0, 3, 0);
  const crateMesh = new THREE.InstancedMesh(crateGeo, new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: 0.9 }), island.crates.length);
  island.crates.forEach((c, i) => {
    pv.set(c.x, terrainHeight(c.x, c.z), c.z);
    sc.set(c.s, c.s, c.s);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (i * 0.7) % Math.PI);
    m.compose(pv, q, sc);
    crateMesh.setMatrixAt(i, m);
  });
  q.identity();
  crateMesh.castShadow = true;
  group.add(crateMesh);

  // --- Docks: planked wooden piers at Port Ash, with moored boats.
  const dockMat = new THREE.MeshStandardMaterial({ map: plankTexture(), roughness: 0.9 });
  const boats = [];
  for (const d of island.docks) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(d.len, 2, d.w), dockMat);
    pier.position.set(d.x + d.len / 2 - 60, 2.2, d.z);
    pier.castShadow = true;
    pier.receiveShadow = true;
    group.add(pier);
    for (let i = 0; i < 4; i++) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 6, 6), dockMat);
      post.position.set(d.x + 40 + i * 70, 3, d.z + d.w / 2 - 4);
      group.add(post);
    }
    // A moored sailboat off the end of the pier, bobbing on the swell.
    const hullShape = new THREE.Shape();
    hullShape.moveTo(-20, 0);
    hullShape.lineTo(-20, 5);
    hullShape.lineTo(12, 5);
    hullShape.lineTo(20, 1);
    hullShape.lineTo(16, 0);
    hullShape.closePath();
    const hullGeo = new THREE.ExtrudeGeometry(hullShape, { depth: 9, bevelEnabled: true, bevelThickness: 1, bevelSize: 1, bevelSegments: 1 });
    hullGeo.translate(0, 0, -4.5);
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(hullGeo, new THREE.MeshStandardMaterial({ color: 0xf0f0e8, roughness: 0.4, metalness: 0.1 }));
    hull.castShadow = true;
    boat.add(hull);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(10, 4, 6), new THREE.MeshStandardMaterial({ color: 0x3a6a8a, roughness: 0.5 }));
    cabin.position.set(-2, 6.5, 0);
    boat.add(cabin);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 22, 6), new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 0.8 }));
    mast.position.set(0, 16, 0);
    boat.add(mast);
    const sail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 12, 7), new THREE.MeshStandardMaterial({ color: 0xe8e0c8, roughness: 0.9 }));
    sail.position.set(0.5, 13, 0);
    boat.add(sail);
    boat.position.set(d.x + d.len - 40, 0.4, d.z + d.w / 2 + 34);
    boat.rotation.y = 0.3;
    group.add(boat);
    boats.push(boat);
  }

  // --- Volcano: crater lava with glowing cracks, glowing flows, soft smoke
  // and rising embers.
  const craterY = terrainHeight(VOLCANO.x, VOLCANO.z) + 2;
  const lavaTex = lavaTexture();
  const lavaMat = new THREE.MeshStandardMaterial({
    map: lavaTex, emissiveMap: lavaTex, emissive: 0xff4400, emissiveIntensity: 1.4, roughness: 0.6,
  });
  const crater = new THREE.Mesh(new THREE.CircleGeometry(105, 24), lavaMat);
  crater.rotation.x = -Math.PI / 2;
  crater.position.set(VOLCANO.x, craterY, VOLCANO.z);
  group.add(crater);
  const flowMat = new THREE.MeshStandardMaterial({
    map: lavaTex, emissiveMap: lavaTex, emissive: 0xff4400, emissiveIntensity: 1.1, roughness: 0.6,
  });
  const flows = [];
  for (const lz of LAVA_ZONES) {
    const pts = [];
    const steps = 8;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      pts.push({
        x: VOLCANO.x + (lz.x - VOLCANO.x) * t,
        z: VOLCANO.z + (lz.z - VOLCANO.z) * t,
      });
    }
    const flow = new THREE.Mesh(ribbon(pts, 26, (x, z) => terrainHeight(x, z) + 0.6, 1), flowMat);
    group.add(flow);
    flows.push(flow);
  }
  const craterLight = new THREE.PointLight(0xff5a00, 9000, 900, 1.6);
  craterLight.position.set(VOLCANO.x, craterY + 40, VOLCANO.z);
  group.add(craterLight);

  const smokeCount = 64;
  const smokeGeo = new THREE.BufferGeometry();
  const smokePos = new Float32Array(smokeCount * 3);
  const smokeSeed = [];
  for (let i = 0; i < smokeCount; i++) {
    smokeSeed.push({ a: Math.random() * Math.PI * 2, r: Math.random() * 60, s: 0.5 + Math.random() * 0.8, o: Math.random() });
    smokePos[i * 3] = VOLCANO.x;
    smokePos[i * 3 + 1] = craterY + 20;
    smokePos[i * 3 + 2] = VOLCANO.z;
  }
  smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePos, 3));
  const smokeMat = new THREE.PointsMaterial({
    map: softTex, color: 0x8a8078, size: 70, transparent: true, opacity: 0.5, sizeAttenuation: true, depthWrite: false,
  });
  const smoke = new THREE.Points(smokeGeo, smokeMat);
  group.add(smoke);

  const emberCount = 24;
  const emberGeo = new THREE.BufferGeometry();
  const emberPos = new Float32Array(emberCount * 3);
  const emberSeed = [];
  for (let i = 0; i < emberCount; i++) {
    emberSeed.push({ a: Math.random() * Math.PI * 2, r: Math.random() * 70, s: 0.6 + Math.random(), o: Math.random() });
  }
  emberGeo.setAttribute('position', new THREE.BufferAttribute(emberPos, 3));
  const emberMat = new THREE.PointsMaterial({
    map: softTex, color: 0xffa040, size: 5, transparent: true, opacity: 0.9,
    sizeAttenuation: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const embers = new THREE.Points(emberGeo, emberMat);
  group.add(embers);

  // --- Daylight: warm sun with shadows, sky fill, warm haze.
  const sun = new THREE.DirectionalLight(0xffe8c0, 2.6);
  sun.position.set(900, 1500, 500);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -600;
  sun.shadow.camera.right = 600;
  sun.shadow.camera.top = 600;
  sun.shadow.camera.bottom = -600;
  sun.shadow.camera.near = 100;
  sun.shadow.camera.far = 4500;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 1;
  group.add(sun);
  group.add(sun.target);
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x4a4038, 1.35);
  group.add(hemi);

  // Animate the volcano and the sea: smoke rises, embers spark, the crater
  // light breathes, the waves scroll, the foam pulses, the clouds drift.
  let smokeT = 0;
  function update(dt, focus) {
    smokeT += dt;
    const arr = smokeGeo.attributes.position.array;
    for (let i = 0; i < smokeCount; i++) {
      const sd = smokeSeed[i];
      const life = (smokeT * sd.s * 0.12 + sd.o) % 1;
      const drift = life * 130;
      arr[i * 3] = VOLCANO.x + Math.cos(sd.a + life * 2) * (sd.r + life * 90);
      arr[i * 3 + 1] = craterY + 20 + life * 260;
      arr[i * 3 + 2] = VOLCANO.z + Math.sin(sd.a) * sd.r + drift * 0.4;
    }
    smokeGeo.attributes.position.needsUpdate = true;
    const earr = emberGeo.attributes.position.array;
    for (let i = 0; i < emberCount; i++) {
      const ed = emberSeed[i];
      const life = (smokeT * ed.s * 0.25 + ed.o) % 1;
      earr[i * 3] = VOLCANO.x + Math.cos(ed.a) * (ed.r + life * 30);
      earr[i * 3 + 1] = craterY + 6 + life * 150;
      earr[i * 3 + 2] = VOLCANO.z + Math.sin(ed.a) * ed.r;
    }
    emberGeo.attributes.position.needsUpdate = true;
    const pulse = Math.sin(smokeT * 2.3) * 0.25 + Math.sin(smokeT * 5.1) * 0.12;
    craterLight.intensity = 8000 + Math.sin(smokeT * 2.3) * 1500 + Math.sin(smokeT * 5.1) * 700;
    lavaMat.emissiveIntensity = 1.4 + pulse;
    flowMat.emissiveIntensity = 1.1 + pulse * 0.8;
    waveTex.offset.x = (smokeT * 0.008) % 1;
    waveTex.offset.y = (smokeT * 0.005) % 1;
    foamMat.opacity = 0.28 + Math.sin(smokeT * 0.9) * 0.1;
    for (const c of clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > CENTER.x + 2600) c.position.x = CENTER.x - 2600;
    }
    for (const b of boats) {
      b.position.y = 0.4 + Math.sin(smokeT * 0.8 + b.position.z) * 0.5;
      b.rotation.z = Math.sin(smokeT * 0.6 + b.position.z) * 0.02;
    }
    if (focus) {
      sun.position.set(focus.x + 900, 1500, focus.z + 500);
      sun.target.position.set(focus.x, 0, focus.z);
    }
  }

  return { group, update, sun };
}
