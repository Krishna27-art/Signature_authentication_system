const Storage = {
  _cache: null,
  async load() {
    try {
      const res  = await fetch("/api/load");
      const json = await res.json();
      this._cache = json.data || {};
      if (this._cache) {
        Object.entries(this._cache).forEach(([k, v]) => {
          if (k !== "_savedAt") localStorage.setItem(k, JSON.stringify(v));
        });
      }
      console.log("[Storage] Loaded from signature_data.json");
    } catch (e) {
      console.warn("[Storage] Server offline — using localStorage fallback.");
      this._cache = {};
    }
    return this._cache;
  },
  async save() {
    const data = {};
    const keys = [
      "sig_template","sig_samples","sig_threshold",
      "sig_adv_feat","sig_login_history","sig_login_sigs",
      "sig_fp_history","sig_stats","sig_attempts",
      "sig_enrolled","sig_samples_partial","sig_af_partial",
    ];
    keys.forEach(k => {
      const v = localStorage.getItem(k);
      if (v !== null) { try { data[k] = JSON.parse(v); } catch { data[k] = v; } }
    });
    try {
      const res  = await fetch("/api/save", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (json.ok) console.log(`[Storage] Saved at ${json.savedAt}`);
    } catch (e) {
      console.warn("[Storage] Server offline — data only in localStorage.");
    }
  },
  async reset() {
    try { await fetch("/api/reset", { method: "DELETE" }); }
    catch (e) { console.warn("[Storage] Could not delete file."); }
  },
  get(key)        { const v = localStorage.getItem(key); return v !== null ? v : null; },
  set(key, value) { localStorage.setItem(key, value); },
  remove(key)     { localStorage.removeItem(key); },
};

window.addEventListener("DOMContentLoaded", async () => { await Storage.load(); });

// ─────────────────────────────────────────
// CANVAS SETUP
// ─────────────────────────────────────────
const canvas = document.getElementById("canvas");
const ctx    = canvas.getContext("2d");
ctx.lineWidth   = 2.5;
ctx.lineCap     = "round";
ctx.lineJoin    = "round";
ctx.strokeStyle = "#1a1a2e";

// CURSOR CONTROL
// During verify: cursor hidden (can't trace the path = harder to replay/spoof).
// During enroll: cursor shown so user can see where they are signing.
let enrollMode = false;

function setEnrollMode(on) {
  enrollMode = on;
  canvas.style.cursor = on ? "crosshair" : "none";
}
setEnrollMode(false); // default: verify mode, no cursor

let drawing       = false;
let points        = [];
let strokes       = [];
let strokeTimings = [];
let sessionStart  = null;

canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  if (!sessionStart) sessionStart = Date.now();
  drawing = true;
  ctx.beginPath();
  const { x, y } = getPos(e);
  ctx.moveTo(x, y);
  points = [{ x, y, t: Date.now(), p: e.pressure || 0.5 }];
  strokeTimings.push({ start: Date.now(), end: null });
});
canvas.addEventListener("pointermove", (e) => {
  e.preventDefault();
  if (!drawing) return;
  const { x, y } = getPos(e);
  points.push({ x, y, t: Date.now(), p: e.pressure || 0.5 });
  ctx.lineTo(x, y);
  ctx.stroke();
});
canvas.addEventListener("pointerup", (e) => {
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
canvas.addEventListener("pointerleave", (e) => {
  if (!drawing) return;
  drawing = false;
  if (points.length > 2) {
    strokes.push([...points]);
    if (strokeTimings.length > 0)
      strokeTimings[strokeTimings.length - 1].end = Date.now();
  }
  points = [];
});

function getPos(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * (canvas.width  / r.width),
    y: (e.clientY - r.top)  * (canvas.height / r.height),
  };
}

function clearCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  points = []; strokes = []; strokeTimings = []; sessionStart = null;
}

function getAllPoints() {
  const all = [...strokes];
  if (points.length > 2) all.push(points);
  return all.flat();
}

// ─────────────────────────────────────────
// ANTI-SPOOFING
// ─────────────────────────────────────────

