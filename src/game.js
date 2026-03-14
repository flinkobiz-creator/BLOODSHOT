import * as THREE from 'https://unpkg.com/three@0.163.0/build/three.module.js';
import { PointerLockControls } from 'https://unpkg.com/three@0.163.0/examples/jsm/controls/PointerLockControls.js';
import { OBJLoader } from 'https://unpkg.com/three@0.163.0/examples/jsm/loaders/OBJLoader.js';

const hud = {
  health: document.querySelector('#health'),
  ammo: document.querySelector('#ammo'),
  score: document.querySelector('#score'),
  state: document.querySelector('#state')
};

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0c1020, 30, 320);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 700);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const controls = new PointerLockControls(camera, renderer.domElement);
scene.add(controls.getObject());
document.body.addEventListener('click', () => controls.lock());
controls.addEventListener('lock', () => (hud.state.textContent = 'Armed'));
controls.addEventListener('unlock', () => (hud.state.textContent = 'Click to Lock Cursor'));

const hemi = new THREE.HemisphereLight(0xaed0ff, 0x243328, 0.85);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.position.set(35, 80, 15);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -180;
sun.shadow.camera.right = 180;
sun.shadow.camera.top = 180;
sun.shadow.camera.bottom = -180;
scene.add(sun);

const skyGeo = new THREE.SphereGeometry(520, 36, 24);
const skyMat = new THREE.MeshBasicMaterial({
  color: 0x102040,
  side: THREE.BackSide,
  fog: false
});
const sky = new THREE.Mesh(skyGeo, skyMat);
scene.add(sky);

const clock = new THREE.Clock();
const keys = new Map();
const velocity = new THREE.Vector3();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const gravity = 28;
let canJump = false;

const player = {
  health: 100,
  ammoInMag: 30,
  reserveAmmo: 90,
  magSize: 30,
  fireRate: 0.1,
  reloadTime: 1.2,
  score: 0,
  speed: 10,
  sprintSpeed: 18,
  jumpForce: 11,
  damage: 34,
  lastShotAt: 0,
  reloadUntil: 0,
  weaponModel: null
};

const bullets = [];
const enemies = [];
const obstacles = [];
const loader = new OBJLoader();

const raycaster = new THREE.Raycaster();
const down = new THREE.Vector3(0, -1, 0);

function buildFallbackGround() {
  const geo = new THREE.PlaneGeometry(500, 500, 50, 50);
  geo.rotateX(-Math.PI / 2);
  const arr = geo.attributes.position;
  for (let i = 0; i < arr.count; i += 1) {
    const x = arr.getX(i);
    const z = arr.getZ(i);
    arr.setY(i, Math.sin(x * 0.05) * 1.7 + Math.cos(z * 0.07) * 1.2);
  }
  arr.needsUpdate = true;
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0x2d3f33, roughness: 0.96, metalness: 0.02 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  scene.add(mesh);
  obstacles.push(mesh);
}

function attachMaterial(root, opts = {}) {
  root.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
      obj.material = new THREE.MeshStandardMaterial({
        color: opts.color ?? 0x808080,
        roughness: opts.roughness ?? 0.8,
        metalness: opts.metalness ?? 0.2,
        flatShading: opts.flatShading ?? false
      });
    }
  });
}

async function loadModel(path, opts = {}) {
  try {
    const root = await loader.loadAsync(path);
    attachMaterial(root, opts);
    return root;
  } catch (error) {
    console.warn('Model load failed', path, error);
    return null;
  }
}

function spawnObstacleCluster() {
  for (let i = 0; i < 30; i += 1) {
    const geo = new THREE.BoxGeometry(2 + Math.random() * 8, 2 + Math.random() * 10, 2 + Math.random() * 8);
    const mat = new THREE.MeshStandardMaterial({ color: 0x506040, roughness: 0.9, metalness: 0.03 });
    const m = new THREE.Mesh(geo, mat);
    m.position.set((Math.random() - 0.5) * 220, 1 + geo.parameters.height * 0.5, (Math.random() - 0.5) * 220);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    obstacles.push(m);
  }
}

