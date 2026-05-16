const Storage = {
  _cache: null,
  async load() {
    try {
      const res = await fetch("/api/load");
      const json = await res.json();
      this._cache = json.data || {};
      if (this._cache) {
        Object.entries(this._cache).forEach(([k, v]) => {
          if (k !== "_savedAt") localStorage.setItem(k, JSON.stringify(v));
        });
      }
      console.log("[Storage] Loaded from server");
    } catch (e) {
      console.warn("[Storage] Server offline — using localStorage fallback.");
      this._cache = {};
    }
    return this._cache;
  },
  getJSON(key, fallback) {
    const raw = this.get(key);
    if (raw == null) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  async save() {
    const data = {};
    const keys = [
      "sig_template", "sig_samples", "sig_threshold",
      "sig_adv_feat", "sig_login_history", "sig_login_sigs",
      "sig_fp_history", "sig_stats", "sig_attempts",
      "sig_enrolled", "sig_samples_partial", "sig_af_partial",
      "sig_quality_scores", "sig_feature_weights", "sig_warp_paths",
      "sig_enrollment_ts", "sig_calibration_data", "sig_stroke_models",
      "sig_entropy_baseline", "sig_time_models",
    ];
    keys.forEach(k => {
      const v = localStorage.getItem(k);
      if (v !== null) {
        try { data[k] = JSON.parse(v); }
        catch { data[k] = v; }
      }
    });
    try {
      const res = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) throw new Error(`Save failed: ${res.status}`);
      const json = await res.json();
      if (json.ok) console.log(`[Storage] Saved at ${json.savedAt}`);
    } catch (e) {
      console.warn("[Storage] Server offline — data only in localStorage.");
    }
  },
  async reset() {
    try { await fetch("/api/reset", { method: "DELETE" }); }
    catch (e) { console.warn("[Storage] Could not delete delete file."); }
  },
  get(key) {
    const v = localStorage.getItem(key);
    return v !== null ? v : null;
  },
  set(key, value) {
    // Always store as JSON for consistency
    if (typeof value !== "string") {
      localStorage.setItem(key, JSON.stringify(value));
    } else {
      localStorage.setItem(key, value);
    }
  },
  remove(key) {
    localStorage.removeItem(key);
  },
};

// ─────────────────────────────────────────────────────────────────
// CANVAS SETUP
// ─────────────────────────────────────────────────────────────────
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
ctx.lineWidth = 2.5;
ctx.lineCap = "round";
ctx.lineJoin = "round";
ctx.strokeStyle = "#1a1a2e";

let enrollMode = false;

function setEnrollMode(on) {
  enrollMode = on;
  canvas.style.cursor = on ? "crosshair" : "none";
}
setEnrollMode(false);

let drawing = false;
let points = [];
let strokes = [];
let strokeTimings = [];
let sessionStart = null;
let rawPressures = [];
let pointerType = null; // Track input type (pen, touch, mouse)
let lastPoint = null;

canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  pointerType = e.pointerType || "mouse";
  if (!sessionStart) sessionStart = Date.now();
  drawing = true;
  const { x, y } = getPos(e);
  lastPoint = { x, y };
  ctx.beginPath();
  ctx.moveTo(x, y);
  const pressure = (e.pressure > 0 && e.pressure < 1) ? e.pressure : 0.5;
  points = [{ x, y, t: Date.now(), p: pressure, type: pointerType }];
  rawPressures = [pressure];
  strokeTimings.push({ start: Date.now(), end: null });
});

canvas.addEventListener("pointermove", (e) => {
  e.preventDefault();
  if (!drawing) return;
  const { x, y } = getPos(e);
  const pressure = (e.pressure > 0 && e.pressure < 1) ? e.pressure : 0.5;
  points.push({ x, y, t: Date.now(), p: pressure, type: pointerType });
  rawPressures.push(pressure);

  ctx.beginPath();
  ctx.moveTo(lastPoint.x, lastPoint.y);
  ctx.lineTo(x, y);
  ctx.stroke();
  lastPoint = { x, y };
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
  rawPressures = [];
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
  rawPressures = [];
});

function getPos(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * (canvas.width / r.width),
    y: (e.clientY - r.top) * (canvas.height / r.height),
  };
}

function clearCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  points = [];
  strokes = [];
  strokeTimings = [];
  sessionStart = null;
  rawPressures = [];
  pointerType = null;
}

function getAllPoints() {
  const all = [...strokes];
  if (points.length > 2) all.push(points);
  return all.flat();
}

function getAllStrokes() {
  const all = [...strokes];
  if (points.length > 2) all.push(points);
  return all;
}

// ─────────────────────────────────────────────────────────────────
// ENHANCED ANTI-SPOOFING
// ─────────────────────────────────────────────────────────────────

// NEW: Multi-factor liveness check
function livenessCheck(pts) {
  if (pts.length < 10) return false;

  const speeds = [];
  const accelerations = [];

  for (var i = 1; i < pts.length; i++) {
    var dx = pts[i].x - pts[i-1].x;
    var dy = pts[i].y - pts[i-1].y;
    var dt = Math.max(pts[i].t - pts[i-1].t, 1);
    var speed = Math.sqrt(dx*dx + dy*dy) / dt;
    speeds.push(speed);

    // acceleration variation
    if (i > 1) {
      accelerations.push(Math.abs(speed - speeds[i-2]));
    }
  }

  // speed statistics
  var mean = speeds.reduce(function(a,b){return a+b;},0) / speeds.length;
  var variance = speeds.reduce(function(s,v){return s+(v-mean)**2;},0) / speeds.length;
  var stdDev = Math.sqrt(variance);
  var cov = stdDev / (mean || 1);

  // acceleration statistics
  var accMean = accelerations.reduce(function(a,b){return a+b;},0) / (accelerations.length || 1);
  var accVar = accelerations.reduce(function(s,v){return s+(v-accMean)**2;},0) / (accelerations.length || 1);
  var accStd = Math.sqrt(accVar);
  var accCov = accStd / (accMean || 1);

  // Human signatures: irregular speed + irregular acceleration
  return cov > 0.35 && accCov > 0.25;
}

// NEW: Multi-resolution timing fingerprint
function timingFingerprint(pts, resolution) {
  resolution = resolution || 8;
  if (pts.length < 4) return "invalid";
  const step = Math.max(1, Math.floor(pts.length / resolution));
  const deltas = [];
  for (let i = 1; i < resolution; i++) {
    const idx = Math.min(i * step, pts.length - 1);
    const prevIdx = Math.min((i - 1) * step, pts.length - 1);
    deltas.push(Math.round((pts[idx].t - pts[prevIdx].t) / 10));
  }
  return deltas.join("-");
}

// NEW: Spatial-temporal fingerprint
function spatialTemporalFingerprint(pts) {
  if (pts.length < 10) return null;
  const segments = 6;
  const step = Math.floor(pts.length / segments);
  const features = [];

  for (let i = 0; i < segments; i++) {
    const start = i * step;
    const end = Math.min((i + 1) * step, pts.length - 1);
    let dx = 0, dy = 0, dt = 1;
    for (let j = start + 1; j <= end; j++) {
      dx += pts[j].x - pts[j - 1].x;
      dy += pts[j].y - pts[j - 1].y;
      dt += pts[j].t - pts[j - 1].t;
    }
    const dir = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 4;
    const speed = Math.round(Math.sqrt(dx * dx + dy * dy) / (dt / 100));
    features.push(dir + ":" + speed);
  }
  return features.join("|");
}