// Liveness: checks that speed varies naturally.
// A traced/replayed input has unnaturally uniform speed.
function livenessCheck(pts) {
  if (pts.length < 10) return false;
  const speeds = [];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i-1].x, dy = pts[i].y - pts[i-1].y;
    const dt = Math.max(pts[i].t - pts[i-1].t, 1);
    speeds.push(Math.sqrt(dx*dx + dy*dy) / dt);
  }
  const mean     = speeds.reduce((a,b) => a+b, 0) / speeds.length;
  const variance = speeds.reduce((s,v) => s + (v-mean)**2, 0) / speeds.length;
  // CoV > 0.20 means the speed varies enough to be a real human signing
  return (Math.sqrt(variance) / (mean || 1)) > 0.20;
}

// Timing fingerprint: encodes WHEN each segment was drawn.
// Two attempts with nearly identical timing = likely replay.
function timingFingerprint(pts) {
  if (pts.length < 4) return "invalid";
  const step = Math.floor(pts.length / 8);
  const deltas = [];
  for (let i = 1; i < 8; i++) {
    const idx = i * step;
    if (idx < pts.length)
      deltas.push(Math.round((pts[idx].t - pts[idx-1].t) / 10));
  }
  return deltas.join("-");
}

// FIX: diff threshold tightened from 3 → 2.
// Removing the cursor during verify means the user
// cannot visually trace a previous attempt, so any
// near-identical timing is very suspicious.
function isReplay(pts) {
  const fp      = timingFingerprint(pts);
  const history = JSON.parse(Storage.get("sig_fp_history") || "[]");
  return history.some(h => {
    const d1 = fp.split('-').map(Number);
    const d2 = h.split('-').map(Number);
    let diff = 0;
    for (let i = 0; i < d1.length; i++) diff += Math.abs(d1[i] - d2[i]);
    return diff < 2;
  });
}

function recordFingerprint(pts) {
  const fp      = timingFingerprint(pts);
  const history = JSON.parse(Storage.get("sig_fp_history") || "[]");
  history.unshift(fp);
  Storage.set("sig_fp_history", JSON.stringify(history.slice(0, 20)));
}

// ─────────────────────────────────────────
// PREPROCESSING
// ─────────────────────────────────────────
function removeTrailingDot(pts) {
  if (pts.length < 8) return pts;
  const tail = pts.slice(-6), head = pts.slice(-7, -6)[0];
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
  const r = [pts[0]];
  for (let i = 1; i < pts.length; i++)
    if (distance(pts[i], r[r.length-1]) > 2) r.push(pts[i]);
  return r;
}

function resample(pts, n = 64) {
  if (pts.length < 2) return pts;
  const I = pathLength(pts) / (n - 1);
  let D = 0, prev = pts[0];
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    let curr = pts[i], d = distance(prev, curr);
    while (D + d >= I) {
      const t = (I - D) / d;
      const np = {
        x: prev.x + t*(curr.x - prev.x),
        y: prev.y + t*(curr.y - prev.y),
        t: prev.t + t*(curr.t - prev.t),
        p: (prev.p||0.5) + t*((curr.p||0.5) - (prev.p||0.5)),
      };
      out.push(np); prev = np; d = distance(prev, curr); D = 0;
    }
    D += d; prev = curr;
  }
  while (out.length < n) out.push(out[out.length-1]);
  return out.slice(0, n);
}

function scaleToUnit(pts) {
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const size = Math.max(maxX-minX, maxY-minY) || 1;
  return pts.map(p => ({ ...p, x: (p.x-minX)/size, y: (p.y-minY)/size }));
}

function translateToOrigin(pts) {
  const cx = pts.reduce((s,p) => s+p.x, 0)/pts.length;
  const cy = pts.reduce((s,p) => s+p.y, 0)/pts.length;
  return pts.map(p => ({ ...p, x: p.x-cx, y: p.y-cy }));
}