function spawnEnemy() {
  const enemy = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.6, 1.3, 5, 10),
    new THREE.MeshStandardMaterial({ color: 0xcd3647, roughness: 0.8, metalness: 0.03 })
  );
  body.castShadow = true;
  enemy.add(body);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0xf7d9b9, roughness: 0.8 })
  );
  head.position.y = 1.15;
  head.castShadow = true;
  enemy.add(head);

  enemy.position.set((Math.random() - 0.5) * 170, 1.1, (Math.random() - 0.5) * 170);
  enemy.userData = {
    hp: 100,
    speed: 4 + Math.random() * 2,
    wanderPhase: Math.random() * 100,
    shotCooldown: 0,
    body
  };
  scene.add(enemy);
  enemies.push(enemy);
}

function spawnEnemies(count = 10) {
  for (let i = 0; i < count; i += 1) spawnEnemy();
}

function fireBullet(origin, direction, speed, owner) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 8, 8),
    new THREE.MeshBasicMaterial({ color: owner === 'player' ? 0x71c9ff : 0xff8f8f })
  );
  mesh.position.copy(origin);
  scene.add(mesh);
  bullets.push({
    owner,
    mesh,
    direction: direction.clone(),
    speed,
    ttl: 2.2
  });
}

function shoot() {
  const now = clock.elapsedTime;
  if (!controls.isLocked) return;
  if (now < player.reloadUntil) return;
  if (player.ammoInMag <= 0) return;
  if (now - player.lastShotAt < player.fireRate) return;

  player.lastShotAt = now;
  player.ammoInMag -= 1;
  updateHud();

  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const origin = new THREE.Vector3();
  camera.getWorldPosition(origin);
  origin.addScaledVector(dir, 1.1);

  fireBullet(origin, dir, 90, 'player');
}

function reload() {
  if (clock.elapsedTime < player.reloadUntil) return;
  if (player.ammoInMag === player.magSize || player.reserveAmmo === 0) return;
  player.reloadUntil = clock.elapsedTime + player.reloadTime;
  hud.state.textContent = 'Reloading...';
}

function finishReloadIfNeeded() {
  const now = clock.elapsedTime;
  if (player.reloadUntil > 0 && now >= player.reloadUntil) {
    const needed = player.magSize - player.ammoInMag;
    const loaded = Math.min(needed, player.reserveAmmo);
    player.reserveAmmo -= loaded;
    player.ammoInMag += loaded;
    player.reloadUntil = 0;
    hud.state.textContent = controls.isLocked ? 'Armed' : 'Click to Lock Cursor';
    updateHud();
  }
}

function updateBullets(delta) {
  for (let i = bullets.length - 1; i >= 0; i -= 1) {
    const bullet = bullets[i];
    bullet.ttl -= delta;
    bullet.mesh.position.addScaledVector(bullet.direction, bullet.speed * delta);

    if (bullet.owner === 'player') {
      for (let j = enemies.length - 1; j >= 0; j -= 1) {
        const e = enemies[j];
        if (bullet.mesh.position.distanceTo(e.position) < 1.1) {
          e.userData.hp -= player.damage;
          bullet.ttl = 0;
          if (e.userData.hp <= 0) {
            player.score += 1;
            scene.remove(e);
            enemies.splice(j, 1);
            spawnEnemy();
          }
          break;
        }
      }
    } else {
      const playerPos = controls.getObject().position;
      if (bullet.mesh.position.distanceTo(playerPos) < 0.9) {
        player.health = Math.max(0, player.health - 10);
        bullet.ttl = 0;
        if (player.health <= 0) {
          hud.state.textContent = 'You were eliminated. Refresh to restart.';
        }
      }
    }

    if (bullet.ttl <= 0) {
      scene.remove(bullet.mesh);
      bullets.splice(i, 1);
    }
  }
}

function updateEnemies(delta) {
  const playerPos = controls.getObject().position;
  const now = clock.elapsedTime;

  for (const enemy of enemies) {
    const d = enemy.userData;
    const toPlayer = playerPos.clone().sub(enemy.position);
    const dist = toPlayer.length();

    if (dist < 90) {
      toPlayer.y = 0;
      toPlayer.normalize();
      enemy.position.addScaledVector(toPlayer, d.speed * delta);
      enemy.lookAt(playerPos.x, enemy.position.y, playerPos.z);
      d.shotCooldown -= delta;
      if (dist < 45 && d.shotCooldown <= 0) {
        d.shotCooldown = 0.8 + Math.random() * 0.6;
        const origin = enemy.position.clone();
        origin.y += 0.8;
        const dir = playerPos.clone().sub(origin).normalize();
        fireBullet(origin, dir, 42, 'enemy');
      }
    } else {
      d.wanderPhase += delta;
      enemy.position.x += Math.sin(d.wanderPhase + now) * delta;
      enemy.position.z += Math.cos(d.wanderPhase * 0.7 + now) * delta;
    }

    enemy.position.y = 1.1;
  }
}

