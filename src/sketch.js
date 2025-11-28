// src/sketch.js

let canvas;
let gMain; // viewport principal (câmera de perseguição)
let gMini; // viewport mini-mapa (top-view)

const WIDTH = 1000;
const HEIGHT = 600;
const MINI_VIEW_SIZE = 260;

// FPS
let fps = 0;

// Shading / modos
let showWireframe = false;
let shadingMode = "phong"; // "flat" ou "phong"
let texturesEnabled = true; // textura da pista

// Mostrar ou não eixos de referência
let showAxes = false;

// Mostrar ou não o HUD (texto do canto esquerdo)
let showHUD = true;

// Tipo de pista atual: "bezier" ou "bspline"
let trackType = "bezier";

// Mostrar ou não os pontos de controle da pista (mini-mapa)
let showControlPoints = true;

// Edição de pontos de controle (editor de curva)
let selectedCtrlIndex = -1;
let selectedCtrlArray = null; // "bezier" ou "bspline"

// Pistas paramétricas (centro da pista no plano XZ) - 4 pontos
let trackCtrlBezier;
let trackCtrlBSpline;

// Geometria da pista
let roadHalfWidth = 15;
let trackSteps = 150;

// Carro: parâmetro ao longo da curva
let carT = 0;           // parâmetro [0,1)
let carSpeed = 0.00015; // delta t por ms
let carSpeedMin = 0;
let carSpeedMax = 0.0005;

// Carro: orientação suavizada
let carYaw = 0;          // ângulo global do carro/câmera (rad)
let carDir;              // vetor direção derivado de carYaw

// Checkpoints (ao longo da volta)
let checkpointTs = [0.0, 0.25, 0.5, 0.75];
let checkpointPassed = [];
let nextCheckpointIndex = -1;
let lapCount = 0;

// Câmera de perseguição
let camDistance = 120;
let camHeight = 60;
let camSideOffset = 0;

// Texturas
let asphaltTexture;

// ==============================
// Frustum culling (otimização)
// ==============================

let frustumCullingEnabled = true;
let cullRadius = 300;

// Objetos de cenário (postes)
let decorObjects = [];

// -----------------------------------
// preload: carrega texturas
// -----------------------------------
function preload() {
  asphaltTexture = loadImage(
    "assets/asphalt.jpg",
    () => console.log("Textura de asfalto carregada."),
    () => console.warn("Não foi possível carregar assets/asphalt.jpg; usando cor sólida.")
  );
}

function setup() {
  canvas = createCanvas(WIDTH, HEIGHT);
  canvas.parent(document.body);

  gMain = createGraphics(WIDTH / 2, HEIGHT, WEBGL);
  gMini = createGraphics(WIDTH / 2, HEIGHT, WEBGL);

  gMain.setAttributes("antialias", true);
  gMini.setAttributes("antialias", true);

  initTracks();
  initDecorObjects();

  checkpointPassed = new Array(checkpointTs.length).fill(false);
  carDir = createVector(0, 0, 1);
}

// ---------------------------------------------------
// Inicialização das pistas com 4 pontos de controle
// ---------------------------------------------------
function initTracks() {
  // Pista fechada: início e fim coincidem
  trackCtrlBezier = [
    createVector(-140, 0,   0),  // P0 = início/fim
    createVector(-60,  0, 160),  // P1
    createVector(120,  0, 160),  // P2
    createVector(-140, 0,   0)   // P3 = igual a P0
  ];

  trackCtrlBSpline = [
    createVector(-140, 0,   0),
    createVector(-60,  0, 160),
    createVector(120,  0, 160),
    createVector(-140, 0,   0)
  ];
}

// ---------------------------------------------------
// Objetos de cenário (postes) – 32 postes discretos
// ---------------------------------------------------
function initDecorObjects() {
  decorObjects = [];
  const count = 16;
  for (let i = 0; i < count; i++) {
    const t = i / count;
    const side = 1; // todos no lado externo
    const lateralOffset = roadHalfWidth * 3.0 * side;
    const height = 30 + (i % 4) * 5;
    decorObjects.push({ t, lateralOffset, height });
  }
}

function draw() {
  background(10);
  fps = 1000 / (deltaTime || 1);

  updateCarAndCheckpointsAndOrientation();

  renderMainViewport();
  renderMiniViewport();

  image(gMain, 0, 0, WIDTH / 2, HEIGHT);
  image(gMini, WIDTH / 2, 0, WIDTH / 2, HEIGHT);

  stroke(0);
  strokeWeight(2);
  line(WIDTH / 2, 0, WIDTH / 2, HEIGHT);

  if (showHUD) {
    drawHUD();
  }
}

