// render3d.js — the camera and the things that move with it: the WebGL
// renderer, the third-person chase camera with mouse-drag orbit, Juno's
// character mesh, the objective beacon, and skid marks.
import * as THREE from 'three';
import { terrainHeight } from './terrain3d.js';
import { angleLerp, clamp, lerp } from './util.js';

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  // Full display density (capped at 2x) so the image stays crisp on HD screens.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fc3e8);
  scene.fog = new THREE.Fog(0xd8c8a8, 500, 3200);
  return { renderer, scene };
}

export function resizeRenderer(renderer, camera) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

// Juno: red jacket, dark hair, a pistol at her side. An articulated figure:
// legs and arms swing from hip/shoulder pivots so walk and run read on screen.
export function createPlayerMesh() {
  const g = new THREE.Group();
  const jacket = new THREE.MeshStandardMaterial({ color: 0xc23a1e, roughness: 0.7, metalness: 0.05 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xe8b890, roughness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.85 });
  const denim = new THREE.MeshStandardMaterial({ color: 0x2e4a6a, roughness: 0.8 });

  const hips = new THREE.Group();
  hips.position.y = 0.98;
  g.add(hips);
  const hipMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.62), denim);
  hipMesh.position.y = 0.05;
  hipMesh.castShadow = true;
  hips.add(hipMesh);

  const torso = new THREE.Group();
  torso.position.y = 1.08;
  g.add(torso);
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.72), jacket);
  chest.position.y = 0.36;
  chest.castShadow = true;
  torso.add(chest);
  const collar = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.14, 0.74), dark);
  collar.position.y = 0.72;
  torso.add(collar);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), skin);
  head.position.y = 2.02;
  head.castShadow = true;
  g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2), dark);
  hair.position.y = 2.06;
  g.add(hair);
  const hairBack = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.42), dark);
  hairBack.position.set(-0.22, 1.82, 0);
  g.add(hairBack);

  function limb(mat, w, h, d, x, y, z) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.y = -h / 2;
    mesh.castShadow = true;
    pivot.add(mesh);
    return pivot;
  }
  const legL = limb(denim, 0.24, 0.95, 0.28, 0, 0.98, 0.2);
  const legR = limb(denim, 0.24, 0.95, 0.28, 0, 0.98, -0.2);
  g.add(legL);
  g.add(legR);
  const armL = limb(jacket, 0.2, 0.72, 0.24, 0, 1.72, 0.44);
  const armR = limb(jacket, 0.2, 0.72, 0.24, 0, 1.72, -0.44);
  g.add(armL);
  g.add(armR);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.12, 0.12), dark);
  gun.position.set(0.28, -0.72, 0);
  armR.add(gun);

  g.userData.limbs = { legL, legR, armL, armR, torso };
  g.userData.gun = gun;
  return g;
}

export function syncPlayerMesh(mesh, player, dt, moving) {
  const h = terrainHeight(player.x, player.z);
  mesh.position.set(player.x, h, player.z);
  mesh.rotation.y = -player.angle;
  const limbs = mesh.userData.limbs;
  if (!limbs) return;
  if (moving) {
    player.bob = (player.bob || 0) + dt * 9;
    mesh.position.y = h + Math.abs(Math.sin(player.bob)) * 0.1;
    const s = Math.sin(player.bob);
    limbs.legL.rotation.z = s * 0.65;
    limbs.legR.rotation.z = -s * 0.65;
    limbs.armL.rotation.z = -s * 0.5;
    limbs.armR.rotation.z = s * 0.5;
    limbs.torso.rotation.z = -0.06;
  } else {
    const t = performance.now() * 0.001;
    limbs.legL.rotation.z *= 0.8;
    limbs.legR.rotation.z *= 0.8;
    limbs.armL.rotation.z = Math.sin(t * 1.4) * 0.04;
    limbs.armR.rotation.z = -Math.sin(t * 1.4) * 0.04;
    limbs.torso.rotation.z = 0;
    limbs.torso.position.y = 1.08 + Math.sin(t * 1.4) * 0.015;
  }
}

// A glowing ring and a light pillar marking the mission target.
export function createBeacon() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(9, 0.6, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0xffe14a }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 1.2;
  g.add(ring);
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 140, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
  );
  pillar.position.y = 70;
  g.add(pillar);
  g.visible = false;
  g.userData.ring = ring;
  return g;
}