function addVelocity(pts) {
  const totalLen = pathLength(pts) || 1;
  return pts.map((p, i) => {
    if (i === 0) return { ...p, vel: 0 };
    const dx = p.x-pts[i-1].x, dy = p.y-pts[i-1].y;
    const dt = Math.max(p.t-pts[i-1].t, 1);
    return { ...p, vel: Math.min((Math.sqrt(dx*dx+dy*dy)/totalLen)/(dt/1000), 5) };
  });
}

function addDirection(pts) {
  return pts.map((p, i) => ({
    ...p, dir: i===0 ? 0 : Math.atan2(p.y-pts[i-1].y, p.x-pts[i-1].x),
  }));
}

function addCurvature(pts) {
  return pts.map((p, i) => {
    if (i===0 || i===pts.length-1) return { ...p, curv: 0 };
    let diff = (pts[i].dir||0) - (pts[i-1].dir||0);
    while (diff >  Math.PI) diff -= 2*Math.PI;
    while (diff < -Math.PI) diff += 2*Math.PI;
    return { ...p, curv: Math.abs(diff) };
  });
}

function addPressure(pts) {
  const maxVel = Math.max(...pts.map(p => p.vel), 0.001);
  return pts.map(p => ({
    ...p,
    pressure: (p.p && p.p > 0 && p.p < 1)
      ? p.p
      : 1 - Math.min(p.vel/maxVel, 1),
  }));
}

function normalize(pts) {
  let p = removeTrailingDot(pts);
  p = removeJitter(p);
  if (p.length < 5 || pathLength(p) < 50) return null;
  p = resample(p, 64);
  p = scaleToUnit(p);
  p = translateToOrigin(p);
  p = addVelocity(p);
  p = addDirection(p);
  p = addCurvature(p);
  p = addPressure(p);
  return p;
}

// ─────────────────────────────────────────
// DTW
// ─────────────────────────────────────────
function angleDiff(a, b) {
  let d = a - b;
  while (d >  Math.PI) d -= 2*Math.PI;
  while (d < -Math.PI) d += 2*Math.PI;
  return d;
}

function pointDist(a, b) {
  const dx = a.x-b.x, dy = a.y-b.y;
  return Math.sqrt(
    dx*dx + dy*dy +
    ((a.vel||0)     - (b.vel||0))**2     * 0.0025 +
    angleDiff(a.dir||0, b.dir||0)**2     * 0.01   +
    ((a.curv||0)    - (b.curv||0))**2    * 0.0064 +
    ((a.pressure||0)- (b.pressure||0))**2* 0.0025
  );
}

function dtw(s1, s2) {
  const n = s1.length, m = s2.length;
  const w = Math.max(Math.floor(n*0.15), 5);
  const cost = Array.from({ length: n }, () => new Float32Array(m).fill(Infinity));
  cost[0][0] = pointDist(s1[0], s2[0]);
  for (let i = 1; i < n; i++)
    if (i <= w) cost[i][0] = cost[i-1][0] + pointDist(s1[i], s2[0]);
  for (let j = 1; j < m; j++)
    if (j <= w) cost[0][j] = cost[0][j-1] + pointDist(s1[0], s2[j]);
  for (let i = 1; i < n; i++) {
    const jS = Math.max(1,i-w), jE = Math.min(m-1,i+w);
    for (let j = jS; j <= jE; j++)
      cost[i][j] = pointDist(s1[i], s2[j]) +
        Math.min(cost[i-1][j], cost[i][j-1], cost[i-1][j-1]);
  }
  const raw = cost[n-1][m-1];
  return isFinite(raw) ? raw/(n+m) : 999;
}

function averageTemplate(samples) {
  const n = samples[0].length;
  return Array.from({ length: n }, (_, i) => {
    const sinD = samples.reduce((s,sig) => s+Math.sin(sig[i].dir), 0);
    const cosD = samples.reduce((s,sig) => s+Math.cos(sig[i].dir), 0);
    return {
      x:        samples.reduce((s,sig) => s+sig[i].x,        0)/samples.length,
      y:        samples.reduce((s,sig) => s+sig[i].y,        0)/samples.length,
      vel:      samples.reduce((s,sig) => s+sig[i].vel,      0)/samples.length,
      curv:     samples.reduce((s,sig) => s+sig[i].curv,     0)/samples.length,
      pressure: samples.reduce((s,sig) => s+sig[i].pressure, 0)/samples.length,
      dir:      Math.atan2(sinD/samples.length, cosD/samples.length),
    };
  });
}

