import * as THREE from '/vendor/three/three.module.js';

/**
 * 3D Eggboy Party Game Engine (3D 闯关引擎)
 * Handles Three.js 3D world, bouncy physics, procedural animations, level generation, and obstacle interactions
 */
export class EggPartyGame {
  constructor(container, options = {}) {
    this.container = container;
    this.options = options;
    this.survey = options.survey || null;
    this.questions = (this.survey && this.survey.questions) || [];
    this.onLevelReach = options.onLevelReach || (() => {});
    this.onGameFinish = options.onGameFinish || (() => {});
    this.onCollectStar = options.onCollectStar || (() => {});

    this.currentLevelIndex = 0;
    this.isAnswering = false;
    this.isFinished = false;
    this.score = 0;

    // Movement & physics
    this.player = null;
    this.eggBody = null;
    this.propellerMesh = null;
    this.hatMesh = null;
    this.leftHand = null;
    this.rightHand = null;
    this.leftFoot = null;
    this.rightFoot = null;

    this.playerVelocity = new THREE.Vector3();
    this.isGrounded = true;
    this.speed = 18;
    this.jumpForce = 14;
    this.gravity = 30;

    // Input state
    this.keys = { forward: false, backward: false, left: false, right: false, jump: false };
    this.joystickDir = { x: 0, y: 0 };

    // Mouse / Pointer control state
    this.mouseControl = {
      isDown: false,
      button: 0,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
      dirX: 0,
      dirY: 0,
      lastClickTime: 0
    };
    this.mouseIndicatorEl = null;

    // Scene & Objects
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.clock = new THREE.Clock();
    this.levelZones = []; // list of { z, questionIndex, gateMesh, portals: [] }
    this.trampolines = [];
    this.spinners = [];
    this.collectibleStars = [];
    this.particleSystems = [];

    // Egg customization
    this.eggConfig = options.eggConfig || {
      color: '#FFD23F', // signature yellow
      hat: 'propeller', // propeller, crown, glasses, bunny, eggshell
      face: 'happy'
    };

    this.init();
  }

  init() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    // 1. Scene
    this.scene = new THREE.Scene();
    this.setupThemeSky(this.survey ? this.survey.theme : 'candy');

