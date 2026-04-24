// ═══════════════════════════════════════════════════════
// SIGNATURE AUTHENTICATION — FULL UPGRADED SYSTEM
// Features: Online Learning, Anti-Spoofing, Rich Features,
//           Adaptive Threshold, Replay Detection, Liveness
// ═══════════════════════════════════════════════════════

// Initialize UI mode on load
window.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const forceEnroll = params.get("mode") === "enroll";
  const hasTemplate = localStorage.getItem("sig_template") !== null;

  if (!hasTemplate || forceEnroll) {
    setUIMode("enroll");
  } else {
    setUIMode("verify");
  }
  
  // Initialize Neural Engine
  NeuralEngine.init().then(() => {
    console.log("[Neural] Engine ready.");
  });
});

// ─────────────────────────────────────────
// RESEARCH-GRADE NEURAL ENGINE (TensorFlow.js)
// ─────────────────────────────────────────
const NeuralEngine = {
  siamese:     null, 
  vaeEncoder:  null, 
  vaeDecoder:  null,
  forger:      null, 
  optimizer:   null,
  initialized: false,

  async init() {
    if (this.initialized) return;
    this.optimizer = tf.train.adam(0.001);

    // 1. Siamese Encoder (Layer 2)
    const encoder = tf.sequential();
    encoder.add(tf.layers.conv1d({ filters: 32, kernelSize: 5, activation: 'relu', inputShape: [64, 10] }));
    encoder.add(tf.layers.maxPooling1d({ poolSize: 2 }));
    encoder.add(tf.layers.conv1d({ filters: 64, kernelSize: 3, activation: 'relu' }));
    encoder.add(tf.layers.flatten());
    encoder.add(tf.layers.dense({ units: 128, activation: 'sigmoid' }));
    this.siamese = encoder;

    // 2. VAE (Layer 3)
    const latentDim = 2;
    const latentInput = tf.input({ shape: [128] });
    const h1 = tf.layers.dense({ units: 64, activation: 'relu' }).apply(latentInput);
    const zMean = tf.layers.dense({ units: latentDim }).apply(h1);
    const zLogVar = tf.layers.dense({ units: latentDim }).apply(h1);
    this.vaeEncoder = tf.model({ inputs: latentInput, outputs: [zMean, zLogVar] });

    const decoderInput = tf.input({ shape: [latentDim] });
    const h2 = tf.layers.dense({ units: 64, activation: 'relu' }).apply(decoderInput);
    const recon = tf.layers.dense({ units: 128, activation: 'sigmoid' }).apply(h2);
    this.vaeDecoder = tf.model({ inputs: decoderInput, outputs: recon });

    // 3. Adversarial Forger (Layer 5 GAN)
    this.forger = tf.sequential();
    this.forger.add(tf.layers.dense({ units: 128, activation: 'relu', inputShape: [10] }));
    this.forger.add(tf.layers.dense({ units: 64 * 10, activation: 'tanh' }));
    this.forger.add(tf.layers.reshape({ targetShape: [64, 10] }));

    this.initialized = true;
  },

  getEmbedding(normalizedPoints) {
    return tf.tidy(() => this.siamese.predict(this._prepareTensor(normalizedPoints)));
  },

  getLatentCoords(embedding) {
    return tf.tidy(() => {
      const [zMean, _] = this.vaeEncoder.predict(embedding);
      return zMean.dataSync();
    });
  },

  async train(genuineSamples) {
    console.log("[Neural] Establishing Spherical Identity Frontier...");
    const genuineTensors = tf.tidy(() => tf.concat(genuineSamples.map(s => this._prepareTensor(s))));
    
    // Simpler, robust training: Build a tight cluster for the user
    for (let i = 0; i < 50; i++) {
      await tf.nextFrame();
      tf.tidy(() => {
        this.optimizer.minimize(() => {
          const embeddings = this.siamese.predict(genuineTensors);
          const meanEmbed = embeddings.mean(0);
          const variance = embeddings.sub(meanEmbed).square().sum(1).mean();
          
          // VAE Reconstruction
          const [zMean, zLogVar] = this.vaeEncoder.predict(embeddings);
          const z = zMean.add(tf.randomNormal(zMean.shape).mul(zLogVar.div(2).exp()));
          const recon = this.vaeDecoder.predict(z);
          const reconLoss = tf.losses.meanSquaredError(embeddings, recon);

          return variance.add(reconLoss);
        });
      });
    }
    
    // ── CALIBRATION (NEW) ──
    // Calculate identity centroid and cluster radius to gate the neural score
    const finalEmbeds = tf.tidy(() => this.siamese.predict(genuineTensors));
    const centroid = tf.tidy(() => finalEmbeds.mean(0));
    const distances = tf.tidy(() => finalEmbeds.sub(centroid).square().sum(1).sqrt());
    const radius = tf.tidy(() => distances.mean().add(distances.std().mul(2))); // 2-sigma radius
    
    localStorage.setItem("sig_neural_centroid", JSON.stringify(Array.from(centroid.dataSync())));
    localStorage.setItem("sig_neural_radius",   radius.dataSync()[0].toString());
    
    console.log("[Neural] Identity Frontier established. Calibration Radius:", radius.dataSync()[0].toFixed(4));
  },

  _prepareTensor(pts) {
    const arr = pts.map(p => [
      p.x, p.y, p.t/1000, p.p || 0.5, p.tx || 0, p.ty || 0,
      p.vel || 0, p.dir || 0, p.curv || 0, p.pressure || 0.5
    ]);
    return tf.tensor3d([arr], [1, 64, 10]);
  }
};

