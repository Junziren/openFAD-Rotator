import { chromium } from "@playwright/test";
import { PNG } from "pngjs";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

await mkdir("screenshots", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 760 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", e => errors.push(e.message));
await page.goto("http://127.0.0.1:5187");
await page.waitForFunction(() => window.__garden?.ready);
await page.waitForTimeout(500);
async function state() { return page.evaluate(() => window.__garden.values); }
async function drag(locator, dx, dy, fine = false) {
  const b = await locator.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  if (fine) await page.keyboard.down("Shift");
  await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, { steps: 12 });
  await page.mouse.up();
  if (fine) await page.keyboard.up("Shift");
}
assert.equal(await page.evaluate(() => new Set(window.__garden.controlIds).size), 40);
const macro = page.locator('.macro-handle[data-param="character"]');
const initial = (await state()).character;
await drag(macro, 0, -50);
assert.ok((await state()).character > initial + .1);
await macro.dblclick();
assert.equal((await state()).character, initial);
await drag(macro, 0, -50, true);
assert.ok((await state()).character < initial + .08);
await macro.dblclick();
const nodeBefore = await page.evaluate(() => window.__garden.macroNodes);
await macro.focus();
await page.keyboard.press("End");
assert.equal((await state()).character, 1);
assert.notDeepEqual(await page.evaluate(() => window.__garden.macroNodes), nodeBefore);
await page.keyboard.press("Home");
assert.equal((await state()).character, 0);
await macro.dblclick();
const pull = page.locator('.pull[data-param="drive"]');
await drag(pull, 0, -45);
assert.ok((await state()).drive > .3);
await page.getByRole("tab", { name: "旋转" }).click();
assert.equal(await page.locator('.pull[data-param="freeRate"]').getAttribute("aria-disabled"), "true");
await page.getByLabel("转速模式", { exact: true }).selectOption("3");
assert.equal(await page.locator('.pull[data-param="freeRate"]').getAttribute("aria-disabled"), "false");
await drag(page.locator('.pull[data-param="freeRate"]'), 0, -30);
assert.ok((await state()).freeRate > .8);
await page.getByRole("tab", { name: "音箱" }).click();
assert.ok((await state()).drive > .3);
await page.getByRole("button", { name: "恢复全部默认值" }).click();
assert.equal((await state()).drive, .2);
await page.getByLabel("驱动数值", { exact: true }).fill("62");
await page.getByLabel("驱动数值", { exact: true }).press("Enter");
assert.equal((await state()).drive, .62);
await page.getByRole("button", { name: "恢复全部默认值" }).click();
// Verify ray picking on the actual mesh, not just its label.
const target = await page.evaluate(() => window.__garden.targets.find(t => t.id === "motion"));
await page.mouse.move(target.x, target.y);
await page.mouse.down();
await page.mouse.move(target.x, target.y - 40, { steps: 10 });
await page.mouse.up();
assert.ok((await state()).motion > .35);
await page.getByRole("button", { name: "恢复全部默认值" }).click();
const shotA = await page.locator("#garden").screenshot();
await page.waitForTimeout(230);
const shotB = await page.locator("#garden").screenshot();
assert.notDeepEqual(shotA, shotB, "Rotor must animate");
await page.getByRole("button", { name: "暂停演示旋转" }).click();
await page.waitForTimeout(100);
const frame = await page.evaluate(() => window.__garden.frameCount);
await page.waitForTimeout(150);
assert.equal(await page.evaluate(() => window.__garden.frameCount), frame);
await page.getByRole("button", { name: "收起细节参数" }).click();
assert.equal(await page.locator("#bank-content").isVisible(), false);
await page.getByRole("button", { name: "展开细节参数" }).click();
const downloadPromise = page.waitForEvent("download");
await page.getByRole("button", { name: "保存原型快照" }).click();
const download = await downloadPromise;
assert.equal(download.suggestedFilename(), "garden-visual-snapshot.json");
await download.saveAs("screenshots/snapshot.json");
await page.getByLabel("驱动数值", { exact: true }).fill("70");
await page.getByLabel("驱动数值", { exact: true }).press("Enter");
await page.locator("#file").setInputFiles("screenshots/snapshot.json");
await page.waitForFunction(() => window.__garden.values.drive === .2);
for (const key of ["End", "Home"]) {
  for (const id of ["character", "motion", "space", "dream"]) {
    await page.locator(`.macro-handle[data-param="${id}"]`).focus();
    await page.keyboard.press(key);
  }
  await page.screenshot({ path: `screenshots/macros-${key === "End" ? "high" : "low"}.png` });
}
await page.getByRole("button", { name: "恢复全部默认值" }).click();
for (const [width, height] of [[1100,760],[820,600],[390,844]]) {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(180);
  for (let group = 0; group < 6; group++) {
    await page.locator(`[data-group="${group}"]`).click();
    await page.waitForTimeout(80);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight), false);
    const overflow = await page.locator(".macro,.column,.option,header,footer").evaluateAll(els => els.filter(el => {
      const r = el.getBoundingClientRect();
      return r.left < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1;
    }).map(el => el.className));
    assert.deepEqual(overflow, []);
    await page.screenshot({ path: `screenshots/${width}x${height}-group-${group}.png` });
  }
  const png = PNG.sync.read(await page.locator("#garden").screenshot());
  const unique = new Set();
  for (let i = 0; i < png.data.length; i += 64) unique.add(png.data.subarray(i,i+3).toString("hex"));
  assert.ok(unique.size > 100, "Canvas should contain model pixels");
}
assert.deepEqual(errors, []);
await writeFile("screenshots/test-report.json", JSON.stringify({ passed: true, parameters: 40, viewports: ["1100x760","820x600","390x844"], errors, checks: ["macro drag", "fine drag", "reset", "numeric input", "keyboard extremes", "mesh raycast", "pillar drag", "conditional controls", "tab persistence", "snapshot roundtrip", "bank collapse", "animation pixels", "paused scheduling", "nonblank canvas", "layout bounds"] }, null, 2));
await browser.close();
console.log("PASS: 40 parameters, 3 viewports, 18 screenshots, interactions and canvas pixels.");