    // 2. Camera
    this.camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 1000);
    this.camera.position.set(0, 8, 14);

    // 3. Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.innerHTML = '';
    this.container.appendChild(this.renderer.domElement);
    this.createMouseIndicator();

    // 4. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfffaed, 0.9);
    dirLight.position.set(20, 40, 20);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 150;
    const d = 30;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    this.scene.add(dirLight);

    const hemiLight = new THREE.HemisphereLight(0xffe6e6, 0x66ccff, 0.5);
    this.scene.add(hemiLight);

    // 5. Build Track based on survey questions
    this.buildWorldAndTrack();

    // 6. Build 3D Eggboy Player
    this.createEggboyPlayer();

    // 7. Setup Event Listeners
    this.setupInputs();

    // 8. Handle Window Resize
    this.onResize = () => {
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      if (this.camera && this.renderer && w > 0 && h > 0) {
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
      }
    };
    window.addEventListener('resize', this.onResize);

    // 9. Start Game Loop
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  setupThemeSky(theme) {
    let topColor, bottomColor;
    if (theme === 'cyber') {
      topColor = 0x1a0b3b;
      bottomColor = 0x3d1a78;
    } else if (theme === 'sky') {
      topColor = 0x68d8d6;
      bottomColor = 0x07b1ca;
    } else if (theme === 'sunset') {
      topColor = 0xff758c;
      bottomColor = 0xff7eb3;
    } else {
      // Candy (default Egg Party vibrant candy look)
      topColor = 0x70d6ff;
      bottomColor = 0xffd6ff;
    }

    this.scene.background = new THREE.Color(topColor);
    this.scene.fog = new THREE.FogExp2(topColor, 0.007);

    // Floating fluffy cartoon clouds
    for (let i = 0; i < 25; i++) {
      const cloud = this.createCartoonCloud();
      cloud.position.set(
        (Math.random() - 0.5) * 120,
        15 + Math.random() * 25,
        -Math.random() * 250 + 20
      );
      this.scene.add(cloud);
    }
  }

  createCartoonCloud() {
    const group = new THREE.Group();
    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.88 });
    const count = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(2 + Math.random() * 2, 8, 8), cloudMat);
      puff.position.set(i * 1.8 - (count * 0.9), Math.sin(i * 0.8) * 0.8, (Math.random() - 0.5) * 1.5);
      group.add(puff);
    }
    return group;
  }

  /**
   * Builds the Parkour Track (增加跑道长度，兼顾畅爽奔跑与关卡节奏)
   */
  buildWorldAndTrack() {
    const qCount = Math.max(1, this.questions.length);
    const segmentLength = 36; // 跑道长度由22米适度增加至36米，提供更充裕的奔跑与收集钻石体验！

    // Track colors (Macaron playful palette)
    const trackColors = [0xFF9AA2, 0xFFB7B2, 0xFFDAC1, 0xE2F0CB, 0xB5EAD7, 0xC7CEEA];

    let currentZ = 0;

    // --- Starting Platform ---
    const startPlatform = this.createTrackPlatform(12, 16, 0xFFD23F, 0);
    startPlatform.position.set(0, 0, 4);
    this.scene.add(startPlatform);

    // Start Banner / Arch
    let startText = '🐣 蛋仔出发站 🏁';
    if (window.i18n) {
      const l = window.i18n.getLanguage();
      if (l === 'en') startText = '🐣 Eggboy Start 🏁';
      else if (l === 'ja') startText = '🐣 スタートゲート 🏁';
      else if (l === 'zh-TW') startText = '🐣 蛋仔出發站 🏁';
    }
    const startArch = this.createGateArch(startText, 0xFF5376);
    startArch.position.set(0, 0, 3);
    this.scene.add(startArch);

    currentZ = -4;

    // --- Generate Each Question Level Segment ---
    for (let i = 0; i < qCount; i++) {
      const q = this.questions[i];
      const color = trackColors[i % trackColors.length];
      const levelZStart = currentZ;

      // 1. Running Track
      const track = this.createTrackPlatform(11, segmentLength, color, i);
      track.position.set(0, 0, levelZStart - segmentLength / 2);
      this.scene.add(track);

      // 2. Obstacles (在跑道中段配置趣味障碍，轻松通过)
      const obstacleZ = levelZStart - 14;
      if (q.obstacleType === 'trampoline' || i % 3 === 0) {
        // Trampoline (弹簧蹦床，踩中直接高空飞跃)
        const tramp = this.createTrampoline();
        tramp.position.set(0, 0.4, obstacleZ);
        this.scene.add(tramp);
        this.trampolines.push({ z: obstacleZ, x: 0, mesh: tramp });
      } else if (q.obstacleType === 'spinner' || i % 3 === 1) {
        // Spinning lollipop / candy windmill (高悬空风车，轻松跑过不卡人)
        const spinner = this.createSpinnerObstacle();
        spinner.position.set(0, 2.6, obstacleZ);
        this.scene.add(spinner);
        this.spinners.push(spinner);
      }

      // Add floating diamonds along track (放置在地面蛋仔腰部高度0.8m，跑过去直接触碰吸收，无需跳跃)
      const diamondZOffsets = [5, 11, 18, 23];
      const diamondXPositions = [-1.5, 1.5, -1.2, 1.2];
      diamondZOffsets.forEach((offsetZ, sIdx) => {
        const star = this.createStarMesh();
        const starZ = levelZStart - offsetZ;
        const starX = diamondXPositions[sIdx % diamondXPositions.length];
        star.position.set(starX, 0.8, starZ);
        this.scene.add(star);
        this.collectibleStars.push({ mesh: star, collected: false, baseY: 0.8 });
      });

      // 3. Question Gate Zone (第 i 关 答题冲关门)
      const gateZ = levelZStart - 28;
      const gate = this.createQuestionGate(i + 1, q);
      gate.position.set(0, 0, gateZ);
      this.scene.add(gate);

      // Answer Portals for choice questions (Door A, Door B, etc.)
      const portals = [];
      if (q.type === 'single' || q.type === 'multiple') {
        const opts = q.options || [];
        const optCount = Math.min(opts.length, 4);
        const spacing = 2.4;
        const startX = -((optCount - 1) * spacing) / 2;

        opts.slice(0, 4).forEach((opt, optIdx) => {
          const letter = String.fromCharCode(65 + optIdx); // A, B, C, D
          const portalX = startX + optIdx * spacing;
          const portalMesh = this.createChoicePortal(letter, opt, optIdx);
          portalMesh.position.set(portalX, 0, gateZ - 2.5);
          this.scene.add(portalMesh);
          portals.push({ optionIndex: optIdx, mesh: portalMesh, x: portalX, z: gateZ - 2.5 });
        });
      }

      this.levelZones.push({
        levelIndex: i,
        question: q,
        gateZ: gateZ,
        gateMesh: gate,
        portals: portals,
        passed: false
      });

      // Rainbow bridge connecting directly to next segment
      const bridge = this.createRainbowBridge();
      bridge.position.set(0, 0, gateZ - 5);
      this.scene.add(bridge);

      currentZ = gateZ - 9;
    }

    // --- Victory Zone at Track End ---
    const victoryZ = currentZ - 8;
    const victoryPlatform = this.createVictoryPodium();
    victoryPlatform.position.set(0, 0, victoryZ);
    this.scene.add(victoryPlatform);

    this.victoryZoneZ = victoryZ;
  }

  createTrackPlatform(width, length, colorHex, index) {
    const group = new THREE.Group();

    // Main surface
    const geo = new THREE.BoxGeometry(width, 1.2, length);
    const mat = new THREE.MeshStandardMaterial({
      color: colorHex,
      roughness: 0.4,
      metalness: 0.1
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = -0.6;
    mesh.receiveShadow = true;
    group.add(mesh);

    // Decorative side rainbow borders
    const borderMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF });
    const leftBorder = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, length), borderMat);
    leftBorder.position.set(-width / 2 + 0.25, 0.1, 0);
    group.add(leftBorder);

    const rightBorder = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, length), borderMat);
    rightBorder.position.set(width / 2 - 0.25, 0.1, 0);
    group.add(rightBorder);

    // Floating speed boost arrows on floor
    const arrowCount = Math.floor(length / 10);
    for (let i = 0; i < arrowCount; i++) {
      const arrowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 });
      const arrowGeo = new THREE.ConeGeometry(0.8, 1.4, 3);
      const arrow = new THREE.Mesh(arrowGeo, arrowMat);
      arrow.rotation.x = -Math.PI / 2;
      arrow.rotation.z = Math.PI;
      arrow.position.set(0, 0.02, -length / 2 + 5 + i * 10);
      group.add(arrow);
    }

    return group;
  }

  createGateArch(titleText, colorHex) {
    const group = new THREE.Group();

    // Pillars
    const pillarMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.3 });
    const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 7, 16), pillarMat);
    p1.position.set(-4.5, 3.5, 0);
    p1.castShadow = true;
    group.add(p1);

    const p2 = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 7, 16), pillarMat);
    p2.position.set(4.5, 3.5, 0);
    p2.castShadow = true;
    group.add(p2);

    // Top Beam
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 9.8, 16), pillarMat);
    beam.rotation.z = Math.PI / 2;
    beam.position.set(0, 7, 0);
    group.add(beam);

    // Floating Balloon Orbs on top
    const orbColors = [0xFF5376, 0xFFD23F, 0x00E5FF, 0x9B51E0];
    orbColors.forEach((col, idx) => {
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.65, 16, 16), new THREE.MeshStandardMaterial({ color: col }));
      orb.position.set(-3 + idx * 2, 7.8, 0);
      group.add(orb);
    });

    return group;
  }

  createQuestionGate(levelNum, question) {
    const group = new THREE.Group();

    // Colorful Gate Frame
    const frameColor = levelNum % 2 === 0 ? 0x9B51E0 : 0xFF5376;
    const arch = this.createGateArch(`第 ${levelNum} 关`, frameColor);
    group.add(arch);

    // Giant Question Mark / Level Sign in center
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 512;
    signCanvas.height = 256;
    const ctx = signCanvas.getContext('2d');

    // Draw cartoon level badge
    ctx.fillStyle = '#FFFFFF';
    ctx.roundRect(10, 10, 492, 236, 40);
    ctx.fill();
    ctx.lineWidth = 14;
    ctx.strokeStyle = frameColor === 0x9B51E0 ? '#9B51E0' : '#FF5376';
    ctx.stroke();

    ctx.fillStyle = '#2D3748';
    ctx.font = 'bold 54px sans-serif';
    ctx.textAlign = 'center';
    const levelText = window.i18n ? window.i18n.t('game.levelBadge', { n: levelNum }) : `⭐ 第 ${levelNum} 关 ⭐`;
    ctx.fillText(levelText, 256, 90);

    ctx.fillStyle = '#FF5376';
    ctx.font = 'bold 36px sans-serif';
    let typeLabel = '【单选题冲关】';
    if (question.type === 'single') {
      typeLabel = window.i18n ? window.i18n.t('game.typeSingleBadge') : '【单选题冲关】';
    } else if (question.type === 'multiple') {
      typeLabel = window.i18n ? window.i18n.t('game.typeMultipleBadge') : '【多选题冲关】';
    } else {
      typeLabel = window.i18n ? window.i18n.t('game.typeVoiceBadge') : '【灵感发声站】';
    }
    ctx.fillText(typeLabel, 256, 160);

    const texture = new THREE.CanvasTexture(signCanvas);
    const signMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(5, 2.5),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true })
    );
    signMesh.position.set(0, 5, 0);
    group.add(signMesh);

    return group;
  }

  createChoicePortal(letter, text, idx) {
    const group = new THREE.Group();
    const colors = [0xFF5376, 0xFFD23F, 0x00E5FF, 0x00E676];
    const color = colors[idx % colors.length];

    // Glowing base ring
    const ringGeo = new THREE.TorusGeometry(1.0, 0.15, 12, 24);
    const ringMat = new THREE.MeshStandardMaterial({ color: color, emissive: color, emissiveIntensity: 0.5 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.15;
    group.add(ring);

    // Floating Letter Badge
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(64, 64, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#FF5376';
    ctx.stroke();

    ctx.fillStyle = '#2D3748';
    ctx.font = 'bold 72px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, 64, 66);

    const tex = new THREE.CanvasTexture(canvas);
    const badge = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    badge.position.set(0, 1.8, 0);
    group.add(badge);

    return group;
  }

  createTrampoline() {
    const group = new THREE.Group();

    // Base Rim (加大弹跳面积，更容易踩中弹射)
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xFF5376, roughness: 0.2 });
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.2, 0.3, 24), rimMat);
    rim.position.y = 0.15;
    group.add(rim);

    // Bouncy Center Mat (Spring Pad)
    const matMat = new THREE.MeshStandardMaterial({ color: 0xFFD23F, emissive: 0xFFD23F, emissiveIntensity: 0.5 });
    const bouncyMat = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.35, 24), matMat);
    bouncyMat.position.y = 0.18;
    group.add(bouncyMat);

    // Spring graphic
    const star = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.38, 5), new THREE.MeshBasicMaterial({ color: 0xFFFFFF }));
    star.position.y = 0.2;
    group.add(star);

    return group;
  }

  createSpinnerObstacle() {
    const group = new THREE.Group();

    // Central Pillar
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x9B51E0 });
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 5, 16), pillarMat);
    pillar.position.y = 0.5;
    group.add(pillar);

    // Rotating Horizontal Arms (抬高风车站位至2.4米，蛋仔可畅快跑过不卡阻)
    const rotor = new THREE.Group();
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0xFFD23F });
    const arm1 = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.35, 0.35), bladeMat);
    rotor.add(arm1);

    // Candy ends
    const candyMat1 = new THREE.MeshStandardMaterial({ color: 0xFF5376 });
    const c1 = new THREE.Mesh(new THREE.SphereGeometry(0.65, 16, 16), candyMat1);
    c1.position.x = 2.5;
    rotor.add(c1);

    const c2 = new THREE.Mesh(new THREE.SphereGeometry(0.65, 16, 16), candyMat1);
    c2.position.x = -2.5;
    rotor.add(c2);

    rotor.position.y = 2.4;
    group.add(rotor);
    group.rotor = rotor;

    return group;
  }

  createStarMesh() {
    const group = new THREE.Group();

    // Outer diamond octahedron crystal (立体八面体钻石水晶)
    const gemGeo = new THREE.OctahedronGeometry(0.5, 0);
    const gemMat = new THREE.MeshStandardMaterial({
      color: 0x00F0FF, // 耀眼冰蓝钻石
      emissive: 0x00B4D8,
      emissiveIntensity: 0.8,
      roughness: 0.1,
      metalness: 0.8
    });
    const gem = new THREE.Mesh(gemGeo, gemMat);
    gem.castShadow = true;
    group.add(gem);

    // Inner bright sparkle core
    const innerGeo = new THREE.OctahedronGeometry(0.24, 0);
    const innerMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
    const inner = new THREE.Mesh(innerGeo, innerMat);
    group.add(inner);

    return group;
  }

  createRainbowBridge() {
    const group = new THREE.Group();
    const colors = [0xFF5376, 0xFFD23F, 0x00E676, 0x00E5FF, 0x9B51E0];
    const width = 8;
    const bandWidth = width / colors.length;

    colors.forEach((col, idx) => {
      const geo = new THREE.BoxGeometry(bandWidth, 0.6, 10);
      const mat = new THREE.MeshStandardMaterial({ color: col });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(-width / 2 + bandWidth / 2 + idx * bandWidth, -0.3, 0);
      group.add(mesh);
    });

    return group;
  }

  createVictoryPodium() {
    const group = new THREE.Group();

    // 1st Place Podium Base
    const podiumMat = new THREE.MeshStandardMaterial({ color: 0xFFD23F, roughness: 0.2, metalness: 0.4 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(5, 5.5, 2, 32), podiumMat);
    base.position.y = 0;
    base.receiveShadow = true;
    group.add(base);

    // Golden Trophy on top
    const trophyMat = new THREE.MeshStandardMaterial({ color: 0xFFC700, metalness: 0.8, roughness: 0.2 });
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 0.6, 1.8, 16), trophyMat);
    cup.position.y = 2.4;
    group.add(cup);

    const cupStem = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.8, 16), trophyMat);
    cupStem.position.y = 1.3;
    group.add(cupStem);

    // Number '1' banner
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.roundRect(20, 20, 216, 216, 30);
    ctx.fill();
    ctx.fillStyle = '#FF5376';
    ctx.font = 'bold 120px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🏆', 128, 128);

    const tex = new THREE.CanvasTexture(canvas);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 2.5), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    banner.position.set(0, 4.2, 0);
    group.add(banner);

    return group;
  }

  /**
   * Builds the 3D Eggboy Character (蛋仔)
   */
  createEggboyPlayer() {
    this.player = new THREE.Group();

    const eggColor = this.eggConfig.color || '#FFD23F';

    // 1. Egg Body (Round, bouncy spherical capsule)
    const bodyGeo = new THREE.SphereGeometry(0.85, 32, 32);
    // Scale slightly taller than wide to form the signature cute egg shape
    bodyGeo.scale(1.0, 1.15, 0.95);

    const bodyMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(eggColor),
      roughness: 0.35,
      metalness: 0.1
    });

    this.eggBody = new THREE.Mesh(bodyGeo, bodyMat);
    this.eggBody.position.y = 1.0;
    this.eggBody.castShadow = true;
    this.player.add(this.eggBody);

    // 2. Eyes (Big cute cartoon eyes with white specular highlight reflection)
    const eyeWhiteGeo = new THREE.SphereGeometry(0.18, 16, 16);
    const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });

    const leftEyeWhite = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
    leftEyeWhite.position.set(-0.28, 1.25, 0.72);
    this.player.add(leftEyeWhite);

    const rightEyeWhite = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
    rightEyeWhite.position.set(0.28, 1.25, 0.72);
    this.player.add(rightEyeWhite);

    // Pupils
    const pupilGeo = new THREE.SphereGeometry(0.11, 16, 16);
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x111111 });

    const leftPupil = new THREE.Mesh(pupilGeo, pupilMat);
    leftPupil.position.set(-0.28, 1.25, 0.82);
    this.player.add(leftPupil);

    const rightPupil = new THREE.Mesh(pupilGeo, pupilMat);
    rightPupil.position.set(0.28, 1.25, 0.82);
    this.player.add(rightPupil);

    // Sparkle Highlights
    const sparkGeo = new THREE.SphereGeometry(0.045, 8, 8);
    const sparkMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
    const leftSpark = new THREE.Mesh(sparkGeo, sparkMat);
    leftSpark.position.set(-0.25, 1.3, 0.88);
    this.player.add(leftSpark);
    const rightSpark = new THREE.Mesh(sparkGeo, sparkMat);
    rightSpark.position.set(0.31, 1.3, 0.88);
    this.player.add(rightSpark);

    // 3. Pink Blush Cheeks
    const blushGeo = new THREE.SphereGeometry(0.12, 12, 12);
    const blushMat = new THREE.MeshBasicMaterial({ color: 0xFF708F });

    const leftBlush = new THREE.Mesh(blushGeo, blushMat);
    leftBlush.scale.set(1.2, 0.6, 0.5);
    leftBlush.position.set(-0.46, 1.05, 0.65);
    this.player.add(leftBlush);

    const rightBlush = new THREE.Mesh(blushGeo, blushMat);
    rightBlush.scale.set(1.2, 0.6, 0.5);
    rightBlush.position.set(0.46, 1.05, 0.65);
    this.player.add(rightBlush);

    // 4. Smiley Mouth
    const mouthGeo = new THREE.TorusGeometry(0.12, 0.03, 8, 16, Math.PI);
    const mouthMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
    const mouth = new THREE.Mesh(mouthGeo, mouthMat);
    mouth.rotation.x = Math.PI;
    mouth.position.set(0, 1.06, 0.82);
    this.player.add(mouth);

    // 5. Cute Floating Hands
    const handGeo = new THREE.SphereGeometry(0.18, 12, 12);
    const handMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(eggColor) });

    this.leftHand = new THREE.Mesh(handGeo, handMat);
    this.leftHand.position.set(-0.95, 1.0, 0.1);
    this.player.add(this.leftHand);

    this.rightHand = new THREE.Mesh(handGeo, handMat);
    this.rightHand.position.set(0.95, 1.0, 0.1);
    this.player.add(this.rightHand);

    // 6. Cute Little Feet
    const footGeo = new THREE.SphereGeometry(0.2, 12, 12);
    footGeo.scale(1.0, 0.6, 1.3);
    const footMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF });

    this.leftFoot = new THREE.Mesh(footGeo, footMat);
    this.leftFoot.position.set(-0.35, 0.12, 0);
    this.player.add(this.leftFoot);

    this.rightFoot = new THREE.Mesh(footGeo, footMat);
    this.rightFoot.position.set(0.35, 0.12, 0);
    this.player.add(this.rightFoot);

    // 7. Hat / Accessory
    this.attachAccessory(this.eggConfig.hat || 'propeller');

    // Start Position & forward orientation towards track
    this.player.position.set(0, 0, 0);
    this.player.rotation.y = Math.PI;
    this.scene.add(this.player);
  }

  attachAccessory(hatType) {
    if (this.hatMesh) {
      this.player.remove(this.hatMesh);
      this.hatMesh = null;
    }
    this.propellerMesh = null;

    const group = new THREE.Group();

    if (hatType === 'propeller') {
      // Spinning bamboo copter hat
      const baseMat = new THREE.MeshStandardMaterial({ color: 0x00E5FF });
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.25, 16), baseMat);
      cap.position.y = 1.95;
      group.add(cap);

      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 8), new THREE.MeshBasicMaterial({ color: 0xFFFFFF }));
      stem.position.y = 2.2;
      group.add(stem);

      // Spinning rotor blades
      const propGroup = new THREE.Group();
      const bladeMat = new THREE.MeshStandardMaterial({ color: 0xFF5376 });
      const b1 = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.04, 0.2), bladeMat);
      propGroup.add(b1);
      propGroup.position.y = 2.4;
      group.add(propGroup);

      this.propellerMesh = propGroup;
    } else if (hatType === 'crown') {
      // Shiny Party Crown
      const crownMat = new THREE.MeshStandardMaterial({ color: 0xFFD700, metalness: 0.7, roughness: 0.2 });
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.35, 0.4, 6), crownMat);
      crown.position.y = 2.05;
      group.add(crown);
    } else if (hatType === 'bunny') {
      // Cute Pink Bunny Ears
      const earMat = new THREE.MeshStandardMaterial({ color: 0xFF9AA2 });
      const earGeo = new THREE.CylinderGeometry(0.08, 0.15, 0.7, 8);

      const e1 = new THREE.Mesh(earGeo, earMat);
      e1.position.set(-0.3, 2.25, 0);
      e1.rotation.z = 0.2;
      group.add(e1);

      const e2 = new THREE.Mesh(earGeo, earMat);
      e2.position.set(0.3, 2.25, 0);
      e2.rotation.z = -0.2;
      group.add(e2);
    } else if (hatType === 'glasses') {
      // Cool Pixel Sunglasses
      const glassMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
      const g = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.25, 0.1), glassMat);
      g.position.set(0, 1.25, 0.84);
      group.add(g);
    }

    this.hatMesh = group;
    this.player.add(this.hatMesh);
  }

  setEggCustomization(color, hat) {
    if (color && this.eggBody) {
      this.eggConfig.color = color;
      this.eggBody.material.color.set(color);
      if (this.leftHand) this.leftHand.material.color.set(color);
      if (this.rightHand) this.rightHand.material.color.set(color);
    }
    if (hat) {
      this.eggConfig.hat = hat;
      this.attachAccessory(hat);
    }
  }

  createMouseIndicator() {
    this.mouseIndicatorEl = document.createElement('div');
    this.mouseIndicatorEl.className = 'mouse-steer-indicator';
    this.mouseIndicatorEl.innerHTML = '🐣';
    this.container.appendChild(this.mouseIndicatorEl);
  }

  showMouseIndicator(x, y) {
    if (this.mouseIndicatorEl) {
      const rect = this.container.getBoundingClientRect();
      this.mouseIndicatorEl.style.left = `${x - rect.left}px`;
      this.mouseIndicatorEl.style.top = `${y - rect.top}px`;
      this.mouseIndicatorEl.classList.add('active');
    }
  }

  updateMouseIndicator(x, y) {
    if (this.mouseIndicatorEl) {
      const rect = this.container.getBoundingClientRect();
      this.mouseIndicatorEl.style.left = `${x - rect.left}px`;
      this.mouseIndicatorEl.style.top = `${y - rect.top}px`;
    }
  }

  hideMouseIndicator() {
    if (this.mouseIndicatorEl) {
      this.mouseIndicatorEl.classList.remove('active');
    }
  }

  updateMouseDirection(clientX, clientY) {
    const dx = clientX - this.mouseControl.startX;
    const dy = clientY - this.mouseControl.startY;
    const dist = Math.hypot(dx, dy);

    // If held closely at click point:
    if (dist < 10) {
      const screenH = window.innerHeight;
      if (clientY < screenH * 0.75) {
        // Forward click in upper screen area
        this.mouseControl.dirX = 0;
        this.mouseControl.dirY = -0.9;
      } else {
        this.mouseControl.dirX = 0;
        this.mouseControl.dirY = 0;
      }
    } else {
      const maxRange = 70;
      this.mouseControl.dirX = Math.max(-1, Math.min(1, dx / maxRange));
      this.mouseControl.dirY = Math.max(-1, Math.min(1, dy / maxRange));
    }
  }

  setupInputs() {
    this.onKeyDown = (e) => {
      // Don't intercept inputs if user is typing in an input field / textarea!
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.keys.forward = true;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.keys.backward = true;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.keys.left = true;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.keys.right = true;
          break;
        case 'Space':
          this.jump();
          e.preventDefault();
          break;
      }
    };

    this.onKeyUp = (e) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.keys.forward = false;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.keys.backward = false;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.keys.left = false;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.keys.right = false;
          break;
      }
    };

    // --- Mouse Controls for PC ---
    this.onMouseDown = (e) => {
      if (this.isAnswering || this.isFinished) return;
      if (e.target !== this.renderer.domElement) return;

      const now = performance.now();

      // Right Mouse Button (button 2) -> Jump!
      if (e.button === 2) {
        e.preventDefault();
        this.jump();
        return;
      }

      // Middle Mouse Button (button 1) -> Jump!
      if (e.button === 1) {
        e.preventDefault();
        this.jump();
        return;
      }

      // Left Mouse Button (button 0) -> Run & Steer
      if (e.button === 0) {
        // Double-click triggers jump
        if (now - this.mouseControl.lastClickTime < 280) {
          this.jump();
        }
        this.mouseControl.lastClickTime = now;

        this.mouseControl.isDown = true;
        this.mouseControl.button = e.button;
        this.mouseControl.startX = e.clientX;
        this.mouseControl.startY = e.clientY;
        this.mouseControl.currentX = e.clientX;
        this.mouseControl.currentY = e.clientY;

        this.updateMouseDirection(e.clientX, e.clientY);
        this.showMouseIndicator(e.clientX, e.clientY);
      }
    };

    this.onMouseMove = (e) => {
      if (!this.mouseControl.isDown) return;
      this.mouseControl.currentX = e.clientX;
      this.mouseControl.currentY = e.clientY;
      this.updateMouseDirection(e.clientX, e.clientY);
      this.updateMouseIndicator(e.clientX, e.clientY);
    };

    this.onMouseUp = (e) => {
      if (this.mouseControl.isDown) {
        this.mouseControl.isDown = false;
        this.mouseControl.dirX = 0;
        this.mouseControl.dirY = 0;
        this.hideMouseIndicator();
      }
    };

    this.onContextMenu = (e) => {
      if (e.target === this.renderer.domElement) {
        e.preventDefault();
      }
    };

    this.onWheel = (e) => {
      if (e.target === this.renderer.domElement) {
        if (Math.abs(e.deltaY) > 8) {
          this.jump();
          e.preventDefault();
        }
      }
    };

    // Direct Touch Events on 3D Canvas
    this.onTouchStart = (e) => {
      if (this.isAnswering || this.isFinished) return;
      if (e.touches.length > 0) {
        const touch = e.touches[0];
        const now = performance.now();
        // Double tap on canvas triggers jump
        if (now - this.mouseControl.lastClickTime < 280) {
          this.jump();
        }
        this.mouseControl.lastClickTime = now;
        this.mouseControl.isDown = true;
        this.mouseControl.startX = touch.clientX;
        this.mouseControl.startY = touch.clientY;
        this.mouseControl.currentX = touch.clientX;
        this.mouseControl.currentY = touch.clientY;
        this.updateMouseDirection(touch.clientX, touch.clientY);
        this.showMouseIndicator(touch.clientX, touch.clientY);
      }
    };

    this.onTouchMove = (e) => {
      if (!this.mouseControl.isDown || e.touches.length === 0) return;
      const touch = e.touches[0];
      this.mouseControl.currentX = touch.clientX;
      this.mouseControl.currentY = touch.clientY;
      this.updateMouseDirection(touch.clientX, touch.clientY);
      this.updateMouseIndicator(touch.clientX, touch.clientY);
    };

    this.onTouchEnd = () => {
      if (this.mouseControl.isDown) {
        this.mouseControl.isDown = false;
        this.mouseControl.dirX = 0;
        this.mouseControl.dirY = 0;
        this.hideMouseIndicator();
      }
    };

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);

    this.renderer.domElement.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
    this.renderer.domElement.addEventListener('contextmenu', this.onContextMenu);
    this.renderer.domElement.addEventListener('wheel', this.onWheel, { passive: false });

    this.renderer.domElement.addEventListener('touchstart', this.onTouchStart, { passive: true });
    this.renderer.domElement.addEventListener('touchmove', this.onTouchMove, { passive: true });
    this.renderer.domElement.addEventListener('touchend', this.onTouchEnd);
    this.renderer.domElement.addEventListener('touchcancel', this.onTouchEnd);
  }

  setJoystick(x, y) {
    this.joystickDir.x = x;
    this.joystickDir.y = y;
  }

  jump() {
    if (this.isGrounded) {
      this.playerVelocity.y = this.jumpForce;
      this.isGrounded = false;
      if (window.soundEngine) window.soundEngine.playJump();
    }
  }

  /**
   * Main Animation & Physics Loop
   */
  animate() {
    if (!this.renderer) return;
    requestAnimationFrame(this.animate);

    const delta = Math.min(this.clock.getDelta(), 0.1);
    const elapsed = this.clock.getElapsedTime();

    // 1. Rotate accessories & scenery
    if (this.propellerMesh) {
      this.propellerMesh.rotation.y += delta * 20;
    }

    // Spinners
    this.spinners.forEach((s) => {
      if (s.rotor) s.rotor.rotation.y += delta * 2.2;
    });

    // Rotating Stars / Diamonds (跑过去直接吸收获得，无需跳跃)
    this.collectibleStars.forEach((starObj) => {
      if (!starObj.collected) {
        starObj.mesh.rotation.y += delta * 2.8;
        starObj.mesh.rotation.x += delta * 1.2;
        const baseY = starObj.baseY !== undefined ? starObj.baseY : 0.8;
        starObj.mesh.position.y = baseY + Math.sin(elapsed * 4 + starObj.mesh.position.z) * 0.12;

        // Check pickup by player (跑过去水平贴近即可自动吸收，无需跳跃)
        if (this.player) {
          const dx = this.player.position.x - starObj.mesh.position.x;
          const dz = this.player.position.z - starObj.mesh.position.z;
          const horizDist = Math.hypot(dx, dz);
          const dy = Math.abs(this.player.position.y - starObj.mesh.position.y);

          // 只要跑过钻石旁边（水平距离 < 1.8米，垂直高度在地面至跳跃范围内），直接吸收获得！
          if (horizDist < 1.8 && dy < 3.2) {
            starObj.collected = true;
            this.scene.remove(starObj.mesh);
            this.score += 100;
            if (window.soundEngine) window.soundEngine.playCoin();
            this.onCollectStar(this.score);
          }
        }
      }
    });

    // 2. Player Movement Physics
    if (this.player) {
      // Determine direction from keys or joystick
      let moveX = 0;
      let moveZ = 0;

      if (!this.isAnswering && !this.isFinished) {
        if (this.keys.forward) moveZ -= 1;
        if (this.keys.backward) moveZ += 1;
        if (this.keys.left) moveX -= 1;
        if (this.keys.right) moveX += 1;

        if (this.joystickDir.x !== 0 || this.joystickDir.y !== 0) {
          moveX = this.joystickDir.x;
          moveZ = this.joystickDir.y;
        }

        // Mouse Drag / Steering Input
        if (this.mouseControl && this.mouseControl.isDown) {
          moveX = this.mouseControl.dirX;
          moveZ = this.mouseControl.dirY;
        }
      }

      const isMoving = Math.abs(moveX) > 0.05 || Math.abs(moveZ) > 0.05;

      if (isMoving) {
        const moveVec = new THREE.Vector2(moveX, moveZ).normalize();
        this.player.position.x += moveVec.x * this.speed * delta;
        this.player.position.z += moveVec.y * this.speed * delta;

        // Rotate character towards movement direction
        const targetAngle = Math.atan2(moveVec.x, moveVec.y) + Math.PI;
        this.player.rotation.y = THREE.MathUtils.lerp(this.player.rotation.y, targetAngle, delta * 12);

        // Procedural Running Animation (feet alternate, hands swing, wobbly roll)
        const walkCycle = Math.sin(elapsed * 18);
        if (this.leftFoot && this.rightFoot) {
          this.leftFoot.position.z = walkCycle * 0.22;
          this.leftFoot.position.y = 0.12 + Math.max(0, walkCycle * 0.15);
          this.rightFoot.position.z = -walkCycle * 0.22;
          this.rightFoot.position.y = 0.12 + Math.max(0, -walkCycle * 0.15);
        }
        if (this.leftHand && this.rightHand) {
          this.leftHand.position.z = -walkCycle * 0.25;
          this.rightHand.position.z = walkCycle * 0.25;
        }

        // Bouncy squash & stretch running
        if (this.eggBody) {
          this.eggBody.scale.y = 1.15 + Math.sin(elapsed * 24) * 0.06;
          this.eggBody.rotation.z = Math.sin(elapsed * 12) * 0.08;
        }
      } else {
        // Idle breathing animation
        if (this.eggBody) {
          this.eggBody.scale.y = 1.15 + Math.sin(elapsed * 4) * 0.04;
          this.eggBody.rotation.z = 0;
        }
        if (this.leftFoot && this.rightFoot) {
          this.leftFoot.position.set(-0.35, 0.12, 0);
          this.rightFoot.position.set(0.35, 0.12, 0);
        }
      }

      // Constrain player to track width (-5 to 5)
      this.player.position.x = Math.max(-4.2, Math.min(4.2, this.player.position.x));

      // Gravity & Jumping
      this.playerVelocity.y -= this.gravity * delta;
      this.player.position.y += this.playerVelocity.y * delta;

      if (this.player.position.y <= 0) {
        this.player.position.y = 0;
        this.playerVelocity.y = 0;
        this.isGrounded = true;
      }

      // Trampoline Bouncing Check (轻松触发大蹦床，直飞冲关门)
      this.trampolines.forEach((t) => {
        if (Math.abs(this.player.position.z - t.z) < 2.2 && Math.abs(this.player.position.x - t.x) < 2.5 && this.isGrounded) {
          this.playerVelocity.y = 22; // 强力弹射直飞冲关门！
          this.isGrounded = false;
          if (window.soundEngine) window.soundEngine.playBounce();
        }
      });

      // Check Level Gates (更宽敞灵敏的答题门感应范围，靠近即开，轻松爽快通关)
      if (!this.isAnswering && !this.isFinished) {
        const nextLevel = this.levelZones[this.currentLevelIndex];
        if (nextLevel && !nextLevel.passed) {
          const distToGate = this.player.position.z - nextLevel.gateZ;
          if (distToGate <= 4.0 && distToGate >= -8.0) {
            // Player reached the question gate!
            this.isAnswering = true;
            if (window.soundEngine) window.soundEngine.playPop();
            this.onLevelReach(this.currentLevelIndex, nextLevel.question);
          }
        }

        // Check Victory Podium
        if (this.currentLevelIndex >= this.levelZones.length && !this.isFinished) {
          if (this.player.position.z <= this.victoryZoneZ + 3) {
            this.triggerVictoryCelebration();
          }
        }
      }

      // Smooth Camera Follow
      const targetCamZ = this.player.position.z + 10;
      const targetCamX = this.player.position.x * 0.4;
      const targetCamY = 5 + Math.max(0, this.player.position.y * 0.4);

      this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, targetCamX, delta * 8);
      this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, targetCamY, delta * 8);
      this.camera.position.z = THREE.MathUtils.lerp(this.camera.position.z, targetCamZ, delta * 8);

      const lookTarget = new THREE.Vector3(this.player.position.x * 0.3, 2, this.player.position.z - 4);
      this.camera.lookAt(lookTarget);
    }

    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Called when player answers the current level's question successfully
   */
  passCurrentLevel() {
    if (this.currentLevelIndex < this.levelZones.length) {
      const level = this.levelZones[this.currentLevelIndex];
      level.passed = true;
      const isLastLevel = (this.currentLevelIndex === this.levelZones.length - 1);

      if (window.soundEngine) window.soundEngine.playLevelClear();

      if (isLastLevel) {
        // 最后一关回答完成后，直接飞跃至终点冠军领奖台并结束游戏！
        this.currentLevelIndex++;
        this.isAnswering = true; // 锁定操作进入胜利过场

        const targetZ = this.victoryZoneZ;
        this.grandVictoryCatapult(targetZ, () => {
          this.triggerVictoryCelebration();
        });
      } else {
        // 中间普通关卡：向前加速冲过该关卡门直接来到下一关跑道
        const targetZ = level.gateZ - 10;
        this.boostCatapult(targetZ, () => {
          this.currentLevelIndex++;
          this.isAnswering = false;
        });
      }
    }
  }

  grandVictoryCatapult(targetZ, onComplete) {
    const startZ = this.player.position.z;
    const startX = this.player.position.x;
    const startTime = performance.now();
    const duration = 1400; // 1.4秒壮观的空中终点大冲刺

    const animateGrand = (now) => {
      const elapsed = now - startTime;
      const p = Math.min(1, elapsed / duration);
      // Smooth ease-in-out cubic
      const ease = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

      this.player.position.z = startZ + (targetZ - startZ) * ease;
      this.player.position.x = THREE.MathUtils.lerp(startX, 0, ease);
      // 高空抛物线华丽飞越并稳稳落在冠军台上
      this.player.position.y = Math.sin(p * Math.PI) * 7.5 + (1 - p) * 0 + p * 1.0;
      this.player.rotation.x = p * Math.PI * 4; // 双重前空翻
      this.player.rotation.y += 0.08;

      if (p < 1) {
        requestAnimationFrame(animateGrand);
      } else {
        this.player.position.set(0, 1.0, targetZ);
        this.player.rotation.x = 0;
        this.player.rotation.y = 0; // 面向镜头
        if (onComplete) onComplete();
      }
    };

    requestAnimationFrame(animateGrand);
  }

  boostCatapult(targetZ, onComplete) {
    const startZ = this.player.position.z;
    const startTime = performance.now();
    const duration = 900; // ms

    const animateBoost = (now) => {
      const elapsed = now - startTime;
      const p = Math.min(1, elapsed / duration);
      // Ease out cubic
      const ease = 1 - Math.pow(1 - p, 3);

      this.player.position.z = startZ + (targetZ - startZ) * ease;
      this.player.position.y = Math.sin(p * Math.PI) * 4.5; // arc jump!
      this.player.rotation.x = p * Math.PI * 2; // forward somersault!

      if (p < 1) {
        requestAnimationFrame(animateBoost);
      } else {
        this.player.position.y = 0;
        this.player.rotation.x = 0;
        if (onComplete) onComplete();
      }
    };

    requestAnimationFrame(animateBoost);
  }

  guideToVictory() {
    // Eggboy is at track end, ready to land on podium
  }

  triggerVictoryCelebration() {
    this.isFinished = true;
    if (window.soundEngine) window.soundEngine.playVictory();

    // Trigger canvas confetti if available
    if (window.confetti) {
      window.confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 }
      });
    }

    // Victory celebration spin
    let spin = 0;
    const celebrateSpin = () => {
      if (spin < Math.PI * 6) {
        this.player.rotation.y += 0.2;
        this.player.position.y = 1.0 + Math.abs(Math.sin(spin * 2)) * 1.5;
        spin += 0.2;
        requestAnimationFrame(celebrateSpin);
      } else {
        this.player.position.y = 1.0;
        this.onGameFinish(this.score);
      }
    };
    celebrateSpin();
  }

  destroy() {
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
    if (this.mouseIndicatorEl && this.mouseIndicatorEl.parentNode) {
      this.mouseIndicatorEl.parentNode.removeChild(this.mouseIndicatorEl);
    }
    if (this.renderer) {
      if (this.renderer.domElement) {
        this.renderer.domElement.removeEventListener('mousedown', this.onMouseDown);
        this.renderer.domElement.removeEventListener('contextmenu', this.onContextMenu);
        this.renderer.domElement.removeEventListener('wheel', this.onWheel);
        this.renderer.domElement.removeEventListener('touchstart', this.onTouchStart);
        this.renderer.domElement.removeEventListener('touchmove', this.onTouchMove);
        this.renderer.domElement.removeEventListener('touchend', this.onTouchEnd);
        this.renderer.domElement.removeEventListener('touchcancel', this.onTouchEnd);
      }
      this.renderer.dispose();
      if (this.renderer.domElement && this.renderer.domElement.parentNode) {
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      }
    }
  }
}