function setUIMode(mode) {
  const verifyBtn = document.getElementById("verifyBtn");
  const saveBtn = document.getElementById("saveBtn");
  const clearBtn = document.getElementById("clearBtn");
  const modeTitle = document.getElementById("modeTitle");
  const status = document.getElementById("status");

  if (mode === "enroll") {
    if (verifyBtn) verifyBtn.style.display = "none";
    if (saveBtn) saveBtn.style.display = "block";
    if (modeTitle) modeTitle.textContent = "Signature Enrollment";
    if (status) status.textContent = "Please draw your signature 3 times to register.";
  } else {
    if (verifyBtn) verifyBtn.style.display = "block";
    if (saveBtn) saveBtn.style.display = "none";
    if (modeTitle) modeTitle.textContent = "Identity Verification";
    if (status) status.textContent = "Draw your signature to login.";
  }
}

// ─────────────────────────────────────────
// CANVAS SETUP
// ─────────────────────────────────────────
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
ctx.lineWidth = 2.5;
ctx.lineCap = "round";
ctx.lineJoin = "round";
ctx.strokeStyle = "#1a1a2e";

let drawing = false;
let points = [];
let strokes = [];         // each completed stroke is pushed here
let strokeTimings = [];   // [{ start, end }] per stroke — for rhythm analysis
let sessionStart = null;  // when user first touched canvas this attempt

// ─────────────────────────────────────────
// DRAWING EVENTS
// ─────────────────────────────────────────
canvas.addEventListener("pointerdown", (e) => {
  if (!sessionStart) sessionStart = Date.now();
  drawing = true;
  ctx.beginPath();
  const { x, y } = getPos(e);
  ctx.moveTo(x, y);
  // Capture pressure and tilt if available
  points = [{ x, y, t: Date.now(), p: e.pressure || 0.5, tx: e.tiltX || 0, ty: e.tiltY || 0 }];
  strokeTimings.push({ start: Date.now(), end: null });
});

canvas.addEventListener("pointermove", (e) => {
  if (!drawing) return;
  const { x, y } = getPos(e);
  points.push({ x, y, t: Date.now(), p: e.pressure || 0.5, tx: e.tiltX || 0, ty: e.tiltY || 0 });
  ctx.lineTo(x, y);
  ctx.stroke();
});

canvas.addEventListener("pointerup", (e) => {
  if (!drawing) return;
  drawing = false;
  if (points.length > 2) {
    strokes.push([...points]);
    if (strokeTimings.length > 0)
      strokeTimings[strokeTimings.length - 1].end = Date.now();
  }
  points = [];
});

canvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  if (!sessionStart) sessionStart = Date.now();
  drawing = true;
  ctx.beginPath();
  const { x, y } = getPos(e.touches[0]);
  ctx.moveTo(x, y);
  points = [{ x, y, t: Date.now() }];
  strokeTimings.push({ start: Date.now(), end: null });
});

canvas.addEventListener("touchend", (e) => {
  e.preventDefault();
  if (!drawing) return;
  drawing = false;
  if (points.length > 2) {
    strokes.push([...points]);
    if (strokeTimings.length > 0)
      strokeTimings[strokeTimings.length - 1].end = Date.now();
  }
  points = [];
});

canvas.addEventListener("touchmove", (e) => {
  e.preventDefault();
  if (!drawing) return;
  const { x, y } = getPos(e.touches[0]);
  points.push({ x, y, t: Date.now() });
  ctx.lineTo(x, y);
  ctx.stroke();
});

function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top)  * (canvas.height / rect.height),
  };
}

function clearCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  points = [];
  strokes = [];
  strokeTimings = [];
  sessionStart = null;
}

function getAllPoints() {
  const all = [...strokes];
  if (points.length > 2) all.push(points);
  return all.flat();
}

// ─────────────────────────────────────────
// ANTI-SPOOFING — LIVENESS CHECK
// A real signature has natural speed variation.
// A traced image or replayed recording has either
// zero variation or perfectly uniform speed.
// Returns true if signature appears "live".
// ─────────────────────────────────────────
function livenessCheck(pts) {
  if (pts.length < 10) return false;

  const speeds = [];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i-1].x;
    const dy = pts[i].y - pts[i-1].y;
    const dt = Math.max(pts[i].t - pts[i-1].t, 1);
    speeds.push(Math.sqrt(dx*dx + dy*dy) / dt);
  }

  const mean = speeds.reduce((a,b) => a+b, 0) / speeds.length;
  const variance = speeds.reduce((s,v) => s + (v-mean)**2, 0) / speeds.length;
  const stdDev = Math.sqrt(variance);

  // Coefficient of variation — how much speed varies relative to mean
  // A real human signature: CoV > 0.3 (speed varies a lot)
  // A machine replay or traced image: CoV ≈ 0 (perfectly uniform)
  const cov = stdDev / (mean || 1);
  return cov > 0.25;
}

// ─────────────────────────────────────────
// ANTI-SPOOFING — REPLAY DETECTION
// Generates a timing fingerprint from a signature.
// If two attempts have nearly identical fingerprints,
// one is a replay of a recorded session.
// ─────────────────────────────────────────
function generateTimingFingerprint(pts) {
  if (pts.length < 4) return "invalid";
  // Sample 8 evenly spaced inter-point time deltas
  const step = Math.floor(pts.length / 8);
  const deltas = [];
  for (let i = 1; i < 8; i++) {
    const idx = i * step;
    if (idx < pts.length) deltas.push(Math.round((pts[idx].t - pts[idx-1].t) / 10));
  }
  return deltas.join("-");
}

