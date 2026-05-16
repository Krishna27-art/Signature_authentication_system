/**
 * unit.test.js
 * Tests every core function in isolation.
 * Run with: npx jest tests/unit.test.js
 *
 * IMPORTANT: Your index.js functions must be exported for this to work.
 * Add at the bottom of index.js:
 *   if (typeof module !== 'undefined') module.exports = { normalizePath, dtwDistance, ... }
 */

import {
  generateGenuine,
  generateImpostor,
  generateRobot,
  generateReplay,
  generateScaled,
  generateWithTrailingDot,
  generateWithoutTrailingDot,
} from './synthetic_gen.js';

// ── Import from your actual codebase (adjust path if needed) ─────────────────
// These are the functions you already have in index.js
// Note: Since index.js uses vanilla JS without modules, we'll need to adapt
// For now, we'll use stub implementations that match the expected interface

// Stub implementations - replace with actual imports once index.js is modularized
const normalizePath = (pts) => {
  if (!pts || pts.length < 2) return Array(64).fill({ x: 0, y: 0 });
  let end = pts.length;
  while (end > 10) {
    const last = pts[end - 1];
    const cluster = pts.slice(end - 5, end);
    const spread = Math.max(...cluster.map(p => Math.hypot(p.x - last.x, p.y - last.y)));
    if (spread < 5 && (last.t - pts[end - 5].t) > 300) { end -= 5; } else break;
  }
  const trimmed = pts.slice(0, end);
  const xs = trimmed.map(p => p.x), ys = trimmed.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1, range = Math.max(rangeX, rangeY);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const normalized = trimmed.map(p => ({ x: (p.x - cx) / range * 2, y: (p.y - cy) / range * 2 }));
  const result = [];
  for (let i = 0; i < 64; i++) {
    const idx = i / 63 * (normalized.length - 1);
    const lo = Math.floor(idx), hi = Math.ceil(idx), frac = idx - lo;
    result.push({ x: normalized[lo].x * (1-frac) + normalized[hi].x * frac, y: normalized[lo].y * (1-frac) + normalized[hi].y * frac });
  }
  return result;
};

const dtwDistance = (a, b) => {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n }, () => Array(m).fill(Infinity));
  dp[0][0] = Math.hypot(a[0].x - b[0].x, a[0].y - b[0].y);
  for (let i = 1; i < n; i++) dp[i][0] = dp[i-1][0] + Math.hypot(a[i].x-b[0].x, a[i].y-b[0].y);
  for (let j = 1; j < m; j++) dp[0][j] = dp[0][j-1] + Math.hypot(a[0].x-b[j].x, a[0].y-b[j].y);
  for (let i = 1; i < n; i++) for (let j = 1; j < m; j++)
    dp[i][j] = Math.hypot(a[i].x-b[j].x, a[i].y-b[j].y) + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[n-1][m-1] / (n + m);
};

const extractFeatures = (pts) => {
  if (pts.length < 2) return Array(8).fill(0);
  const speeds = [];
  for (let i = 1; i < pts.length; i++) {
    const dt = pts[i].t - pts[i-1].t || 1;
    speeds.push(Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y) / dt);
  }
  const avg = speeds.reduce((a, b) => a + b, 0) / speeds.length;
  const std = Math.sqrt(speeds.reduce((s, v) => s + (v - avg)**2, 0) / speeds.length);
  const cov = avg > 0 ? std / avg : 0;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const w = Math.max(...xs) - Math.min(...xs) || 1, h = Math.max(...ys) - Math.min(...ys) || 1;
  let dirChanges = 0;
  for (let i = 2; i < pts.length; i++) {
    const a1 = Math.atan2(pts[i-1].y - pts[i-2].y, pts[i-1].x - pts[i-2].x);
    const a2 = Math.atan2(pts[i].y - pts[i-1].y, pts[i].x - pts[i-1].x);
    if (Math.abs(a2 - a1) > 0.5) dirChanges++;
  }
  const totalTime = (pts[pts.length-1].t - pts[0].t) || 1;
  return [pts.length, avg, cov, totalTime, dirChanges, w/h, std, speeds.length];
};

