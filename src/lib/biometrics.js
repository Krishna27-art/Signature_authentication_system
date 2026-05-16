/* =========================================================
   biometrics.js — Optimized Signature Biometric Engine
   ========================================================= */

import { getSignatureEmbedding, cosineSimilarity } from './image_model';
import { extractBehavioralFeatures, trainBehavioralModel, saveModel, loadModel, predictBehavior } from './behavioral_model';
import { fuseScores, dtwDistanceToSimilarity, ptDist, getDynamicThreshold, standardize, summarizeNearestDistances } from './score_fusion';

// ── IndexedDB + AES-GCM encrypted store ──────────────────
const DB_NAME = "BiometricP2", STORE_NAME = "store";
export const BDB = {
  db: null, key: null, cache: {},
  async init() {
    if (!window.crypto || !window.crypto.subtle) {
      throw new Error("Secure Context (HTTPS/Localhost) required for biometric security.");
    }
    if (this.db) return;
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = e => { const d = e.target.result; if (!d.objectStoreNames.contains(STORE_NAME)) d.createObjectStore(STORE_NAME); };
      r.onsuccess = async e => { this.db = e.target.result; await this._initKey(); res(); };
      r.onerror = e => rej(e);
    });
  },
  async _initKey() {
    let salt = localStorage.getItem("p2_salt");
    let saltBuf;
    if (!salt) { 
        saltBuf = crypto.getRandomValues(new Uint8Array(16)); 
        localStorage.setItem("p2_salt", [...saltBuf].join(",")); 
    } else {
        saltBuf = new Uint8Array(salt.split(",").map(Number));
    }

    // FIX: Proper PBKDF2 derivation using device secret
    const secret = navigator.userAgent + screen.width + screen.height;
    const raw = await crypto.subtle.importKey(
        "raw", 
        new TextEncoder().encode(secret), 
        { name: "PBKDF2" }, 
        false, 
        ["deriveKey"]
    );
    this.key = await crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: saltBuf, iterations: 150000, hash: "SHA-256" }, 
        raw, 
        { name: "AES-GCM", length: 256 }, 
        false, 
        ["encrypt", "decrypt"]
    );
  },
  async set(k, v) {
    this.cache[k] = v;
    await this.init();
    const str = typeof v === "string" ? v : JSON.stringify(v);
    const iv  = crypto.getRandomValues(new Uint8Array(12));
    const enc = await crypto.subtle.encrypt({ name:"AES-GCM", iv }, this.key, new TextEncoder().encode(str));
    return new Promise((res, rej) => {
      const tx = this.db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put({ iv, data: enc }, k);
      tx.oncomplete = res; tx.onerror = rej;
    });
  },
  async get(k, fb = null) {
    if (this.cache[k] !== undefined) return this.cache[k];
    await this.init();
    return new Promise((res, rej) => {
      const tx = this.db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(k);
      req.onsuccess = async () => {
        if (!req.result) { this.cache[k] = fb; return res(fb); }
        try {
          const dec = await crypto.subtle.decrypt({ name:"AES-GCM", iv:req.result.iv }, this.key, req.result.data);
          const str = new TextDecoder().decode(dec);
          try { const p = JSON.parse(str); this.cache[k] = p; res(p); } catch { this.cache[k] = str; res(str); }
        } catch { res(fb); }
      };
      req.onerror = rej;
    });
  },
  async del(k) { delete this.cache[k]; await this.init(); return new Promise((res,rej)=>{ const tx=this.db.transaction(STORE_NAME,"readwrite"); tx.objectStore(STORE_NAME).delete(k); tx.oncomplete=res; tx.onerror=rej; }); }
};

// ── State ─────────────────────────────────────────────────
export const DEFAULT_STATE = () => ({
  template: null, anchorSamples: [], adaptSamples: [],
  threshold: 0.15, device: null, attempts: 0, lockUntil: 0,
  successCount: 0, avgVelVar: 0, lastTiming: [], avgScore: null,
  sampEnTemplate: 0, hmmTemplate: new Array(9).fill(0), motorTemplate: new Array(6).fill(0),
  imageEmbedding: null, behavioralTrained: false, behavioralStats: null,
  fusedThreshold: 75
});
export const readState  = async () => (await BDB.get("bio_state", null)) || DEFAULT_STATE();
export const writeState = async s  => BDB.set("bio_state", s);