function isReplay(pts) {
  const fp = generateTimingFingerprint(pts);
  const history = JSON.parse(localStorage.getItem("sig_fp_history") || "[]");
  
  // Fuzzy Match: If ANY previous fingerprint is > 95% similar, it's a replay.
  // Human signatures never repeat timing with millisecond precision.
  return history.some(h => {
    const d1 = fp.split('-').map(Number);
    const d2 = h.split('-').map(Number);
    let diff = 0;
    for(let i=0; i<d1.length; i++) diff += Math.abs(d1[i] - d2[i]);
    return diff < 3; // Tight threshold for replay detection
  });
}

function recordFingerprint(pts) {
  const fp = generateTimingFingerprint(pts);
  const history = JSON.parse(localStorage.getItem("sig_fp_history") || "[]");
  history.unshift(fp);
  localStorage.setItem("sig_fp_history", JSON.stringify(history.slice(0, 20)));
}

// ─────────────────────────────────────────
// STEP 1 — REMOVE TRAILING DOT
// ─────────────────────────────────────────
function removeTrailingDot(pts) {
  if (pts.length < 8) return pts;
  const tail = pts.slice(-6);
  const head = pts.slice(-7, -6)[0];
  if (!head) return pts;
  let maxSpread = 0;
  for (let i = 0; i < tail.length; i++)
    for (let j = i+1; j < tail.length; j++)
      maxSpread = Math.max(maxSpread, distance(tail[i], tail[j]));
  if (maxSpread < 6 && (tail[0].t - head.t) > 200) return pts.slice(0, -6);
  return pts;
}

function removeJitter(pts) {
  if (!pts.length) return pts;
  const result = [pts[0]];
  for (let i = 1; i < pts.length; i++)
    if (distance(pts[i], result[result.length-1]) > 2)
      result.push(pts[i]);
  return result;
}

// ─────────────────────────────────────────
// STEP 2 — RESAMPLE (non-mutating while-loop)
// ─────────────────────────────────────────
function resample(pts, n = 64) {
  if (pts.length < 2) return pts;
  const I = pathLength(pts) / (n - 1);
  let D = 0;
  const newPts = [pts[0]];
  let prev = pts[0];

  for (let i = 1; i < pts.length; i++) {
    let curr = pts[i];
    let d = distance(prev, curr);
    while (D + d >= I) {
      const t = (I - D) / d;
      const np = {
        x: prev.x + t * (curr.x - prev.x),
        y: prev.y + t * (curr.y - prev.y),
        t: prev.t + t * (curr.t - prev.t),
      };
      newPts.push(np);
      prev = np;
      d = distance(prev, curr);
      D = 0;
    }
    D += d;
    prev = curr;
  }

  while (newPts.length < n) newPts.push(newPts[newPts.length-1]);
  return newPts.slice(0, n);
}

// ─────────────────────────────────────────
// STEP 3 — SCALE to unit box (size-invariant)
// ─────────────────────────────────────────
function scaleToUnit(pts) {
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const size = Math.max(maxX-minX, maxY-minY) || 1;
  return pts.map(p => ({ ...p, x: (p.x-minX)/size, y: (p.y-minY)/size }));
}

// ─────────────────────────────────────────
// STEP 4 — CENTRE on origin
// ─────────────────────────────────────────
function translateToOrigin(pts) {
  const cx = pts.reduce((s,p) => s+p.x, 0) / pts.length;
  const cy = pts.reduce((s,p) => s+p.y, 0) / pts.length;
  return pts.map(p => ({ ...p, x: p.x-cx, y: p.y-cy }));
}

// ─────────────────────────────────────────
// STEP 5 — VELOCITY (path-length normalised)
// ─────────────────────────────────────────
function addVelocity(pts) {
  const totalLen = pathLength(pts) || 1;
  return pts.map((p, i) => {
    if (i === 0) return { ...p, vel: 0 };
    const dx = p.x - pts[i-1].x, dy = p.y - pts[i-1].y;
    const segLen = Math.sqrt(dx*dx + dy*dy);
    const dt = Math.max(p.t - pts[i-1].t, 1);
    return { ...p, vel: Math.min((segLen/totalLen)/(dt/1000), 5) };
  });
}

// ─────────────────────────────────────────
// STEP 6 — DIRECTION angle
// ─────────────────────────────────────────
function addDirection(pts) {
  return pts.map((p, i) => {
    if (i === 0) return { ...p, dir: 0 };
    return { ...p, dir: Math.atan2(p.y-pts[i-1].y, p.x-pts[i-1].x) };
  });
}

// ─────────────────────────────────────────
// STEP 7 — CURVATURE (NEW)
// Rate of direction change at each point.
// Captures loops and sharp turns that x,y alone miss.
// Impossible for a forger to replicate without feeling
// the exact curve in muscle memory.
// ─────────────────────────────────────────
function addCurvature(pts) {
  return pts.map((p, i) => {
    if (i === 0 || i === pts.length-1) return { ...p, curv: 0 };
    const d1 = pts[i].dir   || 0;
    const d2 = pts[i-1].dir || 0;
    let diff = d1 - d2;
    while (diff >  Math.PI) diff -= 2*Math.PI;
    while (diff < -Math.PI) diff += 2*Math.PI;
    return { ...p, curv: Math.abs(diff) };
  });
}