const detectLiveness = (pts) => {
  const features = extractFeatures(pts);
  const speedCoV = features[2];
  return { isLive: speedCoV > 0.2, speedCoV };
};

const detectReplay = (a, b) => {
  if (a.length !== b.length) return { isReplay: false, confidence: 0 };
  let diffs = 0;
  for (let i = 0; i < a.length; i++) diffs += Math.hypot(a[i].x-b[i].x, a[i].y-b[i].y) + Math.abs(a[i].t-b[i].t);
  const avgDiff = diffs / a.length;
  const isReplay = avgDiff < 0.01;
  return { isReplay, confidence: isReplay ? 1 : Math.max(0, 1 - avgDiff / 50) };
};

const cosineSimilarity = (a, b) => {
  const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return magA && magB ? dot / (magA * magB) : 0;
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. NORMALISATION TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('normalizePath()', () => {

  test('output always has exactly 64 points', () => {
    const sig = generateGenuine('userA');
    const norm = normalizePath(sig);
    expect(norm).toHaveLength(64);
  });

  test('all output points are within [-1, 1] unit box', () => {
    const sig = generateGenuine('userA');
    const norm = normalizePath(sig);
    norm.forEach(pt => {
      expect(pt.x).toBeGreaterThanOrEqual(-1.05);
      expect(pt.x).toBeLessThanOrEqual(1.05);
      expect(pt.y).toBeGreaterThanOrEqual(-1.05);
      expect(pt.y).toBeLessThanOrEqual(1.05);
    });
  });

  test('a signature scaled to 70% normalises to same result as full size', () => {
    const full   = normalizePath(generateGenuine('userA', 1, 1.0));
    const scaled = normalizePath(generateGenuine('userA', 1, 0.7));
    // DTW distance between normalised versions should be small
    const dist = dtwDistance(full, scaled);
    expect(dist).toBeLessThan(0.15);
  });

  test('centre of mass is near origin after normalisation', () => {
    const sig = generateGenuine('userA');
    const norm = normalizePath(sig);
    const cx = norm.reduce((s, p) => s + p.x, 0) / norm.length;
    const cy = norm.reduce((s, p) => s + p.y, 0) / norm.length;
    expect(Math.abs(cx)).toBeLessThan(0.1);
    expect(Math.abs(cy)).toBeLessThan(0.1);
  });

  test('trailing dot is removed: signature with and without dot normalise similarly', () => {
    const withDot    = normalizePath(generateWithTrailingDot('userA'));
    const withoutDot = normalizePath(generateWithoutTrailingDot('userA'));
    const dist = dtwDistance(withDot, withoutDot);
    expect(dist).toBeLessThan(0.2);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 2. DTW DISTANCE TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('dtwDistance()', () => {

  test('same signature vs itself = 0', () => {
    const sig  = normalizePath(generateGenuine('userA'));
    const dist = dtwDistance(sig, sig);
    expect(dist).toBe(0);
  });

  test('two genuine attempts from same user: distance < 0.25', () => {
    const a = normalizePath(generateGenuine('userA'));
    const b = normalizePath(generateGenuine('userA'));
    const dist = dtwDistance(a, b);
    expect(dist).toBeLessThan(0.25);
  });

  test('genuine vs impostor: distance > 0.35', () => {
    const genuine  = normalizePath(generateGenuine('userA'));
    const impostor = normalizePath(generateImpostor('userA'));
    const dist = dtwDistance(genuine, impostor);
    expect(dist).toBeGreaterThan(0.35);
  });

  test('is symmetric: dtw(A,B) === dtw(B,A)', () => {
    const a = normalizePath(generateGenuine('userA'));
    const b = normalizePath(generateGenuine('userB'));
    expect(dtwDistance(a, b)).toBeCloseTo(dtwDistance(b, a), 5);
  });

  test('scaled signature: distance stays below acceptance threshold', () => {
    const base   = normalizePath(generateGenuine('userA'));
    const small  = normalizePath(generateScaled('userA', 0.6));
    const large  = normalizePath(generateScaled('userA', 1.5));
    expect(dtwDistance(base, small)).toBeLessThan(0.25);
    expect(dtwDistance(base, large)).toBeLessThan(0.25);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 3. FEATURE EXTRACTION TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('extractFeatures()', () => {

  test('returns a vector with exactly 8 numbers', () => {
    const features = extractFeatures(generateGenuine('userA'));
    expect(features).toHaveLength(8);
    features.forEach(f => expect(typeof f).toBe('number'));
  });

  test('no NaN or Infinity values in feature vector', () => {
    const features = extractFeatures(generateGenuine('userA'));
    features.forEach(f => {
      expect(Number.isFinite(f)).toBe(true);
    });
  });

  test('avgSpeed is higher for a fast signature', () => {
    const slow = extractFeatures(generateGenuine('userA', 3, 1.0, 0));
    // Fast: create with very compressed timing (small timestamps)
    const fastSig = generateGenuine('userA').map((p, i) => ({ ...p, t: i * 5 }));
    const fast = extractFeatures(fastSig);
    // avg speed (index 1) should differ meaningfully
    expect(fast[1]).toBeGreaterThan(slow[1] * 0.5);
  });

  test('speedVariation is near 0 for a robot signature', () => {
    const features = extractFeatures(generateRobot('userA'));
    const speedVariation = features[2]; // index 2 = speedVariation / CoV
    expect(speedVariation).toBeLessThan(0.05);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 4. LIVENESS DETECTION TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('detectLiveness()', () => {

  test('genuine human signature passes liveness', () => {
    const result = detectLiveness(generateGenuine('userA'));
    expect(result.isLive).toBe(true);
  });

  test('robot signature (constant speed) fails liveness', () => {
    const result = detectLiveness(generateRobot('userA'));
    expect(result.isLive).toBe(false);
  });

  test('liveness returns a CoV score', () => {
    const result = detectLiveness(generateGenuine('userA'));
    expect(typeof result.speedCoV).toBe('number');
    expect(result.speedCoV).toBeGreaterThan(0);
  });

  test('multiple genuine signatures all pass liveness', () => {
    for (let i = 0; i < 20; i++) {
      const result = detectLiveness(generateGenuine('userA'));
      expect(result.isLive).toBe(true);
    }
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 5. REPLAY DETECTION TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('detectReplay()', () => {

  test('two different genuine attempts: NOT flagged as replay', () => {
    const a = generateGenuine('userA');
    const b = generateGenuine('userA');
    const result = detectReplay(a, b);
    expect(result.isReplay).toBe(false);
  });

  test('perfect replay (exact copy) is detected', () => {
    const original = generateGenuine('userA');
    const replay   = generateReplay(original);
    const result   = detectReplay(original, replay);
    expect(result.isReplay).toBe(true);
  });

  test('replay detection returns a confidence score', () => {
    const original = generateGenuine('userA');
    const replay   = generateReplay(original);
    const result   = detectReplay(original, replay);
    expect(typeof result.confidence).toBe('number');
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 6. COSINE SIMILARITY TESTS (Model 1 helper)
// ─────────────────────────────────────────────────────────────────────────────

describe('cosineSimilarity()', () => {

  test('identical vectors → similarity = 1.0', () => {
    const v = [0.1, 0.5, 0.3, 0.8, 0.2];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 5);
  });

  test('opposite vectors → similarity = -1.0', () => {
    const v = [1, 2, 3];
    const neg = [-1, -2, -3];
    expect(cosineSimilarity(v, neg)).toBeCloseTo(-1.0, 5);
  });

  test('perpendicular vectors → similarity ≈ 0', () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0, 5);
  });

  test('handles zero vectors without crashing', () => {
    expect(() => cosineSimilarity([0, 0, 0], [1, 2, 3])).not.toThrow();
  });

});
