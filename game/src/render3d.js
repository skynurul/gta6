// render3d.js — the camera and the things that move with it: the WebGL
// renderer, the third-person chase camera with mouse-drag orbit, Juno's
// character mesh, the objective beacon, and skid marks.
import * as THREE from 'three';
import { terrainHeight } from './terrain3d.js';
import { angleLerp, clamp, lerp } from './util.js';

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
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

// Juno: red jacket, dark hair, a pistol at her side.
export function createPlayerMesh() {
  const g = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0xc23a1e });
  const skin = new THREE.MeshLambertMaterial({ color: 0xe8b890 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2a2d33 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 1.5, 8), jacket);
  body.position.y = 1.05;
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), skin);
  head.position.y = 2.1;
  head.castShadow = true;
  g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.36, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), dark);
  hair.position.y = 2.14;
  g.add(hair);
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.4, 0.6, 8), dark);
  legs.position.y = 0.3;
  g.add(legs);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.14, 0.14), dark);
  gun.position.set(0.55, 1.15, 0.15);
  g.add(gun);
  g.userData.gun = gun;
  return g;
}

export function syncPlayerMesh(mesh, player, dt, moving) {
  const h = terrainHeight(player.x, player.z);
  mesh.position.set(player.x, h, player.z);
  mesh.rotation.y = -player.angle;
  if (moving) {
    player.bob = (player.bob || 0) + dt * 9;
    mesh.position.y = h + Math.abs(Math.sin(player.bob)) * 0.1;
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