// FIX: Multiplier reduced 1.5 → 1.0, cap lowered 0.22 → 0.14.
// The old values gave a threshold so large that a rough
// approximation of the signature could pass.
// 1.0× the pairwise spread means: you must sign as similarly
// as you did during enrollment. Natural variation is allowed,
// sloppy forgeries are not.
function computeThreshold(samples) {
  const distances = [];
  for (let i = 0; i < samples.length; i++)
    for (let j = i+1; j < samples.length; j++)
      distances.push(dtw(samples[i], samples[j]));
  const avg = distances.reduce((a,b) => a+b, 0)/distances.length;
  const max = Math.max(...distances);
  // blend of avg and max — capped tightly
  return Math.max(Math.min((avg*0.6 + max*0.4) * 1.0, 0.14), 0.05);
}

// ─────────────────────────────────────────
// ADVANCED FEATURES
// ─────────────────────────────────────────
function extractAdvancedFeatures(rawPts, timings) {
  const pauses = [];
  for (let i = 1; i < timings.length; i++)
    if (timings[i-1].end && timings[i].start)
      pauses.push(timings[i].start - timings[i-1].end);
  const avgPause = pauses.length ? pauses.reduce((a,b) => a+b, 0)/pauses.length : 0;
  const jitter = [];
  for (let i = 2; i < rawPts.length; i++) {
    const dx = rawPts[i].x-rawPts[i-1].x, dy = rawPts[i].y-rawPts[i-1].y;
    const px = rawPts[i-1].x-rawPts[i-2].x, py = rawPts[i-1].y-rawPts[i-2].y;
    jitter.push(Math.sqrt((dx-px)**2+(dy-py)**2));
  }
  return {
    strokeCount: strokes.length,
    totalTime:   rawPts.length > 1 ? rawPts[rawPts.length-1].t - rawPts[0].t : 0,
    avgPause, totalLength: pathLength(rawPts),
    jitter: jitter.length ? jitter.reduce((a,b) => a+b, 0)/jitter.length : 0,
    timeOfDay: new Date().getHours(),
  };
}

// ─────────────────────────────────────────
// ONLINE LEARNING (adaptive threshold)
// ─────────────────────────────────────────
const RETRAIN_EVERY = 5;
const UPGRADE_AFTER = 15;

function recordSuccessfulLogin(score, normalizedSig) {
  const history = JSON.parse(Storage.get("sig_login_history") || "[]");
  history.unshift({ score, ts: Date.now() });
  Storage.set("sig_login_history", JSON.stringify(history.slice(0, 50)));

  const sigHistory = JSON.parse(Storage.get("sig_login_sigs") || "[]");
  sigHistory.unshift(normalizedSig);
  Storage.set("sig_login_sigs", JSON.stringify(sigHistory.slice(0, 20)));

  const count = history.length;
  if (count % RETRAIN_EVERY === 0) {
    const scores = history.map(h => h.score);
    const mean   = scores.reduce((a,b) => a+b, 0)/scores.length;
    const std    = Math.sqrt(scores.reduce((s,v) => s+(v-mean)**2, 0)/scores.length);
    // FIX: was mean + 2*std + 0.02 which kept inflating the threshold upward.
    // Now mean + 1.2*std — closer to your actual distribution, stays tight.
    const newT = Math.max(Math.min(mean + 1.2*std, 0.14), 0.05);
    Storage.set("sig_threshold", JSON.stringify(newT));
    console.log(`[OnlineLearning] Retrained → threshold ${newT.toFixed(4)}`);
  }
  if (count === UPGRADE_AFTER || (count > UPGRADE_AFTER && count % 25 === 0)) {
    if (sigHistory.length >= 5) {
      const newTemplate = averageTemplate(sigHistory.slice(0, 5));
      Storage.set("sig_template", JSON.stringify(newTemplate));
      console.log("[OnlineLearning] Template upgraded from recent logins.");
    }
  }
}

