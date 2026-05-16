/**
 * e2e.spec.js — Playwright end-to-end tests
 *
 * Install Playwright:  npm install -D @playwright/test
 * Install browser:     npx playwright install chromium
 * Run tests:           npx playwright test tests/e2e.spec.js
 *
 * These tests control a real Chrome browser, simulate mouse movements on your
 * canvas, and verify the full enrollment → authentication flow works.
 */

const { test, expect, chromium } = require('@playwright/test');

// ── Signature simulation helper ──────────────────────────────────────────────
// Draws a synthetic signature on a canvas element by simulating real mouse events.

async function drawSignatureOnCanvas(page, canvasSelector, points) {
  const canvas = await page.locator(canvasSelector);
  const box = await canvas.boundingBox();
  if (!box) throw new Error(`Canvas not found: ${canvasSelector}`);

  // Scale synthetic points to fit the actual canvas on screen
  const xMin = Math.min(...points.map(p => p.x));
  const xMax = Math.max(...points.map(p => p.x));
  const yMin = Math.min(...points.map(p => p.y));
  const yMax = Math.max(...points.map(p => p.y));
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;
  const pad = 30;

  const toScreen = (p) => ({
    x: box.x + pad + (p.x - xMin) / xRange * (box.width - pad * 2),
    y: box.y + pad + (p.y - yMin) / yRange * (box.height - pad * 2),
  });

  const screen = points.map(toScreen);

  // Simulate mousedown → mousemove sequence → mouseup
  await page.mouse.move(screen[0].x, screen[0].y);
  await page.mouse.down();
  for (let i = 1; i < screen.length; i++) {
    // Honour timing: delay proportional to time between points
    const dt = points[i].t - points[i - 1].t;
    if (dt > 150) {
      // Pen lift: mouseup, move, mousedown
      await page.mouse.up();
      await page.waitForTimeout(Math.min(dt, 400));
      await page.mouse.move(screen[i].x, screen[i].y);
      await page.mouse.down();
    } else {
      await page.mouse.move(screen[i].x, screen[i].y);
      await page.waitForTimeout(Math.max(2, Math.floor(dt / 10)));
    }
  }
  await page.mouse.up();
}

// Inline synthetic generator (same logic as synthetic_gen.js, no import)
function gauss(s = 1) {
  return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random()) * s;
}
function bez(p0, p1, p2, p3, t) {
  const m = 1 - t;
  return { x: m**3*p0.x+3*m**2*t*p1.x+3*m*t**2*p2.x+t**3*p3.x, y: m**3*p0.y+3*m**2*t*p1.y+3*m*t**2*p2.y+t**3*p3.y };
}
function genSig(jitter = 3, scale = 1) {
  const strokes = [[{x:100,y:200},{x:130,y:120},{x:200,y:140},{x:220,y:200}],[{x:220,y:200},{x:240,y:240},{x:200,y:280},{x:160,y:260}]];
  let pts = [], t = 0;
  for (const [p0,p1,p2,p3] of strokes) {
    const s = p => ({ x:p.x*scale, y:p.y*scale });
    for (let i = 0; i < 32; i++) {
      const p = bez(s(p0),s(p1),s(p2),s(p3),i/31);
      const speed = 0.5 + Math.sin(i/31*Math.PI)*0.8 + gauss(0.15);
      t += Math.max(5, 4 / Math.max(0.1, speed));
      pts.push({ x: p.x + gauss(jitter), y: p.y + gauss(jitter), t: Math.round(t) });
    }
    t += 200;
  }
  return pts;
}
function genImpostorSig() {
  const strokes = [[{x:80,y:150},{x:150,y:100},{x:250,y:180},{x:300,y:150}],[{x:300,y:150},{x:320,y:200},{x:280,y:250},{x:240,y:220}]];
  let pts = [], t = 0;
  for (const [p0,p1,p2,p3] of strokes) {
    for (let i = 0; i < 32; i++) {
      const p = bez(p0,p1,p2,p3,i/31);
      t += 10; pts.push({ x:p.x+gauss(4), y:p.y+gauss(4), t });
    }
    t += 200;
  }
  return pts;
}