function applyMovement(delta) {
  const speed = keys.get('ShiftLeft') ? player.sprintSpeed : player.speed;

  forward.set(0, 0, Number(keys.get('KeyW')) - Number(keys.get('KeyS')));
  right.set(Number(keys.get('KeyD')) - Number(keys.get('KeyA')), 0, 0);

  const accel = new THREE.Vector3();
  accel.addScaledVector(forward, speed * delta * 6);
  accel.addScaledVector(right, speed * delta * 6);

  velocity.x += accel.x;
  velocity.z += accel.z;
  velocity.y -= gravity * delta;

  const damping = Math.exp(-6 * delta);
  velocity.x *= damping;
  velocity.z *= damping;

  if (canJump && keys.get('Space')) {
    velocity.y = player.jumpForce;
    canJump = false;
  }

  controls.moveRight(velocity.x * delta);
  controls.moveForward(velocity.z * delta);
  controls.getObject().position.y += velocity.y * delta;

  const p = controls.getObject().position;
  if (p.y < 2.0) {
    velocity.y = 0;
    p.y = 2.0;
    canJump = true;
  }

  p.x = THREE.MathUtils.clamp(p.x, -245, 245);
  p.z = THREE.MathUtils.clamp(p.z, -245, 245);

  raycaster.set(p, down);
  const hits = raycaster.intersectObjects(obstacles, false);
  if (hits.length > 0 && hits[0].distance < 2.3) {
    if (velocity.y < 0) velocity.y = 0;
    canJump = true;
  }
}

function updateHud() {
  hud.health.textContent = `${Math.round(player.health)}`;
  hud.ammo.textContent = `${player.ammoInMag} / ${player.reserveAmmo}`;
  hud.score.textContent = `${player.score}`;
}

async function setupWorld() {
  controls.getObject().position.set(0, 2, 6);
  updateHud();

  const arena = await loadModel('./src/models/arena.obj', { color: 0x2f4b3a, roughness: 0.94 });
  if (arena) {
    arena.scale.set(1, 2.4, 1);
    arena.position.set(0, 0, 0);
    scene.add(arena);
    obstacles.push(arena);
  } else {
    buildFallbackGround();
  }

  const weapon = await loadModel('./src/models/weapon.obj', { color: 0x6f747a, roughness: 0.5, metalness: 0.8 });
  if (weapon) {
    weapon.scale.set(0.35, 0.35, 0.35);
    weapon.rotation.set(0, Math.PI, 0.1);
    player.weaponModel = weapon;
    camera.add(weapon);
    weapon.position.set(0.22, -0.26, -0.48);
  }

  const propModel = await loadModel('./src/models/character.obj', { color: 0x82653e, roughness: 0.88 });
  if (propModel) {
    for (let i = 0; i < 12; i += 1) {
      const clone = propModel.clone(true);
      clone.scale.setScalar(0.75 + Math.random() * 0.8);
      clone.position.set((Math.random() - 0.5) * 220, 0.4, (Math.random() - 0.5) * 220);
      clone.rotation.y = Math.random() * Math.PI * 2;
      scene.add(clone);
      obstacles.push(clone);
    }
  }

  spawnObstacleCluster();
  spawnEnemies(14);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener('keydown', (e) => {
  keys.set(e.code, true);
  if (e.code === 'KeyR') reload();
});
window.addEventListener('keyup', (e) => keys.set(e.code, false));
window.addEventListener('mousedown', (e) => {
  if (e.button === 0) shoot();
});

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.033);

  finishReloadIfNeeded();

  if (controls.isLocked && player.health > 0) {
    applyMovement(delta);
    updateEnemies(delta);
    if (keys.get('Mouse0')) shoot();
  }

  updateBullets(delta);
  updateHud();

  if (player.weaponModel) {
    const t = clock.elapsedTime;
    const sway = Math.sin(t * 6) * 0.005;
    player.weaponModel.rotation.z = 0.1 + sway;
    player.weaponModel.position.y = -0.26 + Math.abs(Math.cos(t * 8)) * 0.005;
  }

  renderer.render(scene, camera);
}

setupWorld().then(animate);