// NEW: Pressure pattern fingerprint
function pressureFingerprint(pressures) {
  if (pressures.length < 10) return null;
  const segments = 5;
  const step = Math.floor(pressures.length / segments);
  const features = [];

  for (let i = 0; i < segments; i++) {
    const start = i * step;
    const end = Math.min((i + 1) * step, pressures.length);
    let sum = 0;
    for (let j = start; j < end; j++) sum += pressures[j];
    features.push(Math.round((sum / (end - start)) * 100));
  }
  return features.join("-");
}

// ENHANCED: Replay detection with multiple fingerprints
function isReplay(pts, pressures) {
  const fpTime = timingFingerprint(pts, 8);
  const fpTimeFine = timingFingerprint(pts, 16);
  const fpSpatial = spatialTemporalFingerprint(pts);
  const fpPressure = pressureFingerprint(pressures || []);

  const history = JSON.parse(Storage.get("sig_fp_history") || "[]");

  return history.some(function (h) {
    // Check coarse timing
    const d1 = fpTime.split("-").map(Number);
    const d2 = (h.time || "").split("-").map(Number);
    if (d1.length === d2.length && d1.length > 0) {
      let diff = 0;
      for (let i = 0; i < d1.length; i++) diff += Math.abs(d1[i] - d2[i]);
      if (diff < 2) return true;
    }

    // Check fine timing
    const f1 = fpTimeFine.split("-").map(Number);
    const f2 = (h.timeFine || "").split("-").map(Number);
    if (f1.length === f2.length && f1.length > 0) {
      let fineDiff = 0;
      for (let i = 0; i < f1.length; i++) fineDiff += Math.abs(f1[i] - f2[i]);
      if (fineDiff < 4) return true;
    }

    // Check spatial-temporal
    if (h.spatial && fpSpatial) {
      const s1 = fpSpatial.split("|");
      const s2 = h.spatial.split("|");
      if (s1.length === s2.length) {
        let spatialMatch = 0;
        for (let i = 0; i < s1.length; i++) {
          if (s1[i] === s2[i]) spatialMatch++;
        }
        if (spatialMatch >= s1.length * 0.85) return true;
      }
    }

    // Check pressure pattern
    if (h.pressure && fpPressure) {
      const p1 = fpPressure.split("-").map(Number);
      const p2 = h.pressure.split("-").map(Number);
      if (p1.length === p2.length && p1.length > 0) {
        let pDiff = 0;
        for (let i = 0; i < p1.length; i++) pDiff += Math.abs(p1[i] - p2[i]);
        if (pDiff < 15) return true;
      }
    }

    return false;
  });
}

function recordFingerprint(pts, pressures) {
  pressures = pressures || [];
  const fp = {
    time: timingFingerprint(pts, 8),
    timeFine: timingFingerprint(pts, 16),
    spatial: spatialTemporalFingerprint(pts),
    pressure: pressureFingerprint(pressures),
    ts: Date.now(),
  };
  const history = JSON.parse(Storage.get("sig_fp_history") || "[]");
  history.unshift(fp);
  Storage.set("sig_fp_history", JSON.stringify(history.slice(0, 30)));
}

// ─────────────────────────────────────────────────────────────────
// IMPROVED PREPROCESSING
// ─────────────────────────────────────────────────────────────────
function removeTrailingDot(pts) {
  if (pts.length < 8) return pts;
  const tail = pts.slice(-6);
  const head = pts.slice(-7, -6)[0];
  if (!head) return pts;
  let maxSpread = 0;
  for (let i = 0; i < tail.length; i++)
    for (let j = i + 1; j < tail.length; j++)
      maxSpread = Math.max(maxSpread, distance(tail[i], tail[j]));
  if (maxSpread < 6 && (tail[0].t - head.t) > 200) return pts.slice(0, -6);
  return pts;
}

function removeLeadingDot(pts) {
  if (pts.length < 8) return pts;
  const head = pts.slice(0, 6);
  const next = pts[6];
  if (!next) return pts;
  let maxSpread = 0;
  for (let i = 0; i < head.length; i++)
    for (let j = i + 1; j < head.length; j++)
      maxSpread = Math.max(maxSpread, distance(head[i], head[j]));
  if (maxSpread < 6 && (next.t - head[head.length - 1].t) > 150) return pts.slice(6);
  return pts;
}

function removeJitter(pts) {
  if (!pts.length) return pts;
  const r = [pts[0]];
  for (let i = 1; i < pts.length; i++)
    if (distance(pts[i], r[r.length - 1]) > 1.5) r.push(pts[i]);
  return r;
}

function smoothPoints(pts, windowSize) {
  windowSize = windowSize || 3;
  if (pts.length < windowSize * 2) return pts;
  const result = [];
  const half = Math.floor(windowSize / 2);
  for (let i = 0; i < pts.length; i++) {
    if (i < half || i >= pts.length - half) {
      result.push(pts[i]);
      continue;
    }
    let sx = 0, sy = 0, sp = 0;
    for (let j = -half; j <= half; j++) {
      sx += pts[i + j].x;
      sy += pts[i + j].y;
      sp += pts[i + j].p || 0.5;
    }
    result.push({
      x: sx / windowSize,
      y: sy / windowSize,
      t: pts[i].t,
      p: sp / windowSize,
    });
  }
  return result;
}

function resample(pts, n) {
  n = n || 100;
  if (pts.length < 2) return pts;
  const I = pathLength(pts) / (n - 1);
  let D = 0;
  let prev = pts[0];
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    let curr = pts[i];
    let d = distance(prev, curr);
    while (D + d >= I) {
      const t = (I - D) / d;
      const np = {
        x: prev.x + t * (curr.x - prev.x),
        y: prev.y + t * (curr.y - prev.y),
        t: prev.t + t * (curr.t - prev.t),
        p: (prev.p || 0.5) + t * ((curr.p || 0.5) - (prev.p || 0.5)),
      };
      out.push(np);
      prev = np;
      d = distance(prev, curr);
      D = 0;
    }
    D += d;
    prev = curr;
  }
  while (out.length < n) out.push(out[out.length - 1]);
  return out.slice(0, n);
}

function scaleToUnit(pts) {
  const xs = pts.map(function (p) { return p.x; });
  const ys = pts.map(function (p) { return p.y; });
  const minX = Math.min.apply(null, xs);
  const maxX = Math.max.apply(null, xs);
  const minY = Math.min.apply(null, ys);
  const maxY = Math.max.apply(null, ys);
  const size = Math.max(maxX - minX, maxY - minY) || 1;
  return pts.map(function (p) {
    return { x: (p.x - minX) / size, y: (p.y - minY) / size, t: p.t, p: p.p };
  });
}

function translateToOrigin(pts) {
  const cx = pts.reduce(function (s, p) { return s + p.x; }, 0) / pts.length;
  const cy = pts.reduce(function (s, p) { return s + p.y; }, 0) / pts.length;
  return pts.map(function (p) {
    return { x: p.x - cx, y: p.y - cy, t: p.t, p: p.p };
  });
}

function addVelocity(pts) {
  const totalLen = pathLength(pts) || 1;
  return pts.map(function (p, i) {
    if (i === 0) return Object.assign({}, p, { vel: 0 });
    const dx = p.x - pts[i - 1].x;
    const dy = p.y - pts[i - 1].y;
    const dt = Math.max(p.t - pts[i - 1].t, 1);
    return Object.assign({}, p, {
      vel: Math.min((Math.sqrt(dx * dx + dy * dy) / totalLen) / (dt / 1000), 5),
    });
  });
}

