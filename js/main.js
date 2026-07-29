import * as THREE from 'three';

const $ = (id) => document.getElementById(id);
const startScreen = $('start-screen');
const gameUI = $('game-ui');
const gameOverScreen = $('game-over-screen');
const leaderboardScreen = $('leaderboard-screen');
const garageScreen = $('garage-screen');
const pauseOverlay = $('pause-overlay');
const scoreEl = $('score');
const speedEl = $('speed');
const highScoreEl = $('high-score');
const coinCountEl = $('coin-count');
const finalScoreEl = $('final-score');
const maxSpeedReachedEl = $('max-speed-reached');
const newHighscoreBadge = $('new-highscore-badge');
const playerNameInput = $('player-name');
const leaderboardList = $('leaderboard-list');
const cameraIndicator = $('camera-indicator');
const boostIndicator = $('boost-indicator');
const garageBalanceEl = $('garage-balance');
const garageStatusEl = $('garage-status');
const garageListEl = $('garage-list');
const gameContainer = $('game-container');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f172a);
scene.fog = new THREE.Fog(0x0f172a, 30, 180);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 300);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
gameContainer.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0x6070ff, 0.65);
scene.add(ambientLight);
const sunLight = new THREE.DirectionalLight(0xfff4d6, 1.2);
sunLight.position.set(20, 30, 10);
sunLight.castShadow = true;
scene.add(sunLight);

const lanePositions = [-3.2, 0, 3.2];
const roadSegments = [];
const buildings = [];
const obstacles = [];
const coins = [];

let gameState = 'menu';
let score = 0;
let playerSpeed = 0;
let maxSpeed = 0;
let coinCount = 0;
let walletCoins = Number(localStorage.getItem('highway-racing-wallet') || 0);
let currentCar = Number(localStorage.getItem('highway-racing-car') || 0);
let ownedCars = JSON.parse(localStorage.getItem('highway-racing-owned-cars') || '[0]');
let laneIndex = 1;
let cameraThirdPerson = true;
let paused = false;
let spawnTimer = 0.95;
let coinSpawnTimer = 1.2;
let highScore = Number(localStorage.getItem('highway-racing-highscore') || 0);
let audioContext;
const clock = new THREE.Clock();

const carGroup = new THREE.Group();
carGroup.position.set(0, 0.9, 0);
scene.add(carGroup);

const carPresets = [
  { id: 0, name: 'Starter Coupe', price: 0, color: 0xff3b30, accent: 0x111827, topSpeed: 48 },
  { id: 1, name: 'Turbo Hatch', price: 12, color: 0x3b82f6, accent: 0x0f172a, topSpeed: 54 },
  { id: 2, name: 'Neon Drift', price: 24, color: 0xf472b6, accent: 0x111827, topSpeed: 60 }
];

function buildCarModel(carIndex) {
  while (carGroup.children.length) {
    carGroup.remove(carGroup.children[0]);
  }

  const preset = carPresets[carIndex];
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: preset.color, roughness: 0.25, metalness: 0.8 });
  const cabinMaterial = new THREE.MeshStandardMaterial({ color: preset.accent, roughness: 0.6, metalness: 0.2 });
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95, metalness: 0.08 });

  const carBody = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.95, 4.4), bodyMaterial);
  carBody.position.y = 0.8;
  carGroup.add(carBody);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.8, 1.8), cabinMaterial);
  cabin.position.set(0, 1.35, -0.12);
  carGroup.add(cabin);

  const wheelGeometry = new THREE.CylinderGeometry(0.45, 0.45, 0.26, 24);
  wheelGeometry.rotateZ(Math.PI / 2);
  for (const position of [[-1.08, 0.35, 1.5], [1.08, 0.35, 1.5], [-1.08, 0.35, -1.5], [1.08, 0.35, -1.5]]) {
    const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    wheel.position.set(...position);
    carGroup.add(wheel);
  }

  const headlightMaterial = new THREE.MeshStandardMaterial({ emissive: 0xfff6d0, emissiveIntensity: 0.9 });
  const leftHeadlight = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.12), headlightMaterial);
  const rightHeadlight = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.12), headlightMaterial);
  leftHeadlight.position.set(-0.62, 0.74, 2.24);
  rightHeadlight.position.set(0.62, 0.74, 2.24);
  carGroup.add(leftHeadlight, rightHeadlight);

  return preset;
}