/* ===================================
   Atualização do carro, voltas e CPs
   =================================== */

function updateCarAndCheckpointsAndOrientation() {
  const prevT = carT;
  const deltaParam = carSpeed * deltaTime;
  carT = wrap01(carT + deltaParam);

  // Detecta wrap (volta completa)
  if (carSpeed > 0 && carT < prevT - 1e-6) {
    lapCount++;
    checkpointPassed = checkpointPassed.map(() => false);
  }

  updateCheckpoints(prevT, carT);

  const targetForward = trackTangent(carT).normalize();
  const targetYaw = Math.atan2(targetForward.x, targetForward.z);
  carYaw = smoothAngle(carYaw, targetYaw, 0.18);
  carDir = createVector(Math.sin(carYaw), 0, Math.cos(carYaw));
}

function updateCheckpoints(prevT, newT) {
  for (let i = 0; i < checkpointTs.length; i++) {
    if (!checkpointPassed[i] && crossedParam(prevT, newT, checkpointTs[i])) {
      checkpointPassed[i] = true;
    }
  }

  nextCheckpointIndex = -1;
  let bestDelta = 2;
  for (let i = 0; i < checkpointTs.length; i++) {
    if (!checkpointPassed[i]) {
      let dt = checkpointTs[i] - carT;
      if (dt < 0) dt += 1.0;
      if (dt < bestDelta) {
        bestDelta = dt;
        nextCheckpointIndex = i;
      }
    }
  }
}

function crossedParam(prevT, newT, targetT) {
  prevT = wrap01(prevT);
  newT = wrap01(newT);
  targetT = wrap01(targetT);

  if (newT >= prevT) {
    return targetT > prevT && targetT <= newT;
  } else {
    return targetT > prevT || targetT <= newT;
  }
}

/* =========================
   Renderização - Principal
   ========================= */

function renderMainViewport() {
  gMain.push();
  gMain.background(20);
  gMain.resetMatrix();
  // Removido flip em Y para evitar objetos "de cabeça para baixo"

  const carPos = trackPoint(carT);
  const forward = carDir.copy();
  const up = createVector(0, 1, 0);
  const left = p5.Vector.cross(up, forward).normalize();

  let camPos = p5.Vector.add(carPos, p5.Vector.mult(forward, -camDistance));
  camPos = p5.Vector.add(camPos, createVector(0, camHeight, 0));
  camPos = p5.Vector.add(camPos, p5.Vector.mult(left, camSideOffset));

  const cam = gMain.createCamera();
  gMain._renderer._curCamera = cam;
  cam.setPosition(camPos.x, camPos.y, camPos.z);
  cam.lookAt(carPos.x, carPos.y, carPos.z);
  gMain.perspective();

  if (shadingMode === "phong") {
    gMain.ambientLight(60);
    gMain.directionalLight(255, 255, 255, -0.3, -1, -0.2);
  } else {
    gMain.ambientLight(120);
  }

  if (showAxes) drawAxes(gMain, 200);
  drawTrack(gMain);
  drawStartFinishLine(gMain);
  drawCheckpoints(gMain);
  drawDecorObjects(gMain, camPos);
  drawCar(gMain, carPos);

  gMain.pop();
}

/* =========================
   Renderização - Mini-mapa
   ========================= */

function renderMiniViewport() {
  gMini.push();
  gMini.background(40, 0, 80);

  gMini.resetMatrix();
  const cam = gMini.createCamera();
  gMini._renderer._curCamera = cam;

  // top-view ortográfica cobrindo a pista toda
  cam.camera(0, 400, 0.001, 0, 0, 0, 0, 0, -1);
  const viewSize = MINI_VIEW_SIZE;
  gMini.ortho(-viewSize, viewSize, viewSize, -viewSize, 0.1, 1000);

  gMini.ambientLight(100);
  gMini.directionalLight(255, 255, 255, 0, -1, 0);

  if (showAxes) drawAxes(gMini, 200);
  drawTrack(gMini);
  drawStartFinishLine(gMini);
  drawCheckpoints(gMini);
  drawTrackControlPoints(gMini);
  drawDecorObjects(gMini, null, false);

  const carPos = trackPoint(carT);
  drawCar(gMini, carPos);

  gMini.pop();
}