// NEW: Add acceleration (change in velocity)
function addAcceleration(pts) {
  return pts.map(function (p, i) {
    if (i === 0 || i === 1) return Object.assign({}, p, { accel: 0 });
    const dv = p.vel - pts[i - 1].vel;
    const dt = Math.max(p.t - pts[i - 1].t, 1);
    return Object.assign({}, p, { accel: dv / (dt / 1000) });
  });
}

function addDirection(pts) {
  return pts.map(function (p, i) {
    return Object.assign({}, p, {
      dir: i === 0 ? 0 : Math.atan2(p.y - pts[i - 1].y, p.x - pts[i - 1].x),
    });
  });
}

function addCurvature(pts) {
  return pts.map(function (p, i) {
    if (i === 0 || i === pts.length - 1) return Object.assign({}, p, { curv: 0 });
    let diff = (pts[i].dir || 0) - (pts[i - 1].dir || 0);
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    return Object.assign({}, p, { curv: Math.abs(diff) });
  });
}

function addPressure(pts) {
  const maxVel = Math.max.apply(null, pts.map(function (p) { return p.vel; })) || 0.001;
  return pts.map(function (p) {
    return Object.assign({}, p, {
      pressure: p.p && p.p > 0 && p.p < 1 ? p.p : 1 - Math.min(p.vel / maxVel, 1),
    });
  });
}

// NEW: Add jerk (rate of change of acceleration) - captures micro-movements
function addJerk(pts) {
  return pts.map(function (p, i) {
    if (i === 0 || i === 1 || i === 2) return Object.assign({}, p, { jerk: 0 });
    const da = p.accel - pts[i - 1].accel;
    const dt = Math.max(p.t - pts[i - 1].t, 1);
    return Object.assign({}, p, { jerk: da / (dt / 1000) });
  });
}

// NEW: Add stroke boundary markers
function addStrokeInfo(pts, allStrokes) {
  var offset = 0;
  var boundaries = {};
  allStrokes.forEach(function (stroke) {
    boundaries[offset] = true;
    offset += stroke.length;
  });
  return pts.map(function (p, i) {
    return Object.assign({}, p, { isStrokeStart: boundaries[i] ? 1 : 0 });
  });
}

function normalize(pts, allStrokes) {
  var p = removeTrailingDot(pts);
  p = removeLeadingDot(p);
  p = removeJitter(p);
  p = smoothPoints(p, 3);

  if (p.length < 10 || pathLength(p) < 50) return null;

  // Compute stroke info BEFORE resampling to preserve accurate boundaries
  var strokeInfo = null;
  if (allStrokes) {
    strokeInfo = addStrokeInfo(p, allStrokes);
  }

  p = resample(p, 64); // Reduced from 100 to 64 for better performance
  p = scaleToUnit(p);
  p = translateToOrigin(p);
  p = addVelocity(p);
  p = addAcceleration(p);
  p = addDirection(p);
  p = addCurvature(p);
  p = addPressure(p);
  p = addJerk(p);

  // Note: strokeInfo is not re-applied after resampling since boundaries no longer align
  // If stroke boundaries are needed post-resampling, compute them differently

  return p;
}

// ─────────────────────────────────────────────────────────────────
// IMPROVED DTW WITH LEARNABLE FEATURE WEIGHTS
// ─────────────────────────────────────────────────────────────────
function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

// NEW: Learn which features matter most for THIS user's signature
function learnFeatureWeights(samples) {
  if (samples.length < 3) return getDefaultWeights();

  var n = samples[0].length;
  var features = ["x", "y", "vel", "accel", "dir", "curv", "pressure", "jerk"];
  var variances = {};
  features.forEach(function (f) { variances[f] = 0; });

  for (var i = 0; i < n; i++) {
    var values = {};
    features.forEach(function (f) { values[f] = []; });

    samples.forEach(function (sample) {
      if (sample[i]) {
        features.forEach(function (f) {
          values[f].push(sample[i][f] || 0);
        });
      }
    });

    features.forEach(function (f) {
      if (!values[f].length) return;
      var mean = values[f].reduce(function (a, b) { return a + b; }, 0) / values[f].length;
      var v = values[f].reduce(function (s, val) { return s + (val - mean) * (val - mean); }, 0) / values[f].length;
      variances[f] += v;
    });
  }

  // Lower variance = more consistent = more discriminative = higher weight
  var weights = {};
  var maxVar = Math.max.apply(null, Object.values(variances).concat([0.001]));

  features.forEach(function (f) {
    weights[f] = 1 - (variances[f] / maxVar) * 0.7;
    weights[f] = Math.max(weights[f], 0.1);
  });

  // Position features always important
  weights.x = Math.max(weights.x, 0.8);
  weights.y = Math.max(weights.y, 0.8);

  return weights;
}

function getDefaultWeights() {
  return {
    x: 1.0,
    y: 1.0,
    vel: 0.5,
    accel: 0.15,
    dir: 0.8,
    curv: 0.25,
    pressure: 0.25,
    jerk: 0.08,
  };
}

var cachedWeights = null;

function getWeights() {
  if (!cachedWeights) {
    var stored = JSON.parse(Storage.get("sig_feature_weights"));
    cachedWeights = stored || getDefaultWeights();
  }
  return cachedWeights;
}

function pointDist(a, b, weights) {
  weights = weights || getWeights();
  var dx = a.x - b.x;
  var dy = a.y - b.y;

  // velocity difference
  var dv = ((a.vel || 0) - (b.vel || 0)) * 0.08;

  // direction difference
  var dd = angleDiff(a.dir || 0, b.dir || 0) * 0.16;

  // curvature difference
  var dc = ((a.curv || 0) - (b.curv || 0)) * 0.15;

  // pressure difference
  var dp = ((a.pressure || 0) - (b.pressure || 0)) * 0.10;

  // acceleration difference
  var da = ((a.accel || 0) - (b.accel || 0)) * 0.08;

  return Math.sqrt(
    dx * dx * weights.x +
    dy * dy * weights.y +
    dv * dv +
    dd * dd +
    dc * dc +
    dp * dp +
    da * da
  );
}

// NEW: DTW that also returns the warping path for consistency analysis
function dtwWithWarpPath(s1, s2) {
  var n = s1.length, m = s2.length;
  var w = Math.max(Math.floor(n * 0.2), 10);
  var cost = [];
  var path = [];
  for (var i = 0; i < n; i++) {
    cost[i] = new Float32Array(m);
    path[i] = new Array(m);
    for (var j = 0; j < m; j++) {
      cost[i][j] = Infinity;
      path[i][j] = null;
    }
  }

  cost[0][0] = pointDist(s1[0], s2[0]);
  path[0][0] = [0, 0];

  for (var i = 1; i < n; i++) {
    if (i <= w) {
      cost[i][0] = cost[i - 1][0] + pointDist(s1[i], s2[0]);
      path[i][0] = [i - 1, 0];
    }
  }
  for (var j = 1; j < m; j++) {
    if (j <= w) {
      cost[0][j] = cost[0][j - 1] + pointDist(s1[0], s2[j]);
      path[0][j] = [0, j - 1];
    }
  }

  for (var i = 1; i < n; i++) {
    var jS = Math.max(1, i - w);
    var jE = Math.min(m - 1, i + w);
    for (var j = jS; j <= jE; j++) {
      var options = [
        { val: cost[i - 1][j], p: [i - 1, j] },
        { val: cost[i][j - 1], p: [i, j - 1] },
        { val: cost[i - 1][j - 1], p: [i - 1, j - 1] },
      ];
      options.sort(function (a, b) { return a.val - b.val; });
      cost[i][j] = pointDist(s1[i], s2[j]) + options[0].val;
      path[i][j] = options[0].p;
    }
  }

  // Trace back the path
  var warpPath = [];
  var curr = [n - 1, m - 1];
  while (curr) {
    warpPath.unshift(curr);
    curr = path[curr[0]][curr[1]];
  }

  var raw = cost[n - 1][m - 1];
  var normalized = isFinite(raw) ? raw / (n + m) : 999;

  return { score: normalized, warpPath: warpPath };
}

