// city3d.js — turns the island data into a Three.js scene: displaced terrain
// with painted vertex colours, ribbon roads, instanced buildings and trees,
// the volcano's lava and smoke, the sea, and the island's daylight.
import * as THREE from 'three';
import {
  WORLD, CENTER, VOLCANO, AVENUES, STREETS, ROAD_HALF,
  CLIMB_WAYPOINTS, terrainHeight, LAVA_ZONES,
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

// Asphalt with a dashed centre line and concrete shoulders.
function roadTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#3d3a38';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#555049';
    g.fillRect(0, 0, 10, h);
    g.fillRect(w - 10, 0, 10, h);
    g.fillStyle = '#d8c860';
    g.fillRect(w / 2 - 3, 8, 6, 48);
    g.fillStyle = '#2e2b29';
    for (let i = 0; i < 40; i++) {
      g.fillRect(Math.random() * w, Math.random() * h, 3, 2);
    }
  });
}

// Windows baked into a texture so one instanced mesh carries every building.
function windowsTexture() {
  return canvasTexture(64, 128, (g, w, h) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#2a323e';
    for (let y = 10; y < h - 8; y += 18) {
      for (let x = 8; x < w - 8; x += 16) {
        g.fillRect(x, y, 9, 12);
      }
    }
  });
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
  const winTex = windowsTexture();

  // --- Terrain: a displaced plane, vertex-coloured by district and height.
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
    new THREE.MeshLambertMaterial({ vertexColors: true }),
  );
  terrain.position.set(CENTER.x, 0, CENTER.z);
  terrain.receiveShadow = true;
  group.add(terrain);

  // --- The sea: one big turquoise plane at y = 0.8.
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(9000, 9000),
    new THREE.MeshLambertMaterial({ color: 0x1e9aa8, transparent: true, opacity: 0.88 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(CENTER.x, 0.8, CENTER.z);
  group.add(sea);

  // --- Roads: ribbons hugging the ground, textured with dashes.
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
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
    new THREE.MeshLambertMaterial({ color: 0x3a3634 }),
  );
  climbMesh.receiveShadow = true;
  group.add(climbMesh);

  // --- Buildings: one InstancedMesh, windows baked in the texture.
  const bGeo = new THREE.BoxGeometry(1, 1, 1);
  bGeo.translate(0, 0.5, 0);
  const bMat = new THREE.MeshLambertMaterial({ map: winTex });
  const bMesh = new THREE.InstancedMesh(bGeo, bMat, Math.max(1, island.buildings.length));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const pv = new THREE.Vector3();
  const bc = new THREE.Color();
  island.buildings.forEach((b, i) => {
    const cx = b.x + b.w / 2;
    const cz = b.z + b.d / 2;
    const gy = terrainHeight(cx, cz) - 1;
    pv.set(cx, gy, cz);
    sc.set(b.w, b.h, b.d);
    m.compose(pv, q, sc);
    bMesh.setMatrixAt(i, m);
    bc.setHex(b.wall);
    bMesh.setColorAt(i, bc);
  });
  bMesh.castShadow = true;
  bMesh.receiveShadow = true;
  group.add(bMesh);

  // --- Trees: trunks + two canopy styles, all instanced.
  const trunkGeo = new THREE.CylinderGeometry(0.5, 0.8, 6, 5);
  trunkGeo.translate(0, 3, 0);
  const coneGeo = new THREE.ConeGeometry(5, 12, 6);
  coneGeo.translate(0, 10, 0);
  const ballGeo = new THREE.SphereGeometry(5.5, 7, 5);
  ballGeo.scale(1, 0.75, 1);
  ballGeo.translate(0, 9, 0);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5a4632 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
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
  const lamps = new THREE.InstancedMesh(lampGeo, new THREE.MeshLambertMaterial({ color: 0x2a2d33 }), island.lamps.length);
  const lampHeadGeo = new THREE.BoxGeometry(1.6, 0.5, 1.6);
  lampHeadGeo.translate(0, 9.2, 0);
  const lampHeads = new THREE.InstancedMesh(
    lampHeadGeo,
    new THREE.MeshLambertMaterial({ color: 0xffe9a0, emissive: 0xffd860, emissiveIntensity: 0.6 }),
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
  const crateMesh = new THREE.InstancedMesh(crateGeo, new THREE.MeshLambertMaterial({ color: 0x8a6a3a }), island.crates.length);
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

  // --- Docks: wooden piers at Port Ash.
  const dockMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2a });
  for (const d of island.docks) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(d.len, 2, d.w), dockMat);
    pier.position.set(d.x + d.len / 2 - 60, 2.2, d.z);
    pier.castShadow = true;
    group.add(pier);
    for (let i = 0; i < 4; i++) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 6, 6), dockMat);
      post.position.set(d.x + 40 + i * 70, 3, d.z + d.w / 2 - 4);
      group.add(post);
    }
  }

  // --- Volcano: crater lava, glowing flows, and drifting smoke.
  const craterY = terrainHeight(VOLCANO.x, VOLCANO.z) + 2;
  const lavaMat = new THREE.MeshBasicMaterial({ color: 0xff5a00 });
  const crater = new THREE.Mesh(new THREE.CircleGeometry(105, 24), lavaMat);
  crater.rotation.x = -Math.PI / 2;
  crater.position.set(VOLCANO.x, craterY, VOLCANO.z);
  group.add(crater);
  const flowMat = new THREE.MeshBasicMaterial({ color: 0xff6a10 });
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

  const smokeCount = 48;
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
    color: 0x8a8078, size: 42, transparent: true, opacity: 0.45, sizeAttenuation: true,
  });
  const smoke = new THREE.Points(smokeGeo, smokeMat);
  group.add(smoke);

  // --- Daylight: warm sun with shadows, sky fill, warm haze.
  const sun = new THREE.DirectionalLight(0xffe8c0, 2.4);
  sun.position.set(900, 1500, 500);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -450;
  sun.shadow.camera.right = 450;
  sun.shadow.camera.top = 450;
  sun.shadow.camera.bottom = -450;
  sun.shadow.camera.far = 4000;
  sun.shadow.bias = -0.0015;
  group.add(sun);
  group.add(sun.target);
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x4a4038, 1.35);
  group.add(hemi);

  // Animate the volcano: smoke rises, the crater light breathes.
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
    craterLight.intensity = 8000 + Math.sin(smokeT * 2.3) * 1500 + Math.sin(smokeT * 5.1) * 700;
    if (focus) {
      sun.position.set(focus.x + 900, 1500, focus.z + 500);
      sun.target.position.set(focus.x, 0, focus.z);
    }
  }

  return { group, update, sun };
}