let currentPreset = buildCarModel(currentCar);

const roadMaterial = new THREE.MeshStandardMaterial({ color: 0x333544, roughness: 0.92, metalness: 0.08 });
const shoulderMaterial = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.95, metalness: 0.05 });
const stripeMaterial = new THREE.MeshStandardMaterial({ color: 0xfef3c7, emissive: 0xb45309, emissiveIntensity: 0.25 });
const plantMaterial = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.9, metalness: 0.05 });
const plantStemMaterial = new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.9, metalness: 0.05 });
const plants = [];

for (let i = 0; i < 3; i += 1) {
  const road = new THREE.Mesh(new THREE.PlaneGeometry(18, 40), roadMaterial);
  road.rotation.x = -Math.PI / 2;
  road.position.z = i * 40 - 40;
  road.receiveShadow = true;
  scene.add(road);
  roadSegments.push(road);

  const shoulder = new THREE.Mesh(new THREE.PlaneGeometry(26, 40), shoulderMaterial);
  shoulder.rotation.x = -Math.PI / 2;
  shoulder.position.z = i * 40 - 40;
  shoulder.position.y = 0.01;
  scene.add(shoulder);
}

const laneDivider = new THREE.Group();
for (let i = 0; i < 40; i += 1) {
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 2.2), stripeMaterial);
  stripe.position.set(0, 0.02, -40 + i * 2.2);
  laneDivider.add(stripe);
}
scene.add(laneDivider);

for (let i = 0; i < 40; i += 1) {
  const zPos = -80 + i * 4;
  for (const side of [-1, 1]) {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.8, 8), plantStemMaterial);
    stem.position.set(side * 10.1, 0.4, zPos);
    scene.add(stem);

    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.1, 8), plantMaterial);
    leaf.rotation.x = Math.PI / 2;
    leaf.position.set(side * 10.1, 1, zPos);
    scene.add(leaf);

    plants.push(stem, leaf);
  }
}

for (let i = 0; i < 60; i += 1) {
  const height = 4 + Math.random() * 12;
  const width = 2.2 + Math.random() * 2.5;
  const depth = 2.2 + Math.random() * 2.5;
  const building = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.95 }));
  building.position.set((Math.random() > 0.5 ? 1 : -1) * (14 + Math.random() * 6), height / 2, -80 + Math.random() * 170);
  scene.add(building);
  buildings.push(building);
}

const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), new THREE.MeshStandardMaterial({ color: 0x0f766e, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.02;
scene.add(ground);

const barrierLeft = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.2, 220), new THREE.MeshStandardMaterial({ color: 0x64748b }));
barrierLeft.position.set(-9.4, 0.6, 0);
scene.add(barrierLeft);
const barrierRight = barrierLeft.clone();
barrierRight.position.x = 9.4;
scene.add(barrierRight);

function initAudio() {
  if (audioContext) return;
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === 'suspended') audioContext.resume();
}

function playTone(frequency, duration, type = 'square', volume = 0.04) {
  if (!audioContext) return;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  gain.gain.value = volume;
  osc.connect(gain);
  gain.connect(audioContext.destination);
  osc.start();
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
  osc.stop(audioContext.currentTime + duration);
}

function playStartSound() { initAudio(); playTone(520, 0.08, 'triangle', 0.03); setTimeout(() => playTone(680, 0.1, 'sine', 0.025), 70); }
function playLaneSound() { initAudio(); playTone(420, 0.06, 'square', 0.025); }
function playCrashSound() { initAudio(); playTone(180, 0.16, 'sawtooth', 0.05); setTimeout(() => playTone(90, 0.20, 'square', 0.04), 70); }
function playCoinSound() { initAudio(); playTone(1320, 0.08, 'triangle', 0.035); setTimeout(() => playTone(1760, 0.10, 'sine', 0.025), 40); }