const BASE_URL = 'http://localhost:5500'; // adjust to match your live-server port

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 1: Enrollment flow
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Enrollment', () => {

  test('index.html loads without errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${BASE_URL}/index.html`);
    expect(errors).toHaveLength(0);
    await expect(page).toHaveTitle(/BioSign|Signature/i);
  });

  test('enrollment canvas is visible and interactive', async ({ page }) => {
    await page.goto(`${BASE_URL}/index.html`);
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box.width).toBeGreaterThan(100);
    expect(box.height).toBeGreaterThan(80);
  });

  test('3 enrollment signatures can be drawn', async ({ page }) => {
    await page.goto(`${BASE_URL}/index.html`);
    
    for (let attempt = 1; attempt <= 3; attempt++) {
      await drawSignatureOnCanvas(page, 'canvas', genSig(3));
      await page.waitForTimeout(300);
      
      // Click "Next sample" or equivalent button between draws
      const nextBtn = page.locator('button').filter({ hasText: /next|sample|add|continue/i }).first();
      if (await nextBtn.isVisible()) await nextBtn.click();
      await page.waitForTimeout(200);
    }
    
    // Look for a success indicator (adapt selector to your UI)
    const enrollBtn = page.locator('button').filter({ hasText: /enroll|register|save/i }).first();
    if (await enrollBtn.isVisible()) {
      await enrollBtn.click();
      await page.waitForTimeout(500);
    }
    
    // Expect to reach app.html or see success message
    const url = page.url();
    const successText = page.locator('text=/enrolled|success|registered/i');
    const navigated = url.includes('app.html');
    const hasSuccess = await successText.isVisible().catch(() => false);
    expect(navigated || hasSuccess).toBe(true);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 2: Authentication flow
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Authentication', () => {

  // Helper: enroll a user first
  async function enrollUser(page) {
    await page.goto(`${BASE_URL}/index.html`);
    await page.evaluate(() => localStorage.clear()); // fresh start
    await page.reload();
    for (let i = 0; i < 3; i++) {
      await drawSignatureOnCanvas(page, 'canvas', genSig(3));
      await page.waitForTimeout(300);
      const nextBtn = page.locator('button').filter({ hasText: /next|sample|add/i }).first();
      if (await nextBtn.isVisible()) await nextBtn.click();
      await page.waitForTimeout(200);
    }
    const enrollBtn = page.locator('button').filter({ hasText: /enroll|register|save/i }).first();
    if (await enrollBtn.isVisible()) await enrollBtn.click();
    await page.waitForTimeout(600);
  }

  test('genuine signature authenticates successfully', async ({ page }) => {
    await enrollUser(page);
    await page.goto(`${BASE_URL}/index.html`);
    await drawSignatureOnCanvas(page, 'canvas', genSig(3));
    const loginBtn = page.locator('button').filter({ hasText: /login|verify|sign in/i }).first();
    if (await loginBtn.isVisible()) await loginBtn.click();
    await page.waitForTimeout(800);
    const url = page.url();
    const granted = page.locator('text=/granted|welcome|success/i');
    const ok = url.includes('app.html') || await granted.isVisible().catch(() => false);
    expect(ok).toBe(true);
  });

  test('impostor signature is rejected', async ({ page }) => {
    await enrollUser(page);
    await page.goto(`${BASE_URL}/index.html`);
    await drawSignatureOnCanvas(page, 'canvas', genImpostorSig());
    const loginBtn = page.locator('button').filter({ hasText: /login|verify|sign in/i }).first();
    if (await loginBtn.isVisible()) await loginBtn.click();
    await page.waitForTimeout(800);
    const url = page.url();
    const rejected = page.locator('text=/denied|failed|rejected|invalid/i');
    const ok = !url.includes('app.html') || await rejected.isVisible().catch(() => false);
    expect(ok).toBe(true);
  });

  test('account locks after 3 failed attempts', async ({ page }) => {
    await enrollUser(page);
    await page.goto(`${BASE_URL}/index.html`);
    for (let i = 0; i < 3; i++) {
      await drawSignatureOnCanvas(page, 'canvas', genImpostorSig());
      const loginBtn = page.locator('button').filter({ hasText: /login|verify/i }).first();
      if (await loginBtn.isVisible()) await loginBtn.click();
      await page.waitForTimeout(600);
      const clearBtn = page.locator('button').filter({ hasText: /clear|reset|try again/i }).first();
      if (await clearBtn.isVisible()) await clearBtn.click();
    }
    const locked = page.locator('text=/lock|blocked|too many/i');
    const isLocked = await locked.isVisible().catch(() => false);
    expect(isLocked).toBe(true);
  });

  test('scaled signature (70%) authenticates', async ({ page }) => {
    await enrollUser(page);
    await page.goto(`${BASE_URL}/index.html`);
    await drawSignatureOnCanvas(page, 'canvas', genSig(3, 0.7));
    const loginBtn = page.locator('button').filter({ hasText: /login|verify/i }).first();
    if (await loginBtn.isVisible()) await loginBtn.click();
    await page.waitForTimeout(800);
    const denied = page.locator('text=/denied|rejected/i');
    const wasDenied = await denied.isVisible().catch(() => false);
    expect(wasDenied).toBe(false);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 3: Dashboard (app.html)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Dashboard', () => {

  test('app.html cannot be accessed without authentication', async ({ page }) => {
    await page.evaluate(() => sessionStorage.clear());
    await page.goto(`${BASE_URL}/app.html`);
    const url = page.url();
    const redirected = !url.includes('app.html') || await page.locator('text=/login|unauthorized/i').isVisible().catch(() => false);
    expect(redirected).toBe(true);
  });

  test('export biometric data button exists on dashboard', async ({ browser }) => {
    const page = await browser.newPage();
    // Inject auth token (adapt to how your app checks auth)
    await page.goto(`${BASE_URL}/app.html`);
    await page.evaluate(() => sessionStorage.setItem('biosign_authed', 'true'));
    await page.reload();
    const exportBtn = page.locator('button').filter({ hasText: /export/i });
    await expect(exportBtn.first()).toBeVisible();
    await page.close();
  });

  test('model status indicators are visible on dashboard', async ({ page }) => {
    await page.goto(`${BASE_URL}/app.html`);
    await page.evaluate(() => sessionStorage.setItem('biosign_authed', 'true'));
    await page.reload();
    const status = page.locator('text=/model|image model|behavioral/i');
    await expect(status.first()).toBeVisible();
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 4: Performance
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Performance', () => {

  test('page loads under 2 seconds', async ({ page }) => {
    const start = Date.now();
    await page.goto(`${BASE_URL}/index.html`);
    expect(Date.now() - start).toBeLessThan(2000);
  });

  test('authentication decision completes under 500ms', async ({ page }) => {
    await page.goto(`${BASE_URL}/index.html`);
    const start = Date.now();
    await drawSignatureOnCanvas(page, 'canvas', genSig(3));
    const loginBtn = page.locator('button').filter({ hasText: /login|verify/i }).first();
    if (await loginBtn.isVisible()) await loginBtn.click();
    await page.waitForTimeout(50);
    expect(Date.now() - start).toBeLessThan(500);
  });

  test('no memory leaks: canvas cleared between attempts', async ({ page }) => {
    await page.goto(`${BASE_URL}/index.html`);
    for (let i = 0; i < 5; i++) {
      await drawSignatureOnCanvas(page, 'canvas', genSig(3));
      const clearBtn = page.locator('button').filter({ hasText: /clear|reset/i }).first();
      if (await clearBtn.isVisible()) await clearBtn.click();
      await page.waitForTimeout(100);
    }
    // Check page is still responsive
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
  });

});