// ── Device Fingerprint ────────────────────────────────────
export async function getDeviceHash() {
  const tc = document.createElement("canvas"); tc.width=200; tc.height=50;
  const tx = tc.getContext("2d");
  tx.fillStyle="#f0f"; tx.fillRect(0,0,200,50);
  tx.fillStyle="#069"; tx.font="14px Arial"; tx.fillText("BioP2",2,15);
  tx.fillStyle="rgba(102,204,0,0.7)"; tx.font="18px Times New Roman"; tx.fillText("BioP2",4,45);
  const canStr = tc.toDataURL();
  let audio = "no_audio";
  try {
    const ac = new (window.AudioContext||window.webkitAudioContext)({sampleRate:44100});
    const osc = ac.createOscillator(), an = ac.createAnalyser(), g = ac.createGain();
    g.gain.value=0; osc.connect(an); an.connect(g); g.connect(ac.destination); osc.start();
    const d = new Float32Array(an.frequencyBinCount); an.getFloatFrequencyData(d); osc.stop(); ac.close();
    audio = [...d.slice(0,20)].map(v=>v.toFixed(3)).join(",");
  } catch {
    // Audio fingerprinting is optional.
  }
  const combined = `${navigator.userAgent}|${screen.width}x${screen.height}|${navigator.hardwareConcurrency||2}|${'ontouchstart' in window}|${Intl.DateTimeFormat().resolvedOptions().timeZone}|${navigator.language}|${screen.colorDepth}|${canStr}|${audio}`;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(combined));
  return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,"0")).join("");
}

// ── Signal Processing ─────────────────────────────────────
const dist  = (a,b) => Math.hypot(a.x-b.x, a.y-b.y);
const pLen  = pts => { let d=0; for(let i=1;i<pts.length;i++) d+=dist(pts[i-1],pts[i]); return d; };

function resample(pts, n=32) {
  if (pts.length < 2) return pts;
  const I = pLen(pts)/(n-1); let D=0;
  const out=[pts[0]]; let cp=[...pts];
  for (let i=1;i<cp.length;i++) {
    const d=dist(cp[i-1],cp[i]);
    if (D+d>=I) {
      const t=(I-D)/d;
      const np = {
        x:  cp[i-1].x +t*(cp[i].x -cp[i-1].x),
        y:  cp[i-1].y +t*(cp[i].y -cp[i-1].y),
        t:  cp[i-1].t +t*(cp[i].t -cp[i-1].t),
        p:  (cp[i-1].p||0.5)+t*((cp[i].p||0.5)-(cp[i-1].p||0.5)),
        gap: cp[i-1].gap>0 ? cp[i-1].gap : (cp[i].gap||0),
      };
      out.push(np); cp.splice(i,0,np); D=0;
    } else D+=d;
  }
  while(out.length<n) out.push(out[out.length-1]);
  return out.slice(0,n);
}

function normalize(pts, n=32) {
  if (pts.length < 5) return null;
  const xs=pts.map(p=>p.x), ys=pts.map(p=>p.y);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const sz=Math.max(maxX-minX,maxY-minY)||1;
  let p = pts.map(p=>({...p,x:(p.x-minX)/sz,y:(p.y-minY)/sz}));
  p = resample(p, n);
  p = p.map((p,i)=>{
    const prev=p[i-1]||p;
    const dx=p.x-prev.x,dy=p.y-prev.y,dt=Math.max(p.t-prev.t,1);
    const vel = i===0 ? 0 : Math.hypot(dx,dy)/dt;
    const dir = i===0 ? 0 : Math.atan2(dy,dx);
    return {...p,vel,dir};
  });
  return p;
}

function dtw(s1, s2) {
  const n=s1.length,m=s2.length,w=Math.max(Math.floor(n*0.15),5);
  const C=Array.from({length:n},()=>new Float32Array(m).fill(Infinity));
  C[0][0]=ptDist(s1[0],s2[0]);
  for(let i=1;i<n;i++) if(i<=w) C[i][0]=C[i-1][0]+ptDist(s1[i],s2[0]);
  for(let j=1;j<m;j++) if(j<=w) C[0][j]=C[0][j-1]+ptDist(s1[0],s2[j]);
  for(let i=1;i<n;i++){
    const jS=Math.max(1,i-w),jE=Math.min(m-1,i+w);
    for(let j=jS;j<=jE;j++) C[i][j]=ptDist(s1[i],s2[j])+Math.min(C[i-1][j],C[i][j-1],C[i-1][j-1]);
  }
  const r=C[n-1][m-1]; return isFinite(r)?r/(n+m):999;
}

// ── Enroll ────────────────────────────────────────────────
const ENROLL_N = 5;