/* ====================
   Pista paramétrica 3D
   ==================== */

function trackPoint(t) {
  t = wrap01(t);
  let p;
  if (trackType === "bezier") {
    p = bezier3D(
      trackCtrlBezier[0],
      trackCtrlBezier[1],
      trackCtrlBezier[2],
      trackCtrlBezier[3],
      t
    );
  } else {
    p = bSpline3D(
      trackCtrlBSpline[0],
      trackCtrlBSpline[1],
      trackCtrlBSpline[2],
      trackCtrlBSpline[3],
      t
    );
  }
  const y = elevation(p.x, p.z);
  return createVector(p.x, y, p.z);
}

function trackTangent(t) {
  const eps = 0.001;
  const p1 = trackPoint(t + eps);
  const p0 = trackPoint(t - eps);
  return p5.Vector.sub(p1, p0);
}

function elevation(x, z) {
  const k = 0.02;
  return 15 * Math.sin(k * x) * Math.cos(k * z);
}

function drawTrack(g) {
  const steps = trackSteps;
  const up = createVector(0, 1, 0);

  // Linha central
  g.push();
  g.stroke(255, 255, 255, 150);
  g.strokeWeight(1);
  g.noFill();
  g.beginShape();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = trackPoint(t);
    g.vertex(p.x, p.y + 0.1, p.z);
  }
  g.endShape();
  g.pop();

  // Faixa da pista
  g.push();

  if (texturesEnabled && asphaltTexture) {
    g.noStroke();
    g.textureMode(NORMAL);
    g.texture(asphaltTexture);
  } else {
    if (showWireframe) {
      g.noFill();
      g.stroke(200, 200, 200);
    } else {
      g.noStroke();
      if (shadingMode === "phong") {
        g.ambientMaterial(60, 60, 60);
      } else {
        g.ambientMaterial(120, 120, 120);
      }
    }
  }

  g.beginShape(TRIANGLE_STRIP);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const center = trackPoint(t);
    const tangent = trackTangent(t).normalize();
    const left = p5.Vector.cross(up, tangent).normalize().mult(roadHalfWidth);

    const pL = p5.Vector.add(center, left);
    const pR = p5.Vector.sub(center, left);

    if (texturesEnabled && asphaltTexture) {
      g.vertex(pL.x, pL.y, pL.z, t, 0);
      g.vertex(pR.x, pR.y, pR.z, t, 1);
    } else {
      g.vertex(pL.x, pL.y, pL.z);
      g.vertex(pR.x, pR.y, pR.z);
    }
  }
  g.endShape();
  g.pop();
}

/* ===========================
   Linha de largada/chegada
   =========================== */

function drawStartFinishLine(g) {
  const up = createVector(0, 1, 0);
  const center = trackPoint(0);
  const tangent = trackTangent(0).normalize();
  const left = p5.Vector.cross(up, tangent).normalize().mult(roadHalfWidth * 1.1);

  const pL = p5.Vector.add(center, left);
  const pR = p5.Vector.sub(center, left);

  g.push();
  g.stroke(255, 255, 255);
  g.strokeWeight(4);
  g.line(pL.x, pL.y + 0.3, pL.z, pR.x, pR.y + 0.3, pR.z);
  g.pop();
}

/* ======================
   Checkpoints na pista
   ====================== */

function drawCheckpoints(g) {
  g.push();

  for (let i = 0; i < checkpointTs.length; i++) {
    const t = checkpointTs[i];
    const p = trackPoint(t);

    if (checkpointPassed[i]) {
      g.ambientMaterial(0, 220, 0);
    } else if (i === nextCheckpointIndex) {
      g.ambientMaterial(255, 220, 0);
    } else {
      g.ambientMaterial(220, 0, 0);
    }

    if (showWireframe) {
      g.noFill();
      g.stroke(255);
    } else {
      g.noStroke();
    }

    g.push();
    g.translate(p.x, p.y + 12, p.z);
    g.box(8, 24, 8);
    g.pop();
  }

  g.pop();
}

/* ====================================
   Objetos de cenário + frustum culling
   ==================================== */