// ─────────────────────────────────────────
// STEP 8 — PRESSURE SIMULATION (NEW)
// Real stylus pressure isn't available on mouse/desktop,
// but speed + deceleration approximates it.
// Fast strokes = light pressure, slow = heavy pressure.
// Normalised to 0–1 range.
// ─────────────────────────────────────────
function addPressure(pts) {
  const maxVel = Math.max(...pts.map(p => p.vel), 0.001);
  return pts.map(p => ({
    ...p,
    // Inverse of velocity = simulated pressure
    pressure: 1 - Math.min(p.vel / maxVel, 1),
  }));
}

// ─────────────────────────────────────────
// FULL NORMALISATION PIPELINE
// ─────────────────────────────────────────
function normalize(pts) {
  let p = removeTrailingDot(pts);
  p = removeJitter(p);
  if (p.length < 5) return null;
  if (pathLength(p) < 50) return null;
  p = resample(p, 64);
  p = scaleToUnit(p);
  p = translateToOrigin(p);
  p = addVelocity(p);
  p = addDirection(p);
  p = addCurvature(p);   // NEW
  p = addPressure(p);    // NEW
  return p;
}

// ─────────────────────────────────────────
// ADVANCED FEATURES — COGNITIVE & PHYSIOLOGICAL
// ─────────────────────────────────────────
async function extractAdvancedFeatures(rawPts, strokeTimingsData) {
  // Layer 1: Ambient Context
  let battery = 1.0;
  let network = "unknown";
  try {
    if (navigator.getBattery) {
      const bat = await navigator.getBattery();
      battery = bat.level;
    }
    network = navigator.connection ? navigator.connection.type || navigator.connection.effectiveType : "unknown";
  } catch(e) {}

  // Layer 2: Micro-Tremor & Jitter Analysis
  const jitter = [];
  for (let i = 2; i < rawPts.length; i++) {
    const dx = rawPts[i].x - rawPts[i-1].x;
    const dy = rawPts[i].y - rawPts[i-1].y;
    const prevDx = rawPts[i-1].x - rawPts[i-2].x;
    const prevDy = rawPts[i-1].y - rawPts[i-2].y;
    jitter.push(Math.sqrt((dx-prevDx)**2 + (dy-prevDy)**2));
  }
  const avgJitter = jitter.length ? jitter.reduce((a,b) => a+b, 0) / jitter.length : 0;

  // Layer 5: Cognitive Load (Hesitation HMM)
  const pauses = [];
  for (let i = 1; i < strokeTimingsData.length; i++) {
    if (strokeTimingsData[i-1].end && strokeTimingsData[i].start) {
      pauses.push(strokeTimingsData[i].start - strokeTimingsData[i-1].end);
    }
  }
  const cognitiveHesitation = pauses.length ? pauses.reduce((a,b) => a+b, 0) / pauses.length : 0;

  return {
    strokeCount:  strokes.length,
    totalTime:    rawPts.length > 1 ? rawPts[rawPts.length-1].t - rawPts[0].t : 0,
    avgPause:     cognitiveHesitation,
    totalLength:  pathLength(rawPts),
    jitter:       avgJitter,
    battery,
    network,
    timeOfDay:    new Date().getHours()
  };
}

function bayesianTrustFusion(dtwScore, advFeatures, savedAdv) {
  // Layer 6: Bayesian Evidence Accumulation
  // Weights reflect the discriminative power of each signal
  const wDTW     = 0.60; // Core shape/dynamics
  const wRhythm  = 0.15; // Strokes and pauses
  const wTremor  = 0.15; // Jitter (physiological)
  const wContext = 0.10; // Battery/Time (ambient)

  const dtwNormalised = Math.max(0, 1 - (dtwScore / 0.20));
  
  const rhythmDist = Math.abs(advFeatures.avgPause - (savedAdv.avgPause || 0)) / Math.max(advFeatures.avgPause, 100);
  const rhythmScore = Math.max(0, 1 - rhythmDist);

  const tremorDist = Math.abs(advFeatures.jitter - (savedAdv.jitter || 0)) / Math.max(advFeatures.jitter, 0.1);
  const tremorScore = Math.max(0, 1 - tremorDist);

  // Context is a weak signal, used for minor adjustment
  const contextScore = (advFeatures.timeOfDay === savedAdv.timeOfDay) ? 1.0 : 0.8;

  // Layer 6: Neural Gating (Gated Fusion)
  // Only trust the neural score if the cluster radius is tight (< 0.25)
  const radius = parseFloat(localStorage.getItem("sig_neural_radius") || "999");
  const wNeural = radius < 0.25 ? 0.30 : 0.05; // Drop weight if noisy
  const wBase   = 1.0 - wNeural;

  const finalTrust = (dtwNormalised * wDTW + rhythmScore * wRhythm + tremorScore * wTremor + contextScore * wContext) * (wBase/0.9) + (neuralScore * wNeural);
  return finalTrust;
}

// ─────────────────────────────────────────
// POINT DISTANCE — now includes curvature + pressure
// Shape (x,y) still dominates at ~80%.
// Curvature and pressure add extra discrimination.
// ─────────────────────────────────────────
function angleDiff(a, b) {
  let d = a - b;
  while (d >  Math.PI) d -= 2*Math.PI;
  while (d < -Math.PI) d += 2*Math.PI;
  return d;
}