function dtw(s1, s2) {
  return dtwWithWarpPath(s1, s2).score;
}

// NEW: Check if warping pattern is consistent with previous attempts
function warpPathSimilarity(path1, path2) {
  if (!path1 || !path2 || path1.length < 2 || path2.length < 2) return 0;

  var sampleLen = 20;
  var sample1 = samplePath(path1, sampleLen);
  var sample2 = samplePath(path2, sampleLen);

  var similarity = 0;
  for (var i = 0; i < sampleLen; i++) {
    var slope1 = pathSlope(sample1, i);
    var slope2 = pathSlope(sample2, i);
    similarity += 1 - Math.min(Math.abs(slope1 - slope2) / 3, 1);
  }

  return similarity / sampleLen;
}

function samplePath(path, n) {
  var step = path.length / n;
  var result = [];
  for (var i = 0; i < n; i++) {
    result.push(path[Math.min(Math.floor(i * step), path.length - 1)]);
  }
  return result;
}

function pathSlope(path, i) {
  if (i === 0 || i >= path.length - 1) return 0;
  var di = path[i + 1][0] - path[i - 1][0];
  var dj = path[i + 1][1] - path[i - 1][1];
  return dj / (di || 1);
}

function averageTemplate(samples) {
  var n = samples[0].length;
  return Array.from({ length: n }, function (_, i) {
    var sinD = samples.reduce(function (s, sig) { return s + Math.sin(sig[i].dir || 0); }, 0);
    var cosD = samples.reduce(function (s, sig) { return s + Math.cos(sig[i].dir || 0); }, 0);
    return {
      x: samples.reduce(function (s, sig) { return s + sig[i].x; }, 0) / samples.length,
      y: samples.reduce(function (s, sig) { return s + sig[i].y; }, 0) / samples.length,
      vel: samples.reduce(function (s, sig) { return s + (sig[i].vel || 0); }, 0) / samples.length,
      accel: samples.reduce(function (s, sig) { return s + (sig[i].accel || 0); }, 0) / samples.length,
      curv: samples.reduce(function (s, sig) { return s + (sig[i].curv || 0); }, 0) / samples.length,
      pressure: samples.reduce(function (s, sig) { return s + (sig[i].pressure || 0); }, 0) / samples.length,
      jerk: samples.reduce(function (s, sig) { return s + (sig[i].jerk || 0); }, 0) / samples.length,
      dir: Math.atan2(sinD / samples.length, cosD / samples.length),
    };
  });
}

// NEW: Quality score for enrollment samples
function computeQualityScore(rawPts, processedPts, timings) {
  var score = 100;

  // Penalize too few points
  if (rawPts.length < 30) score -= 30;
  else if (rawPts.length < 50) score -= 15;

  // Penalize too fast
  if (processedPts.length > 1) {
    var totalTime = rawPts[rawPts.length - 1].t - rawPts[0].t;
    if (totalTime < 400) score -= 30;
    else if (totalTime < 700) score -= 15;
    if (totalTime > 6000) score -= 20;
  }

  // Penalize too small
  var bbox = getBoundingBox(rawPts);
  if (bbox.width < 50 || bbox.height < 25) score -= 25;

  // Reward natural variation
  if (livenessCheck(rawPts)) score += 5;
  else score -= 35;

  // Reward appropriate stroke count
  if (timings.length >= 2) score += 5;

  // Penalize extreme aspect ratios
  var ratio = bbox.height / (bbox.width || 1);
  if (ratio > 5 || ratio < 0.1) score -= 15;

  return Math.max(0, Math.min(100, score));
}

function getBoundingBox(pts) {
  var xs = pts.map(function (p) { return p.x; });
  var ys = pts.map(function (p) { return p.y; });
  return {
    minX: Math.min.apply(null, xs),
    maxX: Math.max.apply(null, xs),
    minY: Math.min.apply(null, ys),
    maxY: Math.max.apply(null, ys),
    width: Math.max.apply(null, xs) - Math.min.apply(null, xs),
    height: Math.max.apply(null, ys) - Math.min.apply(null, ys),
  };
}

// NEW: Check consistency between enrollment samples
function checkEnrollmentConsistency(samples) {
  if (samples.length < 2) return { consistent: true, message: "Need more samples" };

  var distances = [];
  for (var i = 0; i < samples.length; i++)
    for (var j = i + 1; j < samples.length; j++)
      distances.push(dtw(samples[i], samples[j]));

  var avg = distances.reduce(function (a, b) { return a + b; }, 0) / distances.length;
  var max = Math.max.apply(null, distances);
  var spread = max - avg;

  if (spread > avg * 0.8) {
    return {
      consistent: false,
      message: "Samples inconsistent. One may be an outlier.",
      avg: avg,
      max: max,
      spread: spread,
    };
  }

  return { consistent: true, avg: avg, max: max, spread: spread };
}

// NEW: Find and remove outlier sample
function findOutlier(samples) {
  if (samples.length < 3) return -1;

  var avgDist = new Array(samples.length).fill(0);

  for (var i = 0; i < samples.length; i++) {
    var totalDist = 0;
    for (var j = 0; j < samples.length; j++) {
      if (i !== j) totalDist += dtw(samples[i], samples[j]);
    }
    avgDist[i] = totalDist / (samples.length - 1);
  }

  var outlierIdx = 0;
  var maxDist = avgDist[0];
  for (var i = 1; i < avgDist.length; i++) {
    if (avgDist[i] > maxDist) {
      maxDist = avgDist[i];
      outlierIdx = i;
    }
  }

  var overallAvg = avgDist.reduce(function (a, b) { return a + b; }, 0) / avgDist.length;
  if (maxDist > overallAvg * 1.5) return outlierIdx;
  return -1;
}

// IMPROVED: Percentile-based threshold
function computeThreshold(samples) {
  var distances = [];
  for (var i = 0; i < samples.length; i++)
    for (var j = i + 1; j < samples.length; j++)
      distances.push(dtw(samples[i], samples[j]));

  var avg = distances.reduce(function (a, b) { return a + b; }, 0) / distances.length;
  var sorted = distances.slice().sort(function (a, b) { return a - b; });
  var p75 = sorted[Math.floor(sorted.length * 0.75)] || avg;

  // Blend average and 75th percentile with small margin
  var threshold = (avg * 0.5 + p75 * 0.5) * 1.15;

  return Math.max(Math.min(threshold, 0.12), 0.035);
}