function drawDecorObjects(g, camPos, useCulling = true) {
  const up = createVector(0, 1, 0);

  g.push();
  for (let i = 0; i < decorObjects.length; i++) {
    const d = decorObjects[i];

    const center = trackPoint(d.t);
    const tangent = trackTangent(d.t).normalize();
    const left = p5.Vector.cross(up, tangent).normalize();
    const worldPos = p5.Vector.add(center, p5.Vector.mult(left, d.lateralOffset));

    if (useCulling && frustumCullingEnabled && camPos) {
      const dist = p5.Vector.dist(worldPos, camPos);
      if (dist > cullRadius) continue;
    }

    if (showWireframe) {
      g.noFill();
      g.stroke(0, 200, 0);
    } else {
      g.noStroke();
      g.ambientMaterial(20, 120, 40);
    }

    g.push();
    g.translate(worldPos.x, worldPos.y + d.height / 2, worldPos.z);
    g.box(6, d.height, 6);
    g.pop();
  }
  g.pop();
}

/* ==============================
   Pontos de controle da pista
   ============================== */

function drawTrackControlPoints(g) {
  if (!showControlPoints) return;

  const ctrl = trackType === "bezier" ? trackCtrlBezier : trackCtrlBSpline;
  if (!ctrl || ctrl.length < 4) return;

  g.push();

  g.stroke(0, 255, 255);
  g.strokeWeight(4);
  g.noFill();
  g.beginShape();
  for (let i = 0; i < ctrl.length; i++) {
    const p = ctrl[i];
    g.vertex(p.x, p.y + 0.5, p.z);
  }
  g.endShape();

  for (let i = 0; i < ctrl.length; i++) {
    const p = ctrl[i];
    g.push();
    g.translate(p.x, p.y + 10, p.z);

    if (trackType === "bezier") {
      g.ambientMaterial(0, 255, 255);
    } else {
      g.ambientMaterial(0, 255, 200);
    }

    if (showWireframe) {
      g.noFill();
      g.stroke(255);
    } else {
      g.noStroke();
    }

    g.sphere(10);
    g.pop();
  }

  g.pop();
}

/* ==========
   Carro
   ========== */

function drawCar(g, pos) {
  g.push();

  if (showWireframe) {
    g.noFill();
    g.stroke(255, 200, 0);
  } else {
    g.noStroke();
    g.ambientMaterial(255, 200, 0);
  }

  g.translate(pos.x, pos.y + 6, pos.z);
  g.rotateY(carYaw);
  g.box(14, 6, 22);

  g.pop();
}

/* =================
   Utilitários curva
   ================= */

// Bezier 3D (cúbica)
function bezier3D(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const u2 = u * u;
  const u3 = u2 * u;
  const t2 = t * t;
  const t3 = t2 * t;

  const x = u3 * p0.x + 3 * u2 * t * p1.x + 3 * u * t2 * p2.x + t3 * p3.x;
  const y = u3 * p0.y + 3 * u2 * t * p1.y + 3 * u * t2 * p2.y + t3 * p3.y;
  const z = u3 * p0.z + 3 * u2 * t * p1.z + 3 * u * t2 * p2.z + t3 * p3.z;
  return createVector(x, y, z);
}

// B-Spline 3D (base uniforme, grau 3)
function bSpline3D(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;

  const b0 = (-t3 + 3 * t2 - 3 * t + 1) / 6.0;
  const b1 = (3 * t3 - 6 * t2 + 4) / 6.0;
  const b2 = (-3 * t3 + 3 * t2 + 3 * t + 1) / 6.0;
  const b3 = t3 / 6.0;

  const x = b0 * p0.x + b1 * p1.x + b2 * p2.x + b3 * p3.x;
  const y = b0 * p0.y + b1 * p1.y + b2 * p2.y + b3 * p3.y;
  const z = b0 * p0.z + b1 * p1.z + b2 * p2.z + b3 * p3.z;
  return createVector(x, y, z);
}

function wrap01(t) {
  t = t % 1;
  if (t < 0) t += 1;
  return t;
}

function smoothAngle(current, target, factor) {
  let diff = target - current;
  diff = ((diff + Math.PI) % (2 * Math.PI)) - Math.PI;
  return current + diff * factor;
}

/* Eixos XYZ simples */
function drawAxes(g, size) {
  g.push();
  g.strokeWeight(2);

  g.stroke(255, 0, 0);
  g.line(0, 0, 0, size, 0, 0);

  g.stroke(0, 255, 0);
  g.line(0, 0, 0, 0, size, 0);

  g.stroke(0, 150, 255);
  g.line(0, 0, 0, 0, 0, size);

  g.pop();
}