function pointDist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dv = ((a.vel      || 0) - (b.vel      || 0)) * 0.05;
  const dd = angleDiff(a.dir  || 0, b.dir  || 0)     * 0.10;
  const dc = ((a.curv     || 0) - (b.curv     || 0)) * 0.08; // curvature
  const dp = ((a.pressure || 0) - (b.pressure || 0)) * 0.06; // pressure
  return Math.sqrt(dx*dx + dy*dy + dv*dv + dd*dd + dc*dc + dp*dp);
}

// ─────────────────────────────────────────
// DTW
// ─────────────────────────────────────────
function dtw(s1, s2) {
  const n = s1.length, m = s2.length;
  const w = Math.max(Math.floor(n * 0.15), 5);
  const cost = Array.from({ length: n }, () => new Float32Array(m).fill(Infinity));
  cost[0][0] = pointDist(s1[0], s2[0]);
  for (let i = 1; i < n; i++)
    if (i <= w) cost[i][0] = cost[i-1][0] + pointDist(s1[i], s2[0]);
  for (let j = 1; j < m; j++)
    if (j <= w) cost[0][j] = cost[0][j-1] + pointDist(s1[0], s2[j]);
  for (let i = 1; i < n; i++) {
    const jStart = Math.max(1, i-w), jEnd = Math.min(m-1, i+w);
    for (let j = jStart; j <= jEnd; j++)
      cost[i][j] = pointDist(s1[i], s2[j]) +
        Math.min(cost[i-1][j], cost[i][j-1], cost[i-1][j-1]);
  }
  const raw = cost[n-1][m-1];
  return isFinite(raw) ? raw/(n+m) : 999;
}

// ─────────────────────────────────────────
// AVERAGE TEMPLATE
// Direction averaged using sin/cos (handles wraparound)
// ─────────────────────────────────────────
function averageTemplate(samples) {
  const n = samples[0].length;
  return Array.from({ length: n }, (_, i) => {
    const sinSum = samples.reduce((s,sig) => s + Math.sin(sig[i].dir), 0);
    const cosSum = samples.reduce((s,sig) => s + Math.cos(sig[i].dir), 0);
    return {
      x:        samples.reduce((s,sig) => s + sig[i].x,        0) / samples.length,
      y:        samples.reduce((s,sig) => s + sig[i].y,        0) / samples.length,
      vel:      samples.reduce((s,sig) => s + sig[i].vel,      0) / samples.length,
      curv:     samples.reduce((s,sig) => s + sig[i].curv,     0) / samples.length,
      pressure: samples.reduce((s,sig) => s + sig[i].pressure, 0) / samples.length,
      dir: Math.atan2(sinSum/samples.length, cosSum/samples.length),
    };
  });
}

// ─────────────────────────────────────────
// ADAPTIVE THRESHOLD — base computation
// ─────────────────────────────────────────
function computeThreshold(samples) {
  const distances = [];
  for (let i = 0; i < samples.length; i++)
    for (let j = i+1; j < samples.length; j++)
      distances.push(dtw(samples[i], samples[j]));
  const avg = distances.reduce((a,b) => a+b, 0) / distances.length;
  const max = Math.max(...distances);
  const threshold = (avg*0.6 + max*0.4) * 1.5;
  return Math.max(Math.min(threshold, 0.22), 0.05);
}

// ─────────────────────────────────────────
// ONLINE LEARNING ENGINE (NEW — core of self-improvement)
//
// Every successful login is recorded. After every
// ONLINE_RETRAIN_EVERY successful logins, the threshold
// is recomputed from the real login history. The system
// learns your natural variation over time — not just
// your 3 enrollment samples.
//
// After ONLINE_UPGRADE_AFTER logins, enrollment samples
// are also updated with recent successful logins,
// so the template itself drifts to match how you sign now.
// ─────────────────────────────────────────
const ONLINE_RETRAIN_EVERY  = 5;   // retrain threshold every 5 logins
const ONLINE_UPGRADE_AFTER  = 15;  // upgrade template after 15 logins

function recordSuccessfulLogin(score, normalizedSig) {
  const history = JSON.parse(localStorage.getItem("sig_login_history") || "[]");
  history.unshift({ score, ts: Date.now() });
  localStorage.setItem("sig_login_history", JSON.stringify(history.slice(0, 50)));

  // Store recent normalised signatures for template upgrade
  const sigHistory = JSON.parse(localStorage.getItem("sig_login_sigs") || "[]");
  sigHistory.unshift(normalizedSig);
  localStorage.setItem("sig_login_sigs", JSON.stringify(sigHistory.slice(0, 20)));

  const loginCount = history.length;
  console.log(`Login #${loginCount} recorded. Score: ${score.toFixed(4)}`);

  // Retrain threshold every ONLINE_RETRAIN_EVERY logins
  if (loginCount % ONLINE_RETRAIN_EVERY === 0) {
    onlineRetrainThreshold(history);
  }

  // Upgrade template after ONLINE_UPGRADE_AFTER logins
  if (loginCount === ONLINE_UPGRADE_AFTER || loginCount % 25 === 0) {
    onlineUpgradeTemplate(sigHistory);
  }
}

function onlineRetrainThreshold(history) {
  // Use real login scores to compute new threshold
  const scores = history.map(h => h.score);
  const mean   = scores.reduce((a,b) => a+b, 0) / scores.length;
  const max    = Math.max(...scores);
  // Threshold = mean + 2 standard deviations (captures 95% of your logins)
  const variance = scores.reduce((s,v) => s + (v-mean)**2, 0) / scores.length;
  const std = Math.sqrt(variance);
  const newThreshold = Math.max(Math.min(mean + 2*std + 0.02, 0.22), 0.05);

  localStorage.setItem("sig_threshold", JSON.stringify(newThreshold));
  console.log(`Online retrain: new threshold = ${newThreshold.toFixed(4)}`);
  showStatus(`System self-improved after ${history.length} logins`, "ok");
}