function renderLeaderboard(entries) {
  leaderboardList.innerHTML = '';
  if (!entries.length) {
    leaderboardList.innerHTML = '<p class="no-scores">No scores yet. Play a game!</p>';
    return;
  }
  entries.forEach((entry, index) => {
    const row = document.createElement('div');
    row.className = 'leaderboard-entry';
    const rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : '';
    row.innerHTML = `
      <span class="rank ${rankClass}">${index + 1}</span>
      <span class="name">${entry.name}</span>
      <span class="lb-score">${entry.score}</span>
      <span class="lb-max-speed">${entry.maxSpeed} km/h</span>`;
    leaderboardList.appendChild(row);
  });
}

function updateHud() {
  scoreEl.textContent = Math.floor(score).toString();
  speedEl.textContent = Math.floor(playerSpeed).toString();
  highScoreEl.textContent = Math.floor(highScore).toString();
  coinCountEl.textContent = coinCount.toString();
  cameraIndicator.textContent = cameraThirdPerson ? '3RD PERSON' : '1ST PERSON';
  boostIndicator.textContent = playerSpeed >= 42 ? 'BOOST' : 'READY';
  boostIndicator.classList.toggle('warning', playerSpeed >= 42);
}

function syncWallet() {
  walletCoins = Math.max(0, walletCoins);
  localStorage.setItem('highway-racing-wallet', String(walletCoins));
  localStorage.setItem('highway-racing-car', String(currentCar));
  localStorage.setItem('highway-racing-owned-cars', JSON.stringify(ownedCars));
}

function renderGarage() {
  garageBalanceEl.textContent = `Coins: ${walletCoins}`;
  garageStatusEl.textContent = `Equipped: ${carPresets[currentCar].name}`;
  garageListEl.innerHTML = '';

  carPresets.forEach((car, index) => {
    const card = document.createElement('div');
    card.className = 'garage-card';
    const owned = ownedCars.includes(index);
    const equipped = currentCar === index;
    card.innerHTML = `
      <div class="card-row">
        <h3>${car.name}</h3>
        <span class="card-badge">${equipped ? 'Equipped' : owned ? 'Owned' : 'Buyable'}</span>
      </div>
      <p>Top speed: ${car.topSpeed} km/h</p>
      <div class="card-row">
        <span>${owned ? 'Unlocked' : `Cost: ${car.price} coins`}</span>
        <button class="menu-btn small" data-car-index="${index}">${owned ? (equipped ? 'Equipped' : 'Equip') : 'Buy'}</button>
      </div>`;
    garageListEl.appendChild(card);
  });
}

function buyOrEquipCar(index) {
  const preset = carPresets[index];
  if (!ownedCars.includes(index)) {
    if (walletCoins < preset.price) return;
    walletCoins -= preset.price;
    ownedCars.push(index);
  }
  currentCar = index;
  currentPreset = buildCarModel(index);
  syncWallet();
  renderGarage();
}

function openGarage() {
  renderGarage();
  showScreen('garage');
}

function showScreen(screen) {
  startScreen.classList.add('hidden');
  gameOverScreen.classList.add('hidden');
  leaderboardScreen.classList.add('hidden');
  garageScreen.classList.add('hidden');
  gameUI.classList.add('hidden');
  pauseOverlay.classList.add('hidden');

  if (screen === 'start') startScreen.classList.remove('hidden');
  if (screen === 'game') gameUI.classList.remove('hidden');
  if (screen === 'over') gameOverScreen.classList.remove('hidden');
  if (screen === 'leaderboard') leaderboardScreen.classList.remove('hidden');
  if (screen === 'garage') garageScreen.classList.remove('hidden');
}

function resetGame() {
  score = 0;
  playerSpeed = 0;
  maxSpeed = 0;
  coinCount = 0;
  walletCoins = Number(localStorage.getItem('highway-racing-wallet') || 0);
  currentCar = Number(localStorage.getItem('highway-racing-car') || 0);
  ownedCars = JSON.parse(localStorage.getItem('highway-racing-owned-cars') || '[0]');
  currentPreset = buildCarModel(currentCar);
  laneIndex = 1;
  spawnTimer = 0.95;
  coinSpawnTimer = 1.2;
  paused = false;
  obstacles.splice(0, obstacles.length);
  coins.splice(0, coins.length);
  carGroup.position.x = lanePositions[laneIndex];
  carGroup.position.z = 0;
  scene.children.forEach((child) => {
    if (child !== carGroup && child !== ground && child !== barrierLeft && child !== barrierRight && child !== ambientLight && child !== sunLight && child !== laneDivider && !roadSegments.includes(child) && !buildings.includes(child)) {
      scene.remove(child);
    }
  });
  while (obstacles.length) obstacles.pop();
  gameState = 'playing';
  showScreen('game');
  updateHud();
  playStartSound();
}

