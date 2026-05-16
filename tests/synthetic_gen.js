/**
 * synthetic_gen.js
 * Generates programmatic signature point arrays for automated testing.
 * No canvas or human input needed. Import this in any test file.
 *
 * Each point: { x, y, t }  (x, y = coordinates, t = timestamp in ms)
 */

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Box-Muller: Gaussian noise with mean=0, std=sigma */
function gauss(sigma = 1) {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * sigma;
}

/** Interpolate along a cubic Bezier at parameter t ∈ [0,1] */
function bezierPoint(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  return {
    x: mt**3*p0.x + 3*mt**2*t*p1.x + 3*mt*t**2*p2.x + t**3*p3.x,
    y: mt**3*p0.y + 3*mt**2*t*p1.y + 3*mt*t**2*p2.y + t**3*p3.y,
  };
}

/** Sample n points along a cubic Bezier stroke */
function sampleBezier(p0, p1, p2, p3, n = 32) {
  const pts = [];
  for (let i = 0; i < n; i++) pts.push(bezierPoint(p0, p1, p2, p3, i / (n - 1)));
  return pts;
}

/** Add human-like timing: sinusoidal speed variation + Gaussian jitter */
function addTiming(points, baseSpeed = 3, startTime = 0) {
  let t = startTime;
  return points.map((p, i) => {
    const progress = i / Math.max(points.length - 1, 1);
    // Speed: fast in the middle, slow at start and end (natural pen motion)
    const speedMultiplier = 0.5 + Math.sin(progress * Math.PI) * 0.8 + gauss(0.15);
    const pixelDist = i === 0 ? 1 : Math.hypot(
      p.x - points[i - 1].x,
      p.y - points[i - 1].y
    );
    t += Math.max(5, (pixelDist / (baseSpeed * Math.max(0.1, speedMultiplier))));
    return { x: p.x, y: p.y, t: Math.round(t) };
  });
}

/** Add position jitter to simulate natural hand variation */
function jitter(points, sigma = 3) {
  return points.map(p => ({ x: p.x + gauss(sigma), y: p.y + gauss(sigma), t: p.t }));
}

// ─── Signature Blueprints ────────────────────────────────────────────────────
// Each blueprint is a list of Bezier strokes defining a "user's" signature shape.

const BLUEPRINTS = {
  userA: [
    // Stroke 1: a looping curve (like a cursive letter)
    [{ x:100,y:200 }, { x:130,y:120 }, { x:200,y:140 }, { x:220,y:200 }],
    // Stroke 2: downstroke
    [{ x:220,y:200 }, { x:240,y:240 }, { x:200,y:280 }, { x:160,y:260 }],
    // Stroke 3: finishing curl
    [{ x:160,y:260 }, { x:180,y:300 }, { x:260,y:290 }, { x:280,y:260 }],
  ],
  userB: [
    // Completely different shape from userA
    [{ x:80, y:150 }, { x:150,y:100 }, { x:250,y:180 }, { x:300,y:150 }],
    [{ x:300,y:150 }, { x:320,y:200 }, { x:280,y:250 }, { x:240,y:220 }],
  ],
  userC: [
    // Another distinct shape
    [{ x:120,y:180 }, { x:160,y:100 }, { x:220,y:160 }, { x:180,y:220 }],
    [{ x:180,y:220 }, { x:140,y:280 }, { x:200,y:300 }, { x:260,y:270 }],
    [{ x:260,y:270 }, { x:300,y:250 }, { x:310,y:200 }, { x:280,y:180 }],
  ],
};

// ─── Public Generators ───────────────────────────────────────────────────────

/**
 * Generate a GENUINE attempt: same shape as blueprint, with natural variation.
 * @param {string} user - 'userA' | 'userB' | 'userC'
 * @param {number} jitterSigma - how much hand wobble (default 3px, realistic)
 * @param {number} scaleFactor - scale the whole signature (1.0 = normal)
 * @param {number} timeOffset - shift timing start (ms)
 */