/* ===============================
   Conversão coordenadas mini-map
   =============================== */

function worldToMiniScreen(x, z) {
  const sx = map(x, -MINI_VIEW_SIZE, MINI_VIEW_SIZE, 0, WIDTH / 2);
  const sy = map(z, -MINI_VIEW_SIZE, MINI_VIEW_SIZE, 0, HEIGHT);
  return { x: sx, y: sy };
}

function miniScreenToWorldXZ(sx, sy) {
  const x = map(sx, 0, WIDTH / 2, -MINI_VIEW_SIZE, MINI_VIEW_SIZE);
  const z = map(sy, 0, HEIGHT, -MINI_VIEW_SIZE, MINI_VIEW_SIZE);
  return { x, z };
}

/* ================
   HUD / Overlay 2D
   ================ */

function drawHUD() {
  push();
  resetMatrix();
  textAlign(LEFT, TOP);
  textSize(12);
  noStroke();
  fill(255);

  // ============================
  // BLOCO FIXO DE M / V / P
  // ============================
  let y = 10;

  text("PIPELINE (M / V / P):", 10, y);
  y += 16;
  text("Viewport Esquerda (Principal): M | V: perseguição | P: perspective", 10, y);
  y += 16;
  text("Viewport Direita (Mini-mapa):   M | V: top-view    | P: orthographic", 10, y);

  // Espaço extra antes do HUD normal
  y += 30;

  // ============================
  // HUD CLÁSSICO
  // ============================
  text("Corrida Paramétrica - Bézier vs B-Spline", 10, y);  y += 18;
  text("Viewport Esquerda: Câmera de perseguição", 10, y); y += 16;
  text("Viewport Direita: Mini-mapa top-view (ortográfica)", 10, y); y += 16;

  text(`FPS: ${fps.toFixed(1)}`, 10, y); y += 18;

  const pistaLabel =
    trackType === "bezier"
      ? "Bézier (passa pelos extremos)"
      : "B-Spline cúbica (mais suave, não passa nos extremos)";
  text(`Pista atual: ${pistaLabel}`, 10, y); y += 16;
  text(`Velocidade (paramétrica): ${carSpeed.toFixed(6)}`, 10, y); y += 16;

  let cpInfo;
  if (nextCheckpointIndex >= 0) {
    cpInfo = `${nextCheckpointIndex + 1}/${checkpointTs.length}`;
  } else {
    cpInfo = "todos desta volta completos";
  }
  text(`Voltas completas: ${lapCount} | Próximo checkpoint: ${cpInfo}`, 10, y); y += 18;

  const shadingLabel =
    shadingMode === "phong" ? "Phong (simulado)" : "Flat (simulado)";
  text(`Shading: ${shadingLabel} (Z)`, 10, y); y += 16;
  text(`Wireframe: ${showWireframe ? "ON" : "OFF"} (Q)`, 10, y); y += 16;
  text(
    `Eixos de referência: ${showAxes ? "VISÍVEIS" : "OCULTOS"} (X)`,
    10,
    y
  );
  y += 16;
  text(
    `Pontos de controle no mini-mapa: ${
      showControlPoints ? "VISÍVEIS" : "OCULTOS"
    } (P)`,
    10,
    y
  );
  y += 16;
  text(
    `Textura da pista: ${texturesEnabled ? "LIGADAS" : "DESLIGADAS"} (T)`,
    10,
    y
  );
  y += 16;
  text(
    `Frustum culling: ${frustumCullingEnabled ? "ATIVADO" : "DESATIVADO"} (F)`,
    10,
    y
  );
  y += 18;

  text("Controles:", 10, y); y += 16;
  text("↑ / ↓ : acelerar / frear (muda velocidade paramétrica)", 10, y); y += 16;
  text("← / → : mover câmera lateralmente (offset)", 10, y); y += 16;
  text("Roda do mouse: zoom (aproxima / afasta câmera)", 10, y); y += 16;
  text("Q : alternar wireframe da pista/carro", 10, y); y += 16;
  text("Z : alternar modo de shading (flat / phong simulado)", 10, y); y += 16;
  text("C : alternar tipo de pista (Bézier / B-Spline)", 10, y); y += 16;
  text("P : mostrar/ocultar pontos de controle no mini-mapa", 10, y); y += 16;
  text("X : mostrar/ocultar eixos de referência", 10, y); y += 16;
  text("T : ligar/desligar texturas da pista", 10, y); y += 16;
  text("F : ligar/desligar frustum culling (objetos de cenário)", 10, y); y += 16;
  text("H : mostrar/ocultar HUD", 10, y); y += 16;

  pop();
}