function endGame() {
  if (gameState !== 'playing') return;
  gameState = 'game_over';
  paused = false;
  if (score > highScore) {
    highScore = score;
    localStorage.setItem('highway-racing-highscore', String(highScore));
    newHighscoreBadge.classList.remove('hidden');
  } else {
    newHighscoreBadge.classList.add('hidden');
  }
  finalScoreEl.textContent = `Score: ${Math.floor(score)}`;
  maxSpeedReachedEl.textContent = `Max Speed: ${Math.floor(maxSpeed)} km/h`;
  const coinBonus = coinCount * 10;
  finalScoreEl.textContent += `\nCoins: ${coinCount} (+${coinBonus})`;
  showScreen('over');
  updateHud();
  playCrashSound();
}

function saveScore() {
  const entry = {
    name: playerNameInput.value.trim() || 'Player',
    score: Math.floor(score),
    maxSpeed: Math.floor(maxSpeed)
  };
  const board = JSON.parse(localStorage.getItem('highway-racing-leaderboard') || '[]');
  board.push(entry);
  board.sort((a, b) => b.score - a.score || b.maxSpeed - a.maxSpeed);
  const top = board.slice(0, 8);
  localStorage.setItem('highway-racing-leaderboard', JSON.stringify(top));
  renderLeaderboard(top);
}

const obstacleCarColors = [
  { body: 0xef4444, accent: 0x1e293b },   // Red
  { body: 0xf97316, accent: 0x1e293b },   // Orange
  { body: 0x8b5cf6, accent: 0x1e293b },   // Purple
  { body: 0x06b6d4, accent: 0x1e293b },   // Cyan
  { body: 0x84cc16, accent: 0x1e293b },   // Lime
  { body: 0xf43f5e, accent: 0x1e293b },   // Rose
  { body: 0x22c55e, accent: 0x1e293b },   // Green
  { body: 0xeab308, accent: 0x1e293b },   // Yellow
];

function buildObstacleCarMesh(colorPreset) {
  const group = new THREE.Group();

  const bodyMaterial = new THREE.MeshStandardMaterial({ color: colorPreset.body, roughness: 0.35, metalness: 0.6 });
  const cabinMaterial = new THREE.MeshStandardMaterial({ color: colorPreset.accent, roughness: 0.6, metalness: 0.2 });
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95, metalness: 0.08 });
  const headlightMaterial = new THREE.MeshStandardMaterial({ emissive: 0xfff6d0, emissiveIntensity: 0.9 });

  // Car body - slightly smaller than player car
  const carBody = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.85, 3.8), bodyMaterial);
  carBody.position.y = 0.75;
  carBody.castShadow = true;
  group.add(carBody);

  // Cabin
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 1.6), cabinMaterial);
  cabin.position.set(0, 1.2, -0.1);
  group.add(cabin);

  // Wheels
  const wheelGeometry = new THREE.CylinderGeometry(0.38, 0.38, 0.22, 20);
  wheelGeometry.rotateZ(Math.PI / 2);
  const wheelPositions = [[-0.96, 0.32, 1.3], [0.96, 0.32, 1.3], [-0.96, 0.32, -1.3], [0.96, 0.32, -1.3]];
  for (const pos of wheelPositions) {
    const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    wheel.position.set(...pos);
    group.add(wheel);
  }

  // Headlights (rear-facing since these are oncoming - so put on front which is -z after rotation)
  const leftHeadlight = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.1), headlightMaterial);
  const rightHeadlight = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.1), headlightMaterial);
  leftHeadlight.position.set(-0.54, 0.68, -1.96);
  rightHeadlight.position.set(0.54, 0.68, -1.96);
  group.add(leftHeadlight, rightHeadlight);

  // Tail lights (red emissive)
  const tailLightMat = new THREE.MeshStandardMaterial({ emissive: 0xff0000, emissiveIntensity: 0.5 });
  const leftTail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.08), tailLightMat);
  const rightTail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.08), tailLightMat);
  leftTail.position.set(-0.54, 0.65, 1.94);
  rightTail.position.set(0.54, 0.65, 1.94);
  group.add(leftTail, rightTail);

  // Rotate 180 degrees so car faces oncoming (toward player)
  group.rotation.y = Math.PI;

  return group;
}