export async function enrollSample(pts, state, partials, canvas, strokes) {
  console.log("🛠 [Enroll] Starting sample enrollment. Points:", pts.length);
  const norm = normalize(pts, 32);
  if (!norm) return { err: "Signature too short. Try again." };
  
  partials.push(norm);
  await BDB.set("partials", partials);

  // FIX: Use RAW points for behavioral features
  const feat = extractBehavioralFeatures(pts, strokes || [pts]);
  const enrollFeats = await BDB.get("enroll_feats", []);
  enrollFeats.push(feat);
  await BDB.set("enroll_feats", enrollFeats);

  if (canvas) {
    try {
      console.log("📸 [Enroll] Extracting image embedding...");
      const emb = await getSignatureEmbedding(canvas);
      const enrollEmbs = (await BDB.get("enroll_embs", []));
      enrollEmbs.push(emb);
      await BDB.set("enroll_embs", enrollEmbs);
    } catch (err) { console.error("❌ Image embedding error:", err); }
  }

  if (partials.length < ENROLL_N) return { progress: partials.length };

  // Finalize enrollment
  // 1. Image Template (Average)
  const enrollEmbs = await BDB.get("enroll_embs", []);
  let avgEmb = null;
  if (enrollEmbs.length > 0) {
    avgEmb = new Array(enrollEmbs[0].length).fill(0);
    enrollEmbs.forEach(e => e.forEach((v, i) => avgEmb[i] += v / enrollEmbs.length));
  }
  await BDB.del("enroll_embs");

  // 2. Behavioral Stats & Standardization
  const behaviorFeatures = await BDB.get("enroll_feats", []);
  const nF = behaviorFeatures[0].length;
  const mean = new Array(nF).fill(0);
  const std = new Array(nF).fill(0);
  for(let i=0; i<nF; i++) {
    const vals = behaviorFeatures.map(f => f[i]);
    mean[i] = vals.reduce((a,b)=>a+b,0)/vals.length;
    std[i] = Math.sqrt(vals.reduce((s,v)=>s+(v-mean[i])**2,0)/vals.length);
  }
  const standardizedFeatures = behaviorFeatures.map(f => standardize(f, {mean, std}));

  // 3. Train Model
  const behaviorModel = await trainBehavioralModel(standardizedFeatures);
  await saveModel(behaviorModel);
  await BDB.del("enroll_feats");

  const ns = DEFAULT_STATE();
  ns.template = partials[0]; // Simple template
  ns.anchorSamples = [...partials];
  ns.threshold = 0.15; // Starting threshold
  ns.imageEmbedding = avgEmb;
  ns.behavioralTrained = true;
  ns.behavioralStats = {mean, std};
  ns.device = await getDeviceHash();

  await writeState(ns);
  await BDB.del("partials");
  return { done: true, state: ns };
}

// ── Lockout ───────────────────────────────────────────────
export function lockDuration() {
  // Lockout disabled for testing
  return 0;
}

// ── Verify ────────────────────────────────────────────────
export async function verifySample(pts, state, canvas, strokes) {
  console.log("🔍 [Verify] Starting verification. Points:", pts.length);
  // Lockout (Disabled for testing)
  // if (Date.now() < state.lockUntil) return { locked: true, secsLeft: Math.ceil((state.lockUntil-Date.now())/1000) };

  const norm = normalize(pts, 32);
  if (!norm) return { err: "Signature too short." };
  if (!state?.anchorSamples?.length) return { err: "No enrolled signature found. Please enroll again." };

  // Score DTW
  const all = [...state.anchorSamples, ...state.adaptSamples];
  const dtwDistances = all.map(s => dtw(s, norm));
  const dtwFinal = summarizeNearestDistances(dtwDistances, Math.min(3, dtwDistances.length));
  const dtwSimilarity = dtwDistanceToSimilarity(dtwFinal, state.threshold);

  // AI Upgrade: Model 1 (Image)
  let imageScore = null;
  if (canvas && state.imageEmbedding) {
    try {
        const currentEmb = await getSignatureEmbedding(canvas);
        imageScore = cosineSimilarity(state.imageEmbedding, currentEmb);
    } catch(e) { console.error("Image verify failed", e); }
  }

  // AI Upgrade: Model 2 (Behavioral)
  let behaviorScore = null;
  if (state.behavioralTrained) {
    try {
        const model = await loadModel();
        // FIX: Use RAW points
        const rawFeatures = extractBehavioralFeatures(pts, strokes || [pts]);
        const stdFeatures = standardize(rawFeatures, state.behavioralStats);
        if (model) {
          behaviorScore = await predictBehavior(model, stdFeatures);
        }
    } catch(e) { console.error("Behavior verify failed", e); }
  }

  const final = fuseScores(dtwSimilarity, imageScore, behaviorScore);
  const threshold = getDynamicThreshold(state.avgScore);

  if (final >= threshold) {
    state.attempts = 0;
    state.avgScore = state.avgScore === null ? final : state.avgScore * 0.8 + final * 0.2;
    await writeState(state);
    return { pass: true, score: final, threshold };
  } else {
    state.attempts++;
    await writeState(state);
    return { fail: "Not matched.", score: final, threshold, attempts: state.attempts };
  }
}