function isAnomalousScore(score) {
  const history = JSON.parse(Storage.get("sig_login_history") || "[]");
  if (history.length < 5) return false;
  const scores = history.slice(0,10).map(h => h.score);
  const mean   = scores.reduce((a,b) => a+b, 0)/scores.length;
  const std    = Math.sqrt(scores.reduce((s,v) => s+(v-mean)**2, 0)/scores.length);
  return score > mean + 3*std;
}

// FIX: Tightened from 2% to 5% per failed attempt.
// Old version barely moved the threshold — a near-miss
// attacker could try many times with no real penalty.
function selfHardening(failedScore) {
  const t = JSON.parse(Storage.get("sig_threshold")) || 0.15;
  if (failedScore < t * 1.15) {
    const hardened = Math.max(t * 0.95, 0.05);
    Storage.set("sig_threshold", JSON.stringify(hardened));
    console.log(`[Hardening] Threshold tightened → ${hardened.toFixed(4)}`);
  }
}

// ─────────────────────────────────────────
// HELPERS
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
let enrollSamples = JSON.parse(Storage.get("sig_samples_partial") || "[]");
let enrollAdvFeat = JSON.parse(Storage.get("sig_af_partial")      || "[]");
const ENROLL_COUNT = 3;
const MAX_ATTEMPTS = 3;

// ─────────────────────────────────────────
// ENROLLMENT
// ─────────────────────────────────────────
async function saveSignature() {
  setEnrollMode(true); // show cursor during enroll

  const raw = getAllPoints();
  if (raw.length < 20) { showStatus("Draw a proper signature first!", "warn"); return; }
  if (!livenessCheck(raw)) { showStatus("Draw naturally — don't trace slowly.", "warn"); return; }

  const processed = normalize(raw);
  if (!processed) { showStatus("Signature too small or short. Try again.", "warn"); return; }

  const af = extractAdvancedFeatures(raw, strokeTimings);
  enrollSamples.push(processed);
  enrollAdvFeat.push(af);
  Storage.set("sig_samples_partial", JSON.stringify(enrollSamples));
  Storage.set("sig_af_partial",      JSON.stringify(enrollAdvFeat));

  const remaining = ENROLL_COUNT - enrollSamples.length;
  if (remaining > 0) {
    showStatus(`Sample ${enrollSamples.length}/${ENROLL_COUNT} saved. Draw again.`, "ok");
    clearCanvas(); return;
  }

  const template  = averageTemplate(enrollSamples);
  const threshold = computeThreshold(enrollSamples);
  const avgAF = {
    strokeCount: enrollAdvFeat.reduce((s,f) => s+f.strokeCount, 0)/enrollAdvFeat.length,
    avgPause:    enrollAdvFeat.reduce((s,f) => s+f.avgPause,    0)/enrollAdvFeat.length,
    jitter:      enrollAdvFeat.reduce((s,f) => s+f.jitter,      0)/enrollAdvFeat.length,
    timeOfDay:   enrollAdvFeat[0].timeOfDay,
  };

  Storage.set("sig_template",      JSON.stringify(template));
  Storage.set("sig_samples",       JSON.stringify(enrollSamples));
  Storage.set("sig_threshold",     JSON.stringify(threshold));
  Storage.set("sig_adv_feat",      JSON.stringify(avgAF));
  Storage.set("sig_attempts",      "0");
  Storage.set("sig_login_history", "[]");
  Storage.set("sig_login_sigs",    "[]");
  Storage.set("sig_fp_history",    "[]");
  Storage.set("sig_enrolled",      "true");
  Storage.remove("sig_samples_partial");
  Storage.remove("sig_af_partial");

  await Storage.save();

  enrollSamples = []; enrollAdvFeat = [];
  setEnrollMode(false); // back to verify mode, hide cursor
  showStatus("Registered! You can now verify.", "ok");
  clearCanvas();
}

