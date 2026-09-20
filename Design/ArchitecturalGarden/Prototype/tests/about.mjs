import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
const errors = [];
page.on("pageerror", e => errors.push(e.message));
await page.goto("http://127.0.0.1:5187");
await page.waitForFunction(() => window.__garden?.ready);
const initial = await page.evaluate(() => window.__garden.values);
for (const style of ["original", "hologram", "comic", "cel"]) {
  await page.getByLabel("渲染风格").selectOption(style);
  await page.locator("#brand").click();
  assert.equal(await page.locator("#about").isVisible(), true);
  await page.waitForTimeout(450);
  const frames = await page.evaluate(() => window.__garden.frameCount);
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => window.__garden.frameCount), frames);
  for (let i = 0; i < 7; i++) {
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement.closest("#about") !== null), true);
  }
  await page.screenshot({ path: `screenshots/about-${style}.png` });
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#about").isVisible(), false);
  assert.equal(await page.evaluate(() => document.activeElement.id), "brand");
  assert.deepEqual(await page.evaluate(() => window.__garden.values), initial);
}
await page.getByRole("button", { name: "减少动态效果", exact: true }).click();
await page.waitForTimeout(100);
const frozen = await page.evaluate(() => window.__garden.frameCount);
await page.waitForTimeout(150);
assert.equal(await page.evaluate(() => window.__garden.frameCount), frozen);
await page.getByRole("button", { name: "打开 About", exact: true }).click();
assert.equal(await page.locator("#about").evaluate(el => getComputedStyle(el).animationName), "none");
await page.getByRole("button", { name: "关闭 About", exact: true }).click();
for (const [width, height] of [[820,600],[390,844]]) {
  await page.setViewportSize({ width, height });
  for (const size of ["小","中","大"]) {
    await page.getByRole("button", { name: `${size}界面`, exact: true }).click();
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight), false);
  }
  await page.screenshot({ path:`screenshots/header-${width}.png` });
  await page.locator("#brand").click();
  await page.screenshot({ path:`screenshots/about-${width}.png` });
  await page.keyboard.press("Escape");
}
assert.deepEqual(errors, []);
await browser.close();
console.log("PASS: About modal, focus, pause/resume, styles, sizes, reduced motion and responsive bounds.");