function spawnObstacle() {
  const colorPreset = obstacleCarColors[Math.floor(Math.random() * obstacleCarColors.length)];
  const obstacleCar = buildObstacleCarMesh(colorPreset);
  obstacleCar.position.set(lanePositions[Math.floor(Math.random() * lanePositions.length)], 0.35, -40 - Math.random() * 20);
  scene.add(obstacleCar);
  obstacles.push(obstacleCar);
}

function spawnCoin() {
  const coin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 0.6, 0.16, 16),
    new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0xffd54f, emissiveIntensity: 0.75, roughness: 0.2, metalness: 0.9 })
  );
  coin.rotation.x = Math.PI / 2;
  coin.position.set(lanePositions[Math.floor(Math.random() * lanePositions.length)], 0.95, -40 - Math.random() * 20);
  coin.userData = { floatOffset: Math.random() * Math.PI * 2, bobHeight: 0.18 + Math.random() * 0.12 };
  scene.add(coin);
  coins.push(coin);
}

function togglePause() {
  if (gameState !== 'playing') return;
  paused = !paused;
  pauseOverlay.classList.toggle('hidden', !paused);
  gameState = paused ? 'paused' : 'playing';
}

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(0.032, clock.getDelta());
  if (gameState === 'playing' && !paused) {
    score += delta * (playerSpeed + 3.5) * 1.8;
    playerSpeed = Math.min(48, playerSpeed + 3.8 * delta + score / 6200);
    maxSpeed = Math.max(maxSpeed, playerSpeed);

    spawnTimer -= delta;
    if (spawnTimer <= 0) {
      spawnObstacle();
      spawnTimer = Math.max(0.85, 1.45 - playerSpeed / 110);
    }

    coinSpawnTimer -= delta;
    if (coinSpawnTimer <= 0) {
      spawnCoin();
      coinSpawnTimer = Math.max(1.0, 1.7 - playerSpeed / 130);
    }

    roadSegments.forEach((segment) => {
      segment.position.z += playerSpeed * delta * 0.72;
      if (segment.position.z > 40) segment.position.z -= 120;
    });

    laneDivider.position.z += playerSpeed * delta * 0.72;
    if (laneDivider.position.z > 2.2) laneDivider.position.z -= 2.2 * 40;

    buildings.forEach((building) => {
      building.position.z += playerSpeed * delta * 0.48;
      if (building.position.z > 80) building.position.z -= 220;
    });

    plants.forEach((plant) => {
      plant.position.z += playerSpeed * delta * 0.48;
      if (plant.position.z > 80) plant.position.z -= 220;
    });

    const targetX = lanePositions[laneIndex];
    carGroup.position.x += (targetX - carGroup.position.x) * 0.12;
    carGroup.position.z = 0;

    for (let i = obstacles.length - 1; i >= 0; i -= 1) {
      const obstacle = obstacles[i];
      obstacle.position.z += playerSpeed * delta * 0.95;
      if (obstacle.position.z > 8) {
        scene.remove(obstacle);
        obstacles.splice(i, 1);
      } else if (Math.abs(obstacle.position.x - carGroup.position.x) < 1.16 && Math.abs(obstacle.position.z - carGroup.position.z) < 1.5) {
        endGame();
        break;
      }
    }

    for (let i = coins.length - 1; i >= 0; i -= 1) {
      const coin = coins[i];
      coin.position.z += playerSpeed * delta * 0.95;
      coin.position.y = 0.95 + Math.sin(coin.userData.floatOffset + performance.now() * 0.0015) * coin.userData.bobHeight;
      coin.rotation.z += delta * 5;
      if (coin.position.z > 8) {
        scene.remove(coin);
        coins.splice(i, 1);
      } else if (Math.abs(coin.position.x - carGroup.position.x) < 0.95 && Math.abs(coin.position.z - carGroup.position.z) < 1.2) {
        coinCount += 1;
        walletCoins += 1;
        score += 35;
        syncWallet();
        playCoinSound();
        scene.remove(coin);
        coins.splice(i, 1);
      }
    }

    if (cameraThirdPerson) {
      camera.position.lerp(new THREE.Vector3(carGroup.position.x, 5.8, 10), 0.08);
      camera.lookAt(carGroup.position.x, 1.3, 0);
    } else {
      camera.position.lerp(new THREE.Vector3(carGroup.position.x, 1.7, 0.9), 0.1);
      camera.lookAt(carGroup.position.x, 1.2, 8);
    }
  }

  updateHud();
  renderer.render(scene, camera);
}

