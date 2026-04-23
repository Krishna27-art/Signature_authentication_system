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
});

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
canvas.addEventListener("mousedown", (e) => {
  if (!sessionStart) sessionStart = Date.now();
  drawing = true;
  ctx.beginPath();
  const { x, y } = getPos(e);
  ctx.moveTo(x, y);
  points = [{ x, y, t: Date.now() }];
  strokeTimings.push({ start: Date.now(), end: null });
});

canvas.addEventListener("mouseup", () => {
  if (!drawing) return;
  drawing = false;
  if (points.length > 2) {
    strokes.push([...points]);
    if (strokeTimings.length > 0)
      strokeTimings[strokeTimings.length - 1].end = Date.now();
  }
  points = [];
});

canvas.addEventListener("mouseleave", () => {
  if (!drawing) return;
  drawing = false;
  if (points.length > 2) {
    strokes.push([...points]);
    if (strokeTimings.length > 0)
      strokeTimings[strokeTimings.length - 1].end = Date.now();
  }
  points = [];
});

canvas.addEventListener("mousemove", (e) => {
  if (!drawing) return;
  const { x, y } = getPos(e);
  points.push({ x, y, t: Date.now() });
  ctx.lineTo(x, y);
  ctx.stroke();
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
  // Check if this exact fingerprint appeared in last 10 attempts
  return history.includes(fp);
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
// GLOBAL SIGNATURE FEATURES (NEW)
// Stroke-level features that describe the whole
// signature — not per-point. Compared separately.
// ─────────────────────────────────────────
function extractGlobalFeatures(rawPts, strokeTimingsData) {
  const totalTime = rawPts.length > 1
    ? rawPts[rawPts.length-1].t - rawPts[0].t : 0;

  // Inter-stroke pauses: time between end of stroke N and start of stroke N+1
  const pauses = [];
  for (let i = 1; i < strokeTimingsData.length; i++) {
    const prev = strokeTimingsData[i-1];
    const curr = strokeTimingsData[i];
    if (prev.end && curr.start) pauses.push(curr.start - prev.end);
  }
  const avgPause = pauses.length
    ? pauses.reduce((a,b) => a+b, 0) / pauses.length : 0;

  return {
    strokeCount:  strokes.length,
    totalTime,
    avgPause,
    totalLength:  pathLength(rawPts),
  };
}

function globalFeatureDist(a, b) {
  // Normalise each dimension then compute distance
  const scNorm  = Math.abs(a.strokeCount - b.strokeCount) / Math.max(a.strokeCount, b.strokeCount, 1);
  const timNorm = Math.abs(a.totalTime   - b.totalTime)   / Math.max(a.totalTime,   b.totalTime,   1);
  const pauseN  = Math.abs(a.avgPause    - b.avgPause)    / Math.max(a.avgPause,    b.avgPause,    100);
  const lenNorm = Math.abs(a.totalLength - b.totalLength) / Math.max(a.totalLength, b.totalLength, 1);
  // Weighted: stroke count and pause are most discriminative
  return scNorm*0.4 + pauseN*0.3 + timNorm*0.2 + lenNorm*0.1;
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

  const gf = extractGlobalFeatures(raw, strokeTimings);

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

  // Average global features across enrollment
  const avgGF = {
    strokeCount:  enrollGlobalFeatures.reduce((s,g) => s+g.strokeCount,  0) / ENROLL_COUNT,
    totalTime:    enrollGlobalFeatures.reduce((s,g) => s+g.totalTime,    0) / ENROLL_COUNT,
    avgPause:     enrollGlobalFeatures.reduce((s,g) => s+g.avgPause,     0) / ENROLL_COUNT,
    totalLength:  enrollGlobalFeatures.reduce((s,g) => s+g.totalLength,  0) / ENROLL_COUNT,
  };

  localStorage.setItem("sig_template",    JSON.stringify(template));
  localStorage.setItem("sig_samples",     JSON.stringify(enrollSamples));
  localStorage.setItem("sig_threshold",   JSON.stringify(threshold));
  localStorage.setItem("sig_global_feat", JSON.stringify(avgGF));
  localStorage.removeItem("sig_samples_partial");
  localStorage.removeItem("sig_gf_partial");
  localStorage.setItem("sig_attempts",    "0");
  localStorage.setItem("sig_login_history", "[]");
  localStorage.setItem("sig_login_sigs",    "[]");
  localStorage.setItem("sig_fp_history",    "[]");

  enrollSamples        = [];
  enrollGlobalFeatures = [];
  showStatus("🎉 Registered! Now please verify your identity.", "ok");
  clearCanvas();
  setUIMode("verify");
}

// ─────────────────────────────────────────
// VERIFICATION — full pipeline
// ─────────────────────────────────────────
function verifySignature() {
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
  const savedGF   = JSON.parse(localStorage.getItem("sig_global_feat"));

  if (!template || !samples) {
    showStatus("⚠️ No signature registered. Enroll first!", "warn");
    return;
  }

  const raw = getAllPoints();
  if (raw.length < 20) { showStatus("⚠️ Draw your signature to verify.", "warn"); return; }

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

  const currentGF = extractGlobalFeatures(raw, strokeTimings);

  // ── DTW SCORE ───────────────────────────
  const scoreTemplate   = dtw(template, current);
  const sampleScores    = samples.map(s => dtw(s, current));
  const bestSampleScore = Math.min(...sampleScores);
  const dtwScore        = scoreTemplate * 0.5 + bestSampleScore * 0.5;

  // ── GLOBAL FEATURES SCORE (NEW) ─────────
  // Stroke count, timing, rhythm comparison
  const gfScore = savedGF ? globalFeatureDist(savedGF, currentGF) : 0;

  // ── FINAL COMBINED SCORE ────────────────
  // 80% DTW shape + 20% global features (rhythm, count)
  const finalScore = dtwScore * 0.80 + gfScore * 0.20;

  // Confidence percentage for display
  const confidence = Math.max(0, Math.min(100, Math.round((1 - finalScore/THRESHOLD) * 100)));

  console.log("─── Verify ───");
  console.log(`DTW score      : ${dtwScore.toFixed(4)}`);
  console.log(`Global feat    : ${gfScore.toFixed(4)}`);
  console.log(`Final score    : ${finalScore.toFixed(4)}`);
  console.log(`Threshold      : ${THRESHOLD.toFixed(4)}`);
  console.log(`Result         : ${finalScore < THRESHOLD ? "PASS ✅" : "FAIL ❌"}`);

  // Update debug panel if visible
  const dbg = document.getElementById("debugInfo");
  if (dbg && dbg.classList.contains("show")) {
    dbg.textContent = [
      `DTW score   : ${dtwScore.toFixed(4)}`,
      `Global feat : ${gfScore.toFixed(4)}`,
      `Final score : ${finalScore.toFixed(4)}`,
      `Threshold   : ${THRESHOLD.toFixed(4)}`,
      `Confidence  : ${confidence}%`,
      `Logins      : ${JSON.parse(localStorage.getItem("sig_login_history")||"[]").length}`,
    ].join("\n");
  }

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

    showStatus(`✅ Identity Verified! Redirecting...`, "ok");
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
      showStatus(`❌ Not matched. ${left} attempt(s) left.`, "error");
    }
    clearCanvas();
  }
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