// ─────────────────────────────────────────
// VERIFICATION
// ─────────────────────────────────────────
async function verifySignature() {
  setEnrollMode(false); // ensure cursor hidden during verify

  const attemptCount = Number(Storage.get("sig_attempts") || "0");
  if (attemptCount >= MAX_ATTEMPTS) {
    showStatus("Too many failed attempts. Locked.", "error");
    document.getElementById("verifyBtn").disabled = true;
    document.getElementById("saveBtn").disabled   = true;
    return;
  }

  const template  = JSON.parse(Storage.get("sig_template"));
  const samples   = JSON.parse(Storage.get("sig_samples"));
  const THRESHOLD = JSON.parse(Storage.get("sig_threshold")) || 0.12;

  if (!template || !samples) { showStatus("No signature registered. Enroll first!", "warn"); return; }

  const raw = getAllPoints();
  if (raw.length < 20) { showStatus("Draw your signature to verify.", "warn"); return; }

  if (!livenessCheck(raw)) {
    showStatus("Suspicious input. Sign naturally.", "warn");
    clearCanvas(); return;
  }
  if (isReplay(raw)) {
    showStatus("Replay detected. Draw fresh.", "error");
    clearCanvas(); return;
  }

  const current = normalize(raw);
  if (!current) { showStatus("Signature too small. Try again.", "warn"); return; }

  const scoreTemplate = dtw(template, current);
  const bestSample    = Math.min(...samples.map(s => dtw(s, current)));
  const finalScore    = scoreTemplate * 0.5 + bestSample * 0.5;

  console.log("─── Verify ─────────────────────────────");
  console.log(`Template    : ${scoreTemplate.toFixed(4)}`);
  console.log(`Best sample : ${bestSample.toFixed(4)}`);
  console.log(`Final score : ${finalScore.toFixed(4)}`);
  console.log(`Threshold   : ${THRESHOLD.toFixed(4)}`);
  console.log(`Result      : ${finalScore < THRESHOLD ? "PASS ✅" : "FAIL ❌"}`);

  const dbg = document.getElementById("debugInfo");
  if (dbg && dbg.classList.contains("show")) {
    const logins = JSON.parse(Storage.get("sig_login_history") || "[]").length;
    dbg.textContent = [
      `Score     : ${finalScore.toFixed(4)}`,
      `Threshold : ${THRESHOLD.toFixed(4)}`,
      `Logins    : ${logins}`,
      `Next retrain in : ${RETRAIN_EVERY - (logins % RETRAIN_EVERY)} login(s)`,
    ].join("\n");
  }

  if (finalScore < THRESHOLD) {
    if (isAnomalousScore(finalScore))
      console.warn("[Anomaly] Unusual score — flagged but access granted.");

    recordFingerprint(raw);
    recordSuccessfulLogin(finalScore, current);
    Storage.set("sig_attempts", "0");

    const stats = JSON.parse(Storage.get("sig_stats") || "{}");
    stats.lastLogin   = Date.now();
    stats.totalLogins = (stats.totalLogins || 0) + 1;
    stats.lastScore   = finalScore;
    Storage.set("sig_stats", JSON.stringify(stats));

    await Storage.save();

    // No confidence % shown — just a clean pass message
    showStatus("Verified!", "ok");
    setTimeout(() => {
      localStorage.setItem("authenticated", "true");
      window.location.href = "app.html";
    }, 800);

  } else {
    recordFingerprint(raw);
    selfHardening(finalScore);
    const newCount = attemptCount + 1;
    Storage.set("sig_attempts", String(newCount));
    const left = MAX_ATTEMPTS - newCount;
    if (left <= 0) {
      showStatus("Account locked after 3 failures.", "error");
      document.getElementById("verifyBtn").disabled = true;
    } else {
      showStatus(`Not matched. ${left} attempt(s) left.`, "error");
    }
    clearCanvas();
  }
}

// ─────────────────────────────────────────
// UI HELPER
// ─────────────────────────────────────────
function showStatus(msg, type = "info") {
  const el = document.getElementById("status");
  if (!el) return;
  el.textContent = msg;
  el.className   = "";
  if (type === "ok")    el.classList.add("ok");
  if (type === "warn")  el.classList.add("warn");
  if (type === "error") el.classList.add("error");
}