/* ====================
   Interação - Teclado
   ==================== */

function keyPressed() {
  const k = key.toLowerCase();

  if (k === "q") {
    showWireframe = !showWireframe;
    return;
  }
  if (k === "z") {
    shadingMode = shadingMode === "phong" ? "flat" : "phong";
    return;
  }
  if (k === "c") {
    trackType = trackType === "bezier" ? "bspline" : "bezier";
    return;
  }
  if (k === "p") {
    showControlPoints = !showControlPoints;
    return;
  }
  if (k === "x") {
    showAxes = !showAxes;
    return;
  }
  if (k === "h") {
    showHUD = !showHUD;
    return;
  }
  if (k === "t") {
    texturesEnabled = !texturesEnabled;
    return;
  }
  if (k === "f") {
    frustumCullingEnabled = !frustumCullingEnabled;
    return;
  }

  if (keyCode === UP_ARROW) {
    carSpeed = constrain(carSpeed + 0.00003, carSpeedMin, carSpeedMax);
    return;
  }
  if (keyCode === DOWN_ARROW) {
    carSpeed = constrain(carSpeed - 0.00003, carSpeedMin, carSpeedMax);
    return;
  }

  if (keyCode === LEFT_ARROW) {
    camSideOffset -= 5;
    return;
  }
  if (keyCode === RIGHT_ARROW) {
    camSideOffset += 5;
    return;
  }
}


/* =========================
   Editor de pontos de curva
   ========================= */

function mousePressed() {
  // Só reage se clicar na viewport da direita (mini-mapa)
  if (mouseX < WIDTH / 2 || mouseX > WIDTH || mouseY < 0 || mouseY > HEIGHT) {
    return;
  }

  const localX = mouseX - WIDTH / 2;
  const localY = mouseY;

  const ctrl = trackType === "bezier" ? trackCtrlBezier : trackCtrlBSpline;
  if (!ctrl) return;

  let closest = -1;
  let closestDist2 = 999999;

  for (let i = 0; i < ctrl.length; i++) {
    const p = ctrl[i];
    const scr = worldToMiniScreen(p.x, p.z);
    const dx = localX - scr.x;
    const dy = localY - scr.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < closestDist2) {
      closestDist2 = d2;
      closest = i;
    }
  }

  const pickRadius = 18; // em pixels
  if (closest >= 0 && closestDist2 <= pickRadius * pickRadius) {
    selectedCtrlIndex = closest;
    selectedCtrlArray = trackType; // "bezier" ou "bspline"
  }
}

function mouseDragged() {
  if (selectedCtrlIndex < 0 || !selectedCtrlArray) return;

  // Continua só se o arraste ainda estiver na área do mini-mapa
  if (mouseX < WIDTH / 2 || mouseX > WIDTH || mouseY < 0 || mouseY > HEIGHT) {
    return;
  }

  const localX = mouseX - WIDTH / 2;
  const localY = mouseY;
  const world = miniScreenToWorldXZ(localX, localY);

  let ctrl = selectedCtrlArray === "bezier" ? trackCtrlBezier : trackCtrlBSpline;
  if (!ctrl || selectedCtrlIndex < 0 || selectedCtrlIndex >= ctrl.length) return;

  // Atualiza o ponto selecionado no plano XZ (mantém Y = 0)
  ctrl[selectedCtrlIndex].x = world.x;
  ctrl[selectedCtrlIndex].z = world.z;

  // Mantém a pista fechada: primeiro e último pontos coincidem
  if (selectedCtrlIndex === 0 && ctrl.length >= 4) {
    const last = ctrl.length - 1;
    ctrl[last].x = world.x;
    ctrl[last].z = world.z;
  } else if (selectedCtrlIndex === ctrl.length - 1 && ctrl.length >= 4) {
    ctrl[0].x = world.x;
    ctrl[0].z = world.z;
  }
}

function mouseReleased() {
  selectedCtrlIndex = -1;
  selectedCtrlArray = null;
}

/* ====================
   Interação - Mouse
   ==================== */

function mouseWheel(event) {
  camDistance += event.delta * 0.3;
  camDistance = constrain(camDistance, 40, 250);
}