// ─────────────────────────────────────────────────────────────────
// ENHANCED ADVANCED FEATURES
// ─────────────────────────────────────────────────────────────────
function extractAdvancedFeatures(rawPts, timings, allStrokes) {
  var pauses = [];
  for (var i = 1; i < timings.length; i++)
    if (timings[i - 1].end && timings[i].start)
      pauses.push(timings[i].start - timings[i - 1].end);

  var avgPause = pauses.length ? pauses.reduce(function (a, b) { return a + b; }, 0) / pauses.length : 0;

  var jitter = [];
  for (var i = 2; i < rawPts.length; i++) {
    var dx = rawPts[i].x - rawPts[i - 1].x;
    var dy = rawPts[i].y - rawPts[i - 1].y;
    var px = rawPts[i - 1].x - rawPts[i - 2].x;
    var py = rawPts[i - 1].y - rawPts[i - 2].y;
    jitter.push(Math.sqrt((dx - px) * (dx - px) + (dy - py) * (dy - py)));
  }

  var bbox = getBoundingBox(rawPts);
  var aspectRatio = bbox.height / (bbox.width || 1);

  // NEW: Stroke-based features
  var strokeLengths = allStrokes.map(function (s) { return pathLength(s); });
  var avgStrokeLen = strokeLengths.length
    ? strokeLengths.reduce(function (a, b) { return a + b; }, 0) / strokeLengths.length
    : 0;

  // NEW: Speed profile by quarter
  var quarter = Math.floor(rawPts.length / 4);
  var speedByQuarter = [0, 0, 0, 0];
  for (var q = 0; q < 4; q++) {
    var start = q * quarter;
    var end = q === 3 ? rawPts.length : (q + 1) * quarter;
    var dist = 0, time = 1;
    for (var i = start + 1; i < end; i++) {
      dist += distance(rawPts[i - 1], rawPts[i]);
      time += rawPts[i].t - rawPts[i - 1].t;
    }
    speedByQuarter[q] = dist / (time / 1000);
  }

  // NEW: Direction change count
  var dirChanges = 0;
  for (var i = 2; i < rawPts.length; i++) {
    var a1 = Math.atan2(rawPts[i - 1].y - rawPts[i - 2].y, rawPts[i - 1].x - rawPts[i - 2].x);
    var a2 = Math.atan2(rawPts[i].y - rawPts[i - 1].y, rawPts[i].x - rawPts[i - 1].x);
    var diff = Math.abs(a2 - a1);
    if (diff > Math.PI) diff = 2 * Math.PI - diff;
    if (diff > 0.5) dirChanges++;
  }

  // NEW: Start/end position relative to bounding box
  var startRelX = (rawPts[0].x - bbox.minX) / (bbox.width || 1);
  var startRelY = (rawPts[0].y - bbox.minY) / (bbox.height || 1);
  var endRelX = (rawPts[rawPts.length - 1].x - bbox.minX) / (bbox.width || 1);
  var endRelY = (rawPts[rawPts.length - 1].y - bbox.minY) / (bbox.height || 1);

  return {
    strokeCount: allStrokes.length,
    totalTime: rawPts.length > 1 ? rawPts[rawPts.length - 1].t - rawPts[0].t : 0,
    avgPause: avgPause,
    totalLength: pathLength(rawPts),
    jitter: jitter.length ? jitter.reduce(function (a, b) { return a + b; }, 0) / jitter.length : 0,
    timeOfDay: new Date().getHours(),
    aspectRatio: aspectRatio,
    avgStrokeLen: avgStrokeLen,
    speedByQuarter: speedByQuarter,
    dirChanges: dirChanges,
    startRelX: startRelX,
    startRelY: startRelY,
    endRelX: endRelX,
    endRelY: endRelY,
  };
}

// NEW: Compare advanced features with baseline
function advancedFeatureScore(current, baseline) {
  if (!baseline) return 0.5;

  var score = 0;
  var count = 0;

  // Stroke count
  if (baseline.strokeCount !== undefined) {
    var diff = Math.abs(current.strokeCount - baseline.strokeCount);
    score += Math.max(0, 1 - diff / 2);
    count++;
  }

  // Total time
  if (baseline.totalTime > 0) {
    var ratio = current.totalTime / baseline.totalTime;
    score += Math.max(0, 1 - Math.abs(ratio - 1) * 2);
    count++;
  }

  // Aspect ratio
  if (baseline.aspectRatio) {
    var ratio = current.aspectRatio / baseline.aspectRatio;
    score += Math.max(0, 1 - Math.abs(ratio - 1) * 3);
    count++;
  }

  // Direction changes
  if (baseline.dirChanges !== undefined) {
    var ratio = current.dirChanges / (baseline.dirChanges || 1);
    score += Math.max(0, 1 - Math.abs(ratio - 1) * 1.5);
    count++;
  }

  // Speed profile correlation
  if (baseline.speedByQuarter && current.speedByQuarter) {
    var corr = pearsonCorrelation(baseline.speedByQuarter, current.speedByQuarter);
    score += Math.max(0, (corr + 1) / 2);
    count++;
  }

  // Start position
  if (baseline.startRelX !== undefined) {
    var d = Math.sqrt(
      (current.startRelX - baseline.startRelX) * (current.startRelX - baseline.startRelX) +
      (current.startRelY - baseline.startRelY) * (current.startRelY - baseline.startRelY)
    );
    score += Math.max(0, 1 - d * 2);
    count++;
  }

  // End position
  if (baseline.endRelX !== undefined) {
    var d = Math.sqrt(
      (current.endRelX - baseline.endRelX) * (current.endRelX - baseline.endRelX) +
      (current.endRelY - baseline.endRelY) * (current.endRelY - baseline.endRelY)
    );
    score += Math.max(0, 1 - d * 2);
    count++;
  }

  return count > 0 ? score / count : 0.5;
}

function pearsonCorrelation(x, y) {
  var n = Math.min(x.length, y.length);
  if (n < 2) return 0;

  var sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (var i = 0; i < n; i++) {
    sumX += x[i]; sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
    sumY2 += y[i] * y[i];
  }

  var num = n * sumXY - sumX * sumY;
  var den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  return den === 0 ? 0 : num / den;
}

// ─────────────────────────────────────────────────────────────────
// IMPROVED ONLINE LEARNING
// ─────────────────────────────────────────────────────────────────
var RETRAIN_EVERY = 5;
var UPGRADE_AFTER = 15;

function recordSuccessfulLogin(score, normalizedSig, warpPath) {
  var history = JSON.parse(Storage.get("sig_login_history") || "[]");
  history.unshift({ score: score, ts: Date.now() });
  Storage.set("sig_login_history", JSON.stringify(history.slice(0, 50)));

  var sigHistory = JSON.parse(Storage.get("sig_login_sigs") || "[]");
  sigHistory.unshift(normalizedSig);
  Storage.set("sig_login_sigs", JSON.stringify(sigHistory.slice(0, 25)));

  // Store warp paths
  var warpHistory = JSON.parse(Storage.get("sig_warp_paths") || "[]");
  warpHistory.unshift(warpPath);
  Storage.set("sig_warp_paths", JSON.stringify(warpHistory.slice(0, 15)));

  var count = history.length;

  // Retrain threshold periodically
  if (count % RETRAIN_EVERY === 0) {
    var scores = history.map(function (h) { return h.score; });
    var mean = scores.reduce(function (a, b) { return a + b; }, 0) / scores.length;
    var std = Math.sqrt(scores.reduce(function (s, v) { return s + (v - mean) * (v - mean); }, 0) / scores.length);

    var sorted = scores.slice().sort(function (a, b) { return a - b; });
    var p90 = sorted[Math.floor(sorted.length * 0.9)] || mean + std;

    var newT = Math.max(Math.min((mean + p90) / 2, 0.12), 0.035);
    Storage.set("sig_threshold", JSON.stringify(newT));
    console.log("[OnlineLearning] Retrained -> threshold " + newT.toFixed(4));
  }

  // Upgrade template with best recent samples
  if (count === UPGRADE_AFTER || (count > UPGRADE_AFTER && count % 25 === 0)) {
    if (sigHistory.length >= 5) {
      var recentSigs = sigHistory.slice(0, 10);
      var pairwiseDists = [];

      for (var i = 0; i < recentSigs.length; i++) {
        var totalDist = 0;
        for (var j = 0; j < recentSigs.length; j++) {
          if (i !== j) totalDist += dtw(recentSigs[i], recentSigs[j]);
        }
        pairwiseDists.push({ idx: i, avgDist: totalDist / (recentSigs.length - 1) });
      }

      // Select 5 most consistent samples
      pairwiseDists.sort(function (a, b) { return a.avgDist - b.avgDist; });
      var bestIndices = pairwiseDists.slice(0, 5).map(function (p) { return p.idx; });
      var bestSamples = bestIndices.map(function (i) { return recentSigs[i]; });

      var newTemplate = averageTemplate(bestSamples);
      Storage.set("sig_template", JSON.stringify(newTemplate));

      // Re-learn feature weights
      var newWeights = learnFeatureWeights(bestSamples);
      Storage.set("sig_feature_weights", JSON.stringify(newWeights));
      cachedWeights = newWeights;

      console.log("[OnlineLearning] Template & weights upgraded from best logins.");
    }
  }
}