export function generateGenuine(user = 'userA', jitterSigma = 3, scaleFactor = 1.0, timeOffset = 0) {
  const blueprint = BLUEPRINTS[user];
  if (!blueprint) throw new Error(`Unknown user: ${user}`);
  
  let allPoints = [];
  let t = timeOffset;
  
  for (const [p0, p1, p2, p3] of blueprint) {
    // Scale the control points
    const scale = (p) => ({ x: p.x * scaleFactor, y: p.y * scaleFactor });
    const pts = sampleBezier(scale(p0), scale(p1), scale(p2), scale(p3), 32);
    const timed = addTiming(pts, 3, t);
    const jittered = jitter(timed, jitterSigma);
    allPoints = allPoints.concat(jittered);
    t = allPoints[allPoints.length - 1].t + gauss(50) + 200; // pen lift pause
  }
  
  return allPoints;
}

/**
 * Generate an IMPOSTOR attempt: uses a different user's blueprint.
 * Simulates someone who doesn't know your signature trying random shapes.
 */
export function generateImpostor(enrolledUser = 'userA') {
  const others = Object.keys(BLUEPRINTS).filter(u => u !== enrolledUser);
  const impostorUser = others[Math.floor(Math.random() * others.length)];
  return generateGenuine(impostorUser, 5); // more jitter = less skilled forger
}

/**
 * Generate a SCALED version of a genuine signature.
 * Tests that the system still accepts when the canvas size is different.
 * @param {number} scaleFactor - e.g. 0.7 means 70% of normal size
 */
export function generateScaled(user = 'userA', scaleFactor = 0.7) {
  return generateGenuine(user, 3, scaleFactor);
}

/**
 * Generate a ROBOT signature: same shape but constant speed (no variation).
 * Should FAIL liveness detection. Speed CoV will be near 0.
 */
export function generateRobot(user = 'userA') {
  const blueprint = BLUEPRINTS[user];
  let allPoints = [];
  let t = 0;
  
  for (const [p0, p1, p2, p3] of blueprint) {
    const pts = sampleBezier(p0, p1, p2, p3, 32);
    // CONSTANT timing: every point exactly 20ms apart (robotic)
    const timed = pts.map((p, i) => ({ x: p.x, y: p.y, t: t + i * 20 }));
    t = timed[timed.length - 1].t + 200;
    allPoints = allPoints.concat(timed);
  }
  
  return allPoints;
}

/**
 * Generate a REPLAY ATTACK: byte-for-byte copy of a recorded signature.
 * Should FAIL replay detection (timing fingerprint is statistically identical).
 */
export function generateReplay(originalSignature) {
  // Perfect copy — no variation at all
  return originalSignature.map(p => ({ ...p }));
}

/**
 * Generate a SLIGHT FORGERY: correct shape but with too much jitter.
 * Simulates someone who has seen the signature but can't replicate it perfectly.
 */
export function generateForgery(user = 'userA') {
  return generateGenuine(user, 18, 1.0); // 18px jitter — very shaky
}

/**
 * Generate a TRAILING DOT version: like the user naturally ends with a dot.
 * Tests that the system still accepts when the dot is missing on login.
 */
export function generateWithTrailingDot(user = 'userA') {
  const sig = generateGenuine(user);
  const lastPt = sig[sig.length - 1];
  // Add a cluster of near-identical points (a dot = no movement + pause)
  for (let i = 0; i < 8; i++) {
    sig.push({ x: lastPt.x + gauss(0.5), y: lastPt.y + gauss(0.5), t: lastPt.t + 400 + i * 50 });
  }
  return sig;
}

/**
 * Generate a signature WITHOUT a trailing dot.
 * When paired with generateWithTrailingDot, both should authenticate together.
 */
export function generateWithoutTrailingDot(user = 'userA') {
  return generateGenuine(user); // base version has no dot
}

/**
 * Batch generator: produce N genuine + N impostor pairs for FAR/FRR testing.
 * Returns { genuine: Point[][], impostor: Point[][] }
 */
export function generateBatch(user = 'userA', n = 100) {
  return {
    genuine:  Array.from({ length: n }, () => generateGenuine(user, 3 + Math.random() * 4)),
    impostor: Array.from({ length: n }, () => generateImpostor(user)),
  };
}