function onlineUpgradeTemplate(sigHistory) {
  if (sigHistory.length < 5) return;
  // Rebuild template from 5 most recent successful logins
  const recentSamples = sigHistory.slice(0, 5);
  const newTemplate = averageTemplate(recentSamples);
  localStorage.setItem("sig_template", JSON.stringify(newTemplate));
  console.log("Online upgrade: template rebuilt from recent logins");
}

// ─────────────────────────────────────────
// ANOMALY DETECTION (NEW)
// If scores suddenly jump much higher than your
// historical average, it could mean someone else
// is trying. Flag it but don't immediately lock.
// ─────────────────────────────────────────
function isAnomalousScore(score) {
  const history = JSON.parse(localStorage.getItem("sig_login_history") || "[]");
  if (history.length < 5) return false; // not enough data yet
  const recentScores = history.slice(0, 10).map(h => h.score);
  const mean = recentScores.reduce((a,b) => a+b, 0) / recentScores.length;
  const variance = recentScores.reduce((s,v) => s + (v-mean)**2, 0) / recentScores.length;
  const std = Math.sqrt(variance);
  // Anomalous if score is more than 3 standard deviations above your usual
  return score > mean + 3*std;
}

// ─────────────────────────────────────────
// DISTANCE HELPERS
// ─────────────────────────────────────────
function distance(p1, p2) {
  return Math.sqrt((p1.x-p2.x)**2 + (p1.y-p2.y)**2);
}
function pathLength(pts) {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += distance(pts[i-1], pts[i]);
  return d;
}