function isAnomalousScore(score) {
  var history = JSON.parse(Storage.get("sig_login_history") || "[]");
  if (history.length < 5) return false;
  var scores = history.slice(0, 15).map(function (h) { return h.score; });
  var mean = scores.reduce(function (a, b) { return a + b; }, 0) / scores.length;
  var std = Math.sqrt(scores.reduce(function (s, v) { return s + (v - mean) * (v - mean); }, 0) / scores.length);
  return score > mean + 2.5 * std;
}

function selfHardening(failedScore) {
  var t = JSON.parse(Storage.get("sig_threshold")) || 0.12;
  if (failedScore < t * 1.2) {
    var hardened = Math.max(t * 0.93, 0.035);
    Storage.set("sig_threshold", JSON.stringify(hardened));
    console.log("[Hardening] Threshold tightened -> " + hardened.toFixed(4));
  }
}

// NEW: Warp path consistency check
function checkWarpConsistency(currentPath) {
  var history = JSON.parse(Storage.get("sig_warp_paths") || "[]");
  if (history.length < 3) return true;

  var similarities = history.slice(0, 5).map(function (h) {
    return warpPathSimilarity(currentPath, h);
  });
  var avgSimilarity = similarities.reduce(function (a, b) { return a + b; }, 0) / similarities.length;

  return avgSimilarity > 0.25;
}