export function updateBeacon(beacon, target, t) {
  if (!target) {
    beacon.visible = false;
    return;
  }
  beacon.visible = true;
  const h = terrainHeight(target.x, target.z);
  beacon.position.set(target.x, h, target.z);
  beacon.userData.ring.rotation.z = t * 0.8;
  beacon.userData.ring.scale.setScalar(1 + Math.sin(t * 3) * 0.06);
}

// Dark skid marks left by drifting cars, pooled and reused.
export function createSkids(scene) {
  const geo = new THREE.PlaneGeometry(1.4, 5);
  const mat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.4, depthWrite: false });
  const pool = [];
  for (let i = 0; i < 60; i++) {
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    scene.add(m);
    pool.push(m);
  }
  let cursor = 0;
  return {
    add(x, z, angle) {
      const m = pool[cursor];
      cursor = (cursor + 1) % pool.length;
      m.position.set(x, terrainHeight(x, z) + 0.35, z);
      m.rotation.z = -angle;
      m.visible = true;
    },
  };
}

// Third-person chase camera: follows behind the heading, lets the mouse drag
// orbit around, and eases back to the chase line when the drag stops.
export class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    this.yawOffset = 0;
    this.pitchOffset = 0;
    this.idle = 0;
    this.yaw = 0;
    this.pitch = 0.34;
    this.shake = 0;
    this.fov = 62;
  }

  addShake(amount) {
    this.shake = Math.min(1, this.shake + amount);
  }

  // target: {x, z, angle, speed}, driving: bool. orbit: {x, y} pixels dragged.
  update(dt, target, driving, orbit) {
    if (orbit.x !== 0 || orbit.y !== 0) {
      this.yawOffset += orbit.x * 0.005;
      this.pitchOffset = clamp(this.pitchOffset + orbit.y * 0.002, -0.18, 0.4);
      this.idle = 0;
    } else {
      this.idle += dt;
      if (this.idle > 1.4) {
        this.yawOffset = lerp(this.yawOffset, 0, 1 - Math.exp(-1.2 * dt));
        this.pitchOffset = lerp(this.pitchOffset, 0, 1 - Math.exp(-1.2 * dt));
      }
    }
    const wantYaw = target.angle + Math.PI + this.yawOffset;
    this.yaw = angleLerp(this.yaw, wantYaw, 1 - Math.exp(-(driving ? 3.2 : 5) * dt));
    const wantPitch = (driving ? 0.3 : 0.36) + this.pitchOffset;
    this.pitch = lerp(this.pitch, wantPitch, 1 - Math.exp(-4 * dt));
    const dist = driving ? 13 : 8.5;
    const height = driving ? 5.2 : 3.4;
    const ty = terrainHeight(target.x, target.z);
    const cx = target.x + Math.cos(this.yaw) * dist * Math.cos(this.pitch);
    const cz = target.z + Math.sin(this.yaw) * dist * Math.cos(this.pitch);
    let cy = ty + height + dist * Math.sin(this.pitch);
    const groundAtCam = terrainHeight(cx, cz);
    cy = Math.max(cy, groundAtCam + 1.6);
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const sh = this.shake * this.shake;
    const sx = (Math.random() - 0.5) * sh * 1.6;
    const sy = (Math.random() - 0.5) * sh * 1.2;
    this.camera.position.set(cx + sx, cy + sy, cz);
    const lookX = target.x - Math.cos(this.yaw) * 10;
    const lookZ = target.z - Math.sin(this.yaw) * 10;
    this.camera.lookAt(lookX, ty + 2.2, lookZ);
    const speed01 = clamp(Math.abs(target.speed || 0) / 400, 0, 1);
    const wantFov = (driving ? 62 : 58) + speed01 * 12;
    this.fov = lerp(this.fov, wantFov, 1 - Math.exp(-3 * dt));
    if (Math.abs(this.camera.fov - this.fov) > 0.05) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  // Where on the ground (y = groundY) is the mouse pointing? Used for aiming.
  screenToGround(nx, ny, groundY) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -groundY);
    const hit = new THREE.Vector3();
    if (ray.ray.intersectPlane(plane, hit)) return hit;
    return null;
  }
}