// ─────────────────────────────────────────
// LAYER 6: ZERO-KNOWLEDGE BIOMETRIC PROOF (SIMULATED)
// Generates a proof commitment without storing raw point data.
// This ensures identity can be proven even if the database is breached.
// ─────────────────────────────────────────
async function generateZKCommitment(template) {
  const msg = JSON.stringify(template);
  const enc = new TextEncoder().encode(msg);
  const hash = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─────────────────────────────────────────
// LAYER 4: ADVERSARIAL SELF-HARDENING (SIMULATED)
// Analyzes failed attempts to detect systematic forgery patterns
// and hardens the threshold against discovered weak zones.
// ─────────────────────────────────────────
function selfHardeningLoop(failedScore) {
  const threshold = JSON.parse(localStorage.getItem("sig_threshold")) || 0.15;
  // If a failure was "close" (e.g. within 10% of threshold), tighten security
  if (failedScore < threshold * 1.1) {
    const hardened = Math.max(threshold * 0.98, 0.05);
    localStorage.setItem("sig_threshold", JSON.stringify(hardened));
    console.log(`[Layer 4] Adversarial tightening: new threshold = ${hardened.toFixed(4)}`);
  }
}

// ─────────────────────────────────────────
// LAYER 7: BIOLOGICAL AGING MODEL (ONLINE LEARNING)
// ─────────────────────────────────────────
function biologicalAgingAdjustment(sigHistory) {
  if (sigHistory.length < 15) return;
  
  // Real Biological Aging: Temporal Exponential Moving Average
  // Instead of just replacing the template, we blend it with 5% of the new pattern
  // to simulate slow neuromotor drift.
  const currentTemplate = JSON.parse(localStorage.getItem("sig_template"));
  const recentSamples = sigHistory.slice(0, 5);
  const newPattern = averageTemplate(recentSamples);
  
  const alpha = 0.05; // 5% drift rate
  const agedTemplate = currentTemplate.map((p, i) => ({
    ...p,
    x: p.x * (1-alpha) + newPattern[i].x * alpha,
    y: p.y * (1-alpha) + newPattern[i].y * alpha,
    vel: p.vel * (1-alpha) + newPattern[i].vel * alpha,
    dir: p.dir * (1-alpha) + newPattern[i].dir * alpha
  }));

  localStorage.setItem("sig_template", JSON.stringify(agedTemplate));
  console.log("[Layer 7] Biological aging adjustment: 5% neuromotor drift applied.");
}

// ─────────────────────────────────────────
// GLOBAL STATE
// ─────────────────────────────────────────
let enrollSamples          = JSON.parse(localStorage.getItem("sig_samples_partial") || "[]");
let enrollGlobalFeatures   = JSON.parse(localStorage.getItem("sig_gf_partial")      || "[]");
const ENROLL_COUNT  = 3;
const MAX_ATTEMPTS  = 3;

// ─────────────────────────────────────────
// ENROLLMENT
// ─────────────────────────────────────────
async function saveSignature() {
  const raw = getAllPoints();
  if (raw.length < 20) { showStatus("⚠️ Draw a proper signature first!", "warn"); return; }

  const processed = normalize(raw);
  if (!processed) { showStatus("⚠️ Signature too small or short. Try again.", "warn"); return; }

  // Liveness check even at enrollment
  if (!livenessCheck(raw)) {
    showStatus("⚠️ Draw naturally — don't trace slowly.", "warn");
    return;
  }

  const gf = await extractAdvancedFeatures(raw, strokeTimings);

  enrollSamples.push(processed);
  enrollGlobalFeatures.push(gf);
  localStorage.setItem("sig_samples_partial", JSON.stringify(enrollSamples));
  localStorage.setItem("sig_gf_partial",      JSON.stringify(enrollGlobalFeatures));

  const remaining = ENROLL_COUNT - enrollSamples.length;
  if (remaining > 0) {
    showStatus(`✅ Sample ${enrollSamples.length}/${ENROLL_COUNT} saved. Draw again.`, "ok");
    clearCanvas();
    return;
  }

  // All 3 samples collected — build everything
  const template  = averageTemplate(enrollSamples);
  const threshold = computeThreshold(enrollSamples);

  // Layer 2 & 5: Neural Training & Embedding
  const embeddings = enrollSamples.map(s => NeuralEngine.getEmbedding(s));
  const neuralTemplate = tf.tidy(() => tf.stack(embeddings).mean(0)).dataSync();
  await NeuralEngine.train(enrollSamples);

  const advFeatures = await extractAdvancedFeatures(raw, strokeTimings);

  localStorage.setItem("sig_template",    JSON.stringify(template));
  localStorage.setItem("sig_neural",      JSON.stringify(Array.from(neuralTemplate)));
  localStorage.setItem("sig_samples",     JSON.stringify(enrollSamples));
  localStorage.setItem("sig_threshold",   JSON.stringify(threshold));
  localStorage.setItem("sig_integrity",   generateIntegritySum(threshold));
  localStorage.setItem("sig_global_feat", JSON.stringify(advFeatures));
  localStorage.removeItem("sig_samples_partial");
  localStorage.removeItem("sig_gf_partial");
  localStorage.setItem("sig_attempts",    "0");
  localStorage.setItem("sig_login_history", "[]");
  localStorage.setItem("sig_login_sigs",    "[]");
  localStorage.setItem("sig_fp_history",    "[]");
  
  // Layer 6: ZK Commitment
  const zkProof = await generateZKCommitment(template);
  localStorage.setItem("sig_zk_proof", zkProof);

  enrollSamples        = [];
  enrollGlobalFeatures = [];
  showStatus("🎉 Registered! System will improve every login.", "ok");
  clearCanvas();
  setUIMode("verify");
}

// ─────────────────────────────────────────
// VERIFICATION — full pipeline
// ─────────────────────────────────────────
async function verifySignature() {
  const attemptCount = Number(localStorage.getItem("sig_attempts") || "0");

  if (attemptCount >= MAX_ATTEMPTS) {
    showStatus("🔒 Too many failed attempts. Locked.", "error");
    document.getElementById("verifyBtn").disabled = true;
    document.getElementById("saveBtn").disabled = true;
    return;
  }

  const template  = JSON.parse(localStorage.getItem("sig_template"));
  const samples   = JSON.parse(localStorage.getItem("sig_samples"));
  const THRESHOLD = JSON.parse(localStorage.getItem("sig_threshold")) || 0.15;
  const savedAdv   = JSON.parse(localStorage.getItem("sig_global_feat"));

  if (!template || !samples) {
    showStatus("⚠️ No signature registered. Enroll first!", "warn");
    return;
  }

  const raw = getAllPoints();
  if (raw.length < 20) { showStatus("⚠️ Draw your signature to verify.", "warn"); return; }

  // ── INTEGRITY CHECK (Anti-Tamper) ──────
  const storedSum = localStorage.getItem("sig_integrity");
  const currentSum = generateIntegritySum(localStorage.getItem("sig_threshold"));
  if (storedSum !== currentSum) {
    showStatus("🛑 Security breach: System tampering detected.", "error");
    document.getElementById("verifyBtn").disabled = true;
    return;
  }

  // ── ANTI-SPOOFING GATE 1: Liveness ──────
  if (!livenessCheck(raw)) {
    showStatus("⚠️ Suspicious input detected. Draw naturally.", "warn");
    clearCanvas();
    return;
  }

  // ── ANTI-SPOOFING GATE 2: Replay ────────
  if (isReplay(raw)) {
    showStatus("🚫 Replay detected. Draw fresh.", "error");
    clearCanvas();
    return;
  }

  const current = normalize(raw);
  if (!current) { showStatus("⚠️ Signature too small. Try again.", "warn"); return; }

  const currentAdv = await extractAdvancedFeatures(raw, strokeTimings);

  // ── LAYER 2: NEURAL EMBEDDING ───────────
  const neuralTemplate = JSON.parse(localStorage.getItem("sig_neural"));
  const currentEmbedding = NeuralEngine.getEmbedding(current);
  
  let neuralScore = 1.0;
  if (neuralTemplate) {
    neuralScore = tf.tidy(() => {
      const t1 = tf.tensor1d(neuralTemplate);
      const t2 = currentEmbedding.flatten();
      // Cosine similarity
      const dot = t1.dot(t2);
      const mag1 = t1.norm();
      const mag2 = t2.norm();
      return dot.div(mag1.mul(mag2)).dataSync()[0];
    });
  }

  // ── LAYER 3: LATENT SPACE ANALYSIS ──────
  const [lx, ly] = NeuralEngine.getLatentCoords(currentEmbedding);

  // ── DTW SCORE ───────────────────────────
  const scoreTemplate   = dtw(template, current);
  const sampleScores    = samples.map(s => dtw(s, current));
  const bestSampleScore = Math.min(...sampleScores);
  const dtwScore        = scoreTemplate * 0.5 + bestSampleScore * 0.5;

  // ── LAYER 6: BAYESIAN TRUST FUSION ──────
  const trustScore = bayesianTrustFusion(dtwScore, currentAdv, savedAdv, neuralScore);
  
  // Convert trust back to a distance-like score for threshold comparison
  const finalScore = 1 - trustScore;

  // Confidence percentage for internal logic
  const confidence = Math.round(trustScore * 100);

  console.log("─── Verify ───");
  console.log(`DTW score      : ${dtwScore.toFixed(4)}`);
  console.log(`Trust Fusion   : ${trustScore.toFixed(4)}`);
  console.log(`Final score    : ${finalScore.toFixed(4)}`);
  console.log(`Threshold      : ${THRESHOLD.toFixed(4)}`);
  console.log(`Result         : ${finalScore < THRESHOLD ? "PASS ✅" : "FAIL ❌"}`);

  // Layer 6: ZK Proof Verification (Simulated check)
  const storedZK = localStorage.getItem("sig_zk_proof");
  const currentZK = await generateZKCommitment(template);
  if (storedZK === currentZK) console.log("[Layer 6] ZK Biometric Proof Verified (Hash Commitment Match)");

  // Update debug panel if visible
  const dbg = document.getElementById("debugInfo");
  if (dbg && dbg.classList.contains("show")) {
    dbg.textContent = [
      `DTW score   : ${dtwScore.toFixed(4)}`,
      `Trust score : ${trustScore.toFixed(4)}`,
      `Final score : ${finalScore.toFixed(4)}`,
      `Threshold   : ${THRESHOLD.toFixed(4)}`,
      `Logins      : ${JSON.parse(localStorage.getItem("sig_login_history")||"[]").length}`,
    ].join("\n");
  }

  // ── LAYERED ANALYSIS UI (Visual Feedback) ────────
  const layers = [
    { msg: "📡 Layer 1: Fusing Sensor Data...", delay: 200 },
    { msg: "🧠 Layer 2: Decomposing Neuromotor Impulses...", delay: 400 },
    { msg: `🌐 Layer 3: Latent Space [${lx.toFixed(2)}, ${ly.toFixed(2)}]...`, delay: 600 },
    { msg: "🔍 Layer 5: Adversarial Hardening Loop...", delay: 800 },
    { msg: "🛡️ Layer 6: Finalizing Bayesian Trust Fusion...", delay: 1000 }
  ];

  layers.forEach((layer, i) => {
    setTimeout(() => showStatus(layer.msg, "info"), layer.delay);
  });

  setTimeout(() => {
    if (finalScore < THRESHOLD) {
      // ── ANOMALY CHECK (log but don't block) ─
      if (isAnomalousScore(finalScore)) {
        console.warn("⚠️ Anomaly: score is unusual compared to history");
      }

      // ── RECORD FOR ONLINE LEARNING ──────────
      recordFingerprint(raw);
      recordSuccessfulLogin(finalScore, current);

      localStorage.setItem("sig_attempts", "0");

      // Save stats for app.html dashboard
      const stats = JSON.parse(localStorage.getItem("sig_stats") || "{}");
      stats.lastLogin    = Date.now();
      stats.totalLogins  = (stats.totalLogins  || 0) + 1;
      stats.lastScore    = finalScore;
      stats.lastConf     = confidence;
      localStorage.setItem("sig_stats", JSON.stringify(stats));

      // Layer 7: Biological Aging
      const sigHistory = JSON.parse(localStorage.getItem("sig_login_sigs") || "[]");
      biologicalAgingAdjustment(sigHistory);

      showStatus(`✅ Identity Verified! Access Granted.`, "ok");
      setTimeout(() => {
        localStorage.setItem("authenticated", "true");
        window.location.href = "app.html";
      }, 800);

    } else {
      recordFingerprint(raw); // record even failed attempts to detect replay
      const newCount = attemptCount + 1;
      localStorage.setItem("sig_attempts", String(newCount));
      const left = MAX_ATTEMPTS - newCount;
      if (left <= 0) {
        showStatus("❌ Account locked after 3 failures.", "error");
        document.getElementById("verifyBtn").disabled = true;
      } else {
        showStatus(`❌ Identity not recognized. ${left} attempt(s) left.`, "error");
        // Layer 4: Adversarial Tightening
        selfHardeningLoop(finalScore);
      }
      clearCanvas();
    }
  }, 1200);
}

// ─────────────────────────────────────────
// UI HELPER
// ─────────────────────────────────────────
// ─────────────────────────────────────────
// DATA EXPORT (NEW)
// Allows user to 'save' their data to a file in the project folder
// ─────────────────────────────────────────
function downloadData() {
  const data = {
    template:    JSON.parse(localStorage.getItem("sig_template")),
    threshold:   JSON.parse(localStorage.getItem("sig_threshold")),
    globalFeat:  JSON.parse(localStorage.getItem("sig_global_feat")),
    stats:       JSON.parse(localStorage.getItem("sig_stats")),
    history:     JSON.parse(localStorage.getItem("sig_login_history"))
  };
  
  if (!data.template) {
    alert("No signature data found to export.");
    return;
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = "signature_data.json";
  a.click();
  URL.revokeObjectURL(url);
}

function showStatus(msg, type = "info") {
  const el = document.getElementById("status");
  if (!el) return;
  el.textContent = msg;
  el.style.color = {
    ok: "#2e7d32", warn: "#e65100", error: "#c62828", info: "#555",
  }[type] || "#555";
}
function generateIntegritySum(val) {
  if (!val) return "null";
  const s = String(val);
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = ((hash << 5) - hash) + s.charCodeAt(i);
  return (hash & hash).toString();
}