window.addEventListener('keydown', (event) => {
  if (event.code === 'ArrowLeft' || event.code === 'KeyA') {
    event.preventDefault();
    laneIndex = Math.max(0, laneIndex - 1);
    playLaneSound();
  }
  if (event.code === 'ArrowRight' || event.code === 'KeyD') {
    event.preventDefault();
    laneIndex = Math.min(2, laneIndex + 1);
    playLaneSound();
  }
  if (event.code === 'ArrowUp' || event.code === 'KeyW') {
    event.preventDefault();
    if (gameState === 'menu' || gameState === 'game_over') resetGame();
    else if (gameState === 'paused') { paused = false; gameState = 'playing'; pauseOverlay.classList.add('hidden'); }
  }
  if (event.code === 'ArrowDown' || event.code === 'KeyS') {
    event.preventDefault();
    if (gameState === 'playing') togglePause();
  }
  if (event.code === 'KeyC') {
    event.preventDefault();
    cameraThirdPerson = !cameraThirdPerson;
  }
  if (event.code === 'KeyP') {
    event.preventDefault();
    if (gameState === 'playing') togglePause();
  }
  if (event.code === 'Space') {
    event.preventDefault();
    if (gameState === 'menu' || gameState === 'game_over') resetGame();
  }
});

$('start-btn').addEventListener('click', () => resetGame());
$('garage-btn').addEventListener('click', () => openGarage());
$('restart-btn').addEventListener('click', () => resetGame());
$('leaderboard-btn').addEventListener('click', () => {
  const board = JSON.parse(localStorage.getItem('highway-racing-leaderboard') || '[]');
  renderLeaderboard(board);
  showScreen('leaderboard');
});
$('back-btn').addEventListener('click', () => showScreen('start'));
$('garage-close-btn').addEventListener('click', () => showScreen('start'));
$('clear-leaderboard-btn').addEventListener('click', () => {
  localStorage.removeItem('highway-racing-leaderboard');
  renderLeaderboard([]);
});
$('save-score-btn').addEventListener('click', () => {
  saveScore();
  showScreen('start');
});
$('resume-btn').addEventListener('click', () => {
  paused = false;
  gameState = 'playing';
  pauseOverlay.classList.add('hidden');
});
$('quit-btn').addEventListener('click', () => {
  gameState = 'menu';
  paused = false;
  showScreen('start');
});

$('touch-left').addEventListener('pointerdown', () => { laneIndex = Math.max(0, laneIndex - 1); playLaneSound(); });
$('touch-right').addEventListener('pointerdown', () => { laneIndex = Math.min(2, laneIndex + 1); playLaneSound(); });
$('touch-up').addEventListener('pointerdown', () => { if (gameState === 'menu' || gameState === 'game_over') resetGame(); else if (gameState === 'paused') { paused = false; gameState = 'playing'; pauseOverlay.classList.add('hidden'); } });
$('touch-down').addEventListener('pointerdown', () => { if (gameState === 'playing') togglePause(); });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

garageListEl.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-car-index]');
  if (!button) return;
  buyOrEquipCar(Number(button.dataset.carIndex));
});

renderLeaderboard(JSON.parse(localStorage.getItem('highway-racing-leaderboard') || '[]'));
updateHud();
renderGarage();
showScreen('start');
animate();