// ─────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────
function distance(p1, p2) {
  var dx = p1.x - p2.x, dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function pathLength(pts) {
  var d = 0;
  for (var i = 1; i < pts.length; i++) d += distance(pts[i - 1], pts[i]);
  return d;
}

// ─────────────────────────────────────────────────────────────────
// GLOBAL STATE
// ─────────────────────────────────────────────────────────────────
var enrollSamples = JSON.parse(Storage.get("sig_samples_partial") || "[]");
var enrollAdvFeat = JSON.parse(Storage.get("sig_af_partial") || "[]");
var enrollQualityScores = JSON.parse(Storage.get("sig_quality_scores") || "[]");
var ENROLL_COUNT = 5; // Increased from 3 for better accuracy
var MAX_ATTEMPTS = 3;

// ─────────────────────────────────────────────────────────────────
// IMPROVED ENROLLMENT
// ─────────────────────────────────────────────────────────────────
async function saveSignature() {
  setEnrollMode(true);

  var raw = getAllPoints();
  var allStrokes = getAllStrokes();

  if (raw.length < 20) {
    showStatus("Draw a proper signature first!", "warn");
    return;
  }

  if (!livenessCheck(raw)) {
    showStatus("Draw naturally - don't trace slowly.", "warn");
    clearCanvas();
    return;
  }

  var processed = normalize(raw, allStrokes);
  if (!processed) {
    showStatus("Signature too small or short. Try again.", "warn");
    clearCanvas();
    return;
  }

  // Quality check
  var quality = computeQualityScore(raw, processed, strokeTimings);
  enrollQualityScores.push(quality);
  Storage.set("sig_quality_scores", JSON.stringify(enrollQualityScores));

  if (quality < 45) {
    showStatus("Low quality (" + Math.round(quality) + "%). Sign more carefully.", "warn");
    clearCanvas();
    return;
  }

  var af = extractAdvancedFeatures(raw, strokeTimings, allStrokes);
  enrollSamples.push(processed);
  enrollAdvFeat.push(af);

  Storage.set("sig_samples_partial", JSON.stringify(enrollSamples));
  Storage.set("sig_af_partial", JSON.stringify(enrollAdvFeat));

  // Consistency check only after all enrollment samples are collected (optimization)
  if (enrollSamples.length === ENROLL_COUNT) {
    var consistency = checkEnrollmentConsistency(enrollSamples);
    if (!consistency.consistent) {
      var outlierIdx = findOutlier(enrollSamples);
      if (outlierIdx >= 0) {
        enrollSamples.splice(outlierIdx, 1);
        enrollAdvFeat.splice(outlierIdx, 1);
        enrollQualityScores.splice(outlierIdx, 1);
        Storage.set("sig_samples_partial", JSON.stringify(enrollSamples));
        Storage.set("sig_af_partial", JSON.stringify(enrollAdvFeat));
        Storage.set("sig_quality_scores", JSON.stringify(enrollQualityScores));
        showStatus("Inconsistent sample removed. " + enrollSamples.length + "/" + ENROLL_COUNT + " saved.", "warn");
        clearCanvas();
        return;
      }
    }
  }

  var remaining = ENROLL_COUNT - enrollSamples.length;
  if (remaining > 0) {
    var avgQuality = enrollQualityScores.reduce(function (a, b) { return a + b; }, 0) / enrollQualityScores.length;
    showStatus("Sample " + enrollSamples.length + "/" + ENROLL_COUNT + " saved (quality: " + Math.round(avgQuality) + "%). Draw again.", "ok");
    clearCanvas();
    return;
  }

  // Finalize enrollment
  var template = averageTemplate(enrollSamples);
  var threshold = computeThreshold(enrollSamples);
  var weights = learnFeatureWeights(enrollSamples);
  cachedWeights = weights;

  var avgAF = {
    strokeCount: Math.round(enrollAdvFeat.reduce(function (s, f) { return s + f.strokeCount; }, 0) / enrollAdvFeat.length),
    avgPause: enrollAdvFeat.reduce(function (s, f) { return s + f.avgPause; }, 0) / enrollAdvFeat.length,
    jitter: enrollAdvFeat.reduce(function (s, f) { return s + f.jitter; }, 0) / enrollAdvFeat.length,
    timeOfDay: enrollAdvFeat[0].timeOfDay,
    aspectRatio: enrollAdvFeat.reduce(function (s, f) { return s + f.aspectRatio; }, 0) / enrollAdvFeat.length,
    avgStrokeLen: enrollAdvFeat.reduce(function (s, f) { return s + f.avgStrokeLen; }, 0) / enrollAdvFeat.length,
    speedByQuarter: [0, 1, 2, 3].map(function (q) {
      return enrollAdvFeat.reduce(function (s, f) { return s + (f.speedByQuarter[q] || 0); }, 0) / enrollAdvFeat.length;
    }),
    dirChanges: Math.round(enrollAdvFeat.reduce(function (s, f) { return s + f.dirChanges; }, 0) / enrollAdvFeat.length),
    startRelX: enrollAdvFeat.reduce(function (s, f) { return s + f.startRelX; }, 0) / enrollAdvFeat.length,
    startRelY: enrollAdvFeat.reduce(function (s, f) { return s + f.startRelY; }, 0) / enrollAdvFeat.length,
    endRelX: enrollAdvFeat.reduce(function (s, f) { return s + f.endRelX; }, 0) / enrollAdvFeat.length,
    endRelY: enrollAdvFeat.reduce(function (s, f) { return s + f.endRelY; }, 0) / enrollAdvFeat.length,
  };

  Storage.set("sig_template", JSON.stringify(template));
  Storage.set("sig_samples", JSON.stringify(enrollSamples));
  Storage.set("sig_threshold", JSON.stringify(threshold));
  Storage.set("sig_adv_feat", JSON.stringify(avgAF));
  Storage.set("sig_feature_weights", JSON.stringify(weights));
  Storage.set("sig_attempts", "0");
  Storage.set("sig_login_history", "[]");
  Storage.set("sig_login_sigs", "[]");
  Storage.set("sig_fp_history", "[]");
  Storage.set("sig_warp_paths", "[]");
  Storage.set("sig_enrolled", "true");
  Storage.set("sig_enrollment_ts", JSON.stringify(Date.now()));
  Storage.remove("sig_samples_partial");
  Storage.remove("sig_af_partial");
  Storage.remove("sig_quality_scores");

  await Storage.save();

  enrollSamples = [];
  enrollAdvFeat = [];
  enrollQualityScores = [];
  setEnrollMode(false);

  showStatus("Registered! Threshold: " + threshold.toFixed(4) + ". You can now verify.", "ok");
  clearCanvas();
}

// ─────────────────────────────────────────────────────────────────
// IMPROVED VERIFICATION (FIXED REDIRECT)
// ─────────────────────────────────────────────────────────────────
async function verifySignature() {
  setEnrollMode(false);

  var attemptCount = Number(Storage.get("sig_attempts") || "0");
  if (attemptCount >= MAX_ATTEMPTS) {
    showStatus("Too many failed attempts. Account locked.", "error");
    document.getElementById("verifyBtn").disabled = true;
    document.getElementById("saveBtn").disabled = true;
    return;
  }

  var template = JSON.parse(Storage.get("sig_template"));
  var samples = JSON.parse(Storage.get("sig_samples"));
  var THRESHOLD = JSON.parse(Storage.get("sig_threshold")) || 0.12;
  var advBaseline = JSON.parse(Storage.get("sig_adv_feat"));

  if (!template || !samples) {
    showStatus("No signature registered. Enroll first!", "warn");
    return;
  }

  var raw = getAllPoints();
  var allStrokes = getAllStrokes();
  var pressures = rawPressures.slice();

  if (raw.length < 20) {
    showStatus("Draw your signature to verify.", "warn");
    return;
  }

  if (!livenessCheck(raw)) {
    showStatus("Suspicious input. Sign naturally.", "warn");
    clearCanvas();
    return;
  }

  if (isReplay(raw, pressures)) {
    showStatus("Replay detected. Draw fresh.", "error");
    clearCanvas();
    return;
  }

  var current = normalize(raw, allStrokes);
  if (!current) {
    showStatus("Signature too small. Try again.", "warn");
    clearCanvas();
    return;
  }

  // DTW with warp path
  var dtwResult = dtwWithWarpPath(template, current);
  var scoreTemplate = dtwResult.score;
  var warpPath = dtwResult.warpPath;

  var bestSampleDist = Infinity;
  for (var i = 0; i < samples.length; i++) {
    var d = dtw(samples[i], current);
    if (d < bestSampleDist) bestSampleDist = d;
  }

  // Warp path consistency
  var warpConsistent = checkWarpConsistency(warpPath);

  // Advanced feature comparison
  var currentAF = extractAdvancedFeatures(raw, strokeTimings, allStrokes);
  var afScore = advancedFeatureScore(currentAF, advBaseline);

  // Combined scoring
  var finalScore = scoreTemplate * 0.45 + bestSampleDist * 0.35 + (1 - afScore) * 0.20;
  if (!warpConsistent) finalScore *= 1.05;

  console.log("--- Verify ---");
  console.log("Template DTW  : " + scoreTemplate.toFixed(4));
  console.log("Best Sample   : " + bestSampleDist.toFixed(4));
  console.log("Adv. Features : " + afScore.toFixed(4));
  console.log("Warp Consist. : " + (warpConsistent ? "Yes" : "No"));
  console.log("Final score   : " + finalScore.toFixed(4));
  console.log("Threshold     : " + THRESHOLD.toFixed(4));
  console.log("Result        : " + (finalScore < THRESHOLD ? "PASS" : "FAIL"));

  if (finalScore < THRESHOLD) {
    if (isAnomalousScore(finalScore)) {
      console.warn("[Anomaly] Unusual score - flagged but granted.");
    }

    recordFingerprint(raw, pressures);
    recordSuccessfulLogin(finalScore, current, warpPath);
    Storage.set("sig_attempts", "0");

    var stats = JSON.parse(Storage.get("sig_stats") || "{}");
    stats.lastLogin = Date.now();
    stats.totalLogins = (stats.totalLogins || 0) + 1;
    stats.lastScore = finalScore;
    stats.lastAFScore = afScore;
    Storage.set("sig_stats", JSON.stringify(stats));

    await Storage.save();

    showStatus("Verified!", "ok");

    // FIX: Reliable redirect with multiple fallbacks
    setTimeout(function () {
      try {
        localStorage.setItem("authenticated", "true");
        localStorage.setItem("auth_time", String(Date.now()));
        // Try replace first (prevents back button issues)
        window.location.replace("app.html");
      } catch (e) {
        console.error("Redirect error:", e);
        // Fallback methods
        try {
          window.location.href = "app.html";
        } catch (e2) {
          // Last resort: create link and click it
          var link = document.createElement("a");
          link.href = "app.html";
          link.style.display = "none";
          document.body.appendChild(link);
          link.click();
        }
      }
    }, 600);

  } else {
    recordFingerprint(raw, pressures);
    selfHardening(finalScore);
    var newCount = attemptCount + 1;
    Storage.set("sig_attempts", String(newCount));
    var left = MAX_ATTEMPTS - newCount;

    if (left <= 0) {
      showStatus("Account locked after 3 failures.", "error");
      document.getElementById("verifyBtn").disabled = true;
      document.getElementById("saveBtn").disabled = true;
    } else {
      var hint = "";
      if (afScore < 0.5) hint = " (check stroke count/timing)";
      else if (scoreTemplate > THRESHOLD * 1.5) hint = " (shape mismatch)";
      else hint = " (close - try again)";
      showStatus("Not matched. " + left + " attempt(s) left." + hint, "error");
    }
    clearCanvas();
  }
}

// ─────────────────────────────────────────────────────────────────
// NEW: RESET FUNCTION
// ─────────────────────────────────────────────────────────────────
async function resetEnrollment() {
  if (!confirm("Delete all signature data?")) return;

  var keys = [
    "sig_template", "sig_samples", "sig_threshold",
    "sig_adv_feat", "sig_login_history", "sig_login_sigs",
    "sig_fp_history", "sig_stats", "sig_attempts",
    "sig_enrolled", "sig_samples_partial", "sig_af_partial",
    "sig_quality_scores", "sig_feature_weights", "sig_warp_paths",
    "sig_enrollment_ts", "sig_calibration_data", "sig_stroke_models",
    "sig_entropy_baseline", "sig_time_models",
    "authenticated", "auth_time",
  ];

  keys.forEach(function (k) { Storage.remove(k); });
  await Storage.reset();
  await Storage.save();

  enrollSamples = [];
  enrollAdvFeat = [];
  enrollQualityScores = [];
  cachedWeights = null;

  document.getElementById("verifyBtn").disabled = false;
  document.getElementById("saveBtn").disabled = false;

  showStatus("Signature data cleared. Enroll again.", "ok");
  clearCanvas();
}

// ─────────────────────────────────────────────────────────────────
// NEW: CALIBRATION MODE (improve after initial enrollment)
// ─────────────────────────────────────────────────────────────────
async function calibrateSignature() {
  var enrolled = Storage.get("sig_enrolled");
  if (enrolled !== "true") {
    showStatus("Enroll first before calibrating.", "warn");
    return;
  }

  setEnrollMode(true);

  var raw = getAllPoints();
  var allStrokes = getAllStrokes();

  if (raw.length < 20) {
    showStatus("Draw your signature first.", "warn");
    return;
  }

  if (!livenessCheck(raw)) {
    showStatus("Draw naturally.", "warn");
    clearCanvas();
    return;
  }

  var current = normalize(raw, allStrokes);
  if (!current) {
    showStatus("Signature too small.", "warn");
    clearCanvas();
    return;
  }

  // Check if this is a good sample (close to existing template)
  var template = JSON.parse(Storage.get("sig_template"));
  var threshold = JSON.parse(Storage.get("sig_threshold"));
  var score = dtw(template, current);

  if (score > threshold * 1.5) {
    showStatus("This doesn't match your enrolled signature well.", "error");
    clearCanvas();
    return;
  }

  // Add to calibration data
  var calData = JSON.parse(Storage.get("sig_calibration_data") || "[]");
  calData.push({
    signature: current,
    score: score,
    ts: Date.now(),
  });
  Storage.set("sig_calibration_data", JSON.stringify(calData.slice(0, 20)));

  // If we have enough calibration samples, update template
  if (calData.length >= 3) {
    var existingSamples = JSON.parse(Storage.get("sig_samples") || "[]");
    var calSigs = calData.slice(-5).map(function (c) { return c.signature; });
    var allForTemplate = existingSamples.concat(calSigs).slice(-8);

    var newTemplate = averageTemplate(allForTemplate);
    var newThreshold = computeThreshold(allForTemplate);
    var newWeights = learnFeatureWeights(allForTemplate);

    Storage.set("sig_template", JSON.stringify(newTemplate));
    Storage.set("sig_threshold", JSON.stringify(newThreshold));
    Storage.set("sig_feature_weights", JSON.stringify(newWeights));
    cachedWeights = newWeights;

    await Storage.save();
    showStatus("Calibrated! Threshold: " + newThreshold.toFixed(4), "ok");
  } else {
    showStatus("Calibration sample saved (" + calData.length + "/3 needed to update).", "ok");
  }

  setEnrollMode(false);
  clearCanvas();
}

// ─────────────────────────────────────────────────────────────────
// NEW: DIAGNOSTICS
// ─────────────────────────────────────────────────────────────────
function showDiagnostics() {
  var template = Storage.getJSON("sig_template", null);
  var samples = Storage.getJSON("sig_samples", []);
  var threshold = Storage.getJSON("sig_threshold", null);
  var stats = Storage.getJSON("sig_stats", {});
  var history = Storage.getJSON("sig_login_history", []);
  var enrolled = Storage.get("sig_enrolled");
  var weights = Storage.getJSON("sig_feature_weights", null);
  var calData = Storage.getJSON("sig_calibration_data", []);

  console.log("=== DIAGNOSTICS ===");
  console.log("Enrolled      : " + (enrolled === "true" ? "Yes" : "No"));
  console.log("Samples       : " + (samples ? samples.length : 0));
  console.log("Threshold     : " + (threshold || "N/A"));
  console.log("Total logins  : " + (stats.totalLogins || 0));
  console.log("Last score    : " + (stats.lastScore ? stats.lastScore.toFixed(4) : "N/A"));
  console.log("History size  : " + history.length);
  console.log("Calibrations  : " + calData.length);
  console.log("Feature weights:", weights || "default");

  if (samples && samples.length >= 2) {
    var distances = [];
    for (var i = 0; i < samples.length; i++)
      for (var j = i + 1; j < samples.length; j++)
        distances.push(dtw(samples[i], samples[j]));
    console.log("Sample spread : min=" + Math.min.apply(null, distances).toFixed(4) +
      ", max=" + Math.max.apply(null, distances).toFixed(4) +
      ", avg=" + (distances.reduce(function (a, b) { return a + b; }, 0) / distances.length).toFixed(4));
  }

  return {
    enrolled: enrolled === "true",
    sampleCount: samples ? samples.length : 0,
    threshold: threshold,
    totalLogins: stats.totalLogins || 0,
  };
}

// ─────────────────────────────────────────────────────────────────
// UI HELPER
// ─────────────────────────────────────────────────────────────────
function showStatus(msg, type) {
  type = type || "info";
  var el = document.getElementById("status");
  if (!el) return;
  el.textContent = msg;
  el.className = "";
  if (type === "ok") el.classList.add("ok");
  if (type === "warn") el.classList.add("warn");
  if (type === "error") el.classList.add("error");
}

function checkEnrollmentStatus() {
  var enrolled = Storage.get("sig_enrolled");
  var attempts = Number(Storage.get("sig_attempts") || "0");

  if (enrolled === "true") {
    document.getElementById("verifyBtn").disabled = attempts >= MAX_ATTEMPTS;
  } else if (enrollSamples.length > 0) {
    showStatus("Continue enrollment: " + enrollSamples.length + "/" + ENROLL_COUNT + " samples saved.", "info");
  }
}

// Initialize
window.addEventListener("DOMContentLoaded", async function () {
  await Storage.load();
  checkEnrollmentStatus();
  showDiagnostics();
});

// Expose functions globally
window.saveSignature = saveSignature;
window.verifySignature = verifySignature;
window.resetEnrollment = resetEnrollment;
window.calibrateSignature = calibrateSignature;
window.showDiagnostics = showDiagnostics;
window.clearCanvas = clearCanvas;

// Export for testing
if (typeof module !== 'undefined') {
  module.exports = {
    normalize,
    dtw,
    extractAdvancedFeatures,
    livenessCheck,
    isReplay,
    generateTimingFingerprint,
    spatialTemporalFingerprint,
    pressureFingerprint,
    recordFingerprint,
    removeTrailingDot,
    removeLeadingDot,
    removeJitter,
    smoothPoints,
    resample,
    scaleToUnit,
    translateToOrigin,
    addVelocity,
    addAcceleration,
    addDirection,
    addCurvature,
    addPressure,
    addJerk,
    addStrokeInfo,
    pointDist,
    angleDiff,
    dtwWithWarpPath,
    warpPathSimilarity,
    samplePath,
    pathSlope,
    averageTemplate,
    computeQualityScore,
    getBoundingBox,
    checkEnrollmentConsistency,
    findOutlier,
    computeThreshold,
    distance,
    pathLength,
    getAllPoints,
    getAllStrokes,
    clearCanvas,
  };
}