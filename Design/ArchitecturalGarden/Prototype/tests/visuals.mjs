import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { PNG } from "pngjs";

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => {
  if (message.type() === "error" && /shader|WebGL|THREE/i.test(message.text())) errors.push(message.text());
});
await page.goto("http://127.0.0.1:5187");
await page.waitForFunction(() => window.__garden?.ready);
await page.getByRole("button", { name: "暂停演示旋转" }).click();
const initial = await page.evaluate(() => window.__garden.values);
const signatures = [];
const responseImages = [];
let referenceCurve;
for (const [width, height] of [[1100,760],[820,600],[390,844]]) {
  await page.setViewportSize({ width, height });
  for (const style of ["original","hologram","comic","cel"]) {
    await page.getByLabel("渲染风格").selectOption(style);
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.__garden.renderStyle), style);
    assert.deepEqual(await page.evaluate(() => window.__garden.values), initial);
    assert.equal(await page.locator("#response-curve").getAttribute("data-render-style"), style);
    const currentCurve = await page.locator("#response-curve").getAttribute("data-curve");
    referenceCurve ??= currentCurve;
    assert.equal(currentCurve, referenceCurve);
    if (width === 1100) responseImages.push((await page.locator("#response").screenshot()).toString("base64"));
    await page.screenshot({ path: `screenshots/style-${style}-${width}.png` });
    const png = PNG.sync.read(await page.locator("#garden").screenshot());
    const colors = new Set();
    for (let i = 0; i < png.data.length; i += 64) colors.add(png.data.subarray(i,i+3).toString("hex"));
    assert.ok(colors.size > 80);
    if (width === 1100) signatures.push([...colors].slice(0,300).join(","));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight), false);
  }
}
assert.equal(new Set(signatures).size, 4);
assert.equal(new Set(responseImages).size, 4, "Response panel must follow all four styles");
await page.setViewportSize({ width: 1100, height: 760 });
await page.waitForTimeout(150);
const curve = await page.locator("#response-curve").getAttribute("data-curve");
await page.getByLabel("音箱模型", { exact: true }).selectOption("0");
assert.notEqual(await page.locator("#response-curve").getAttribute("data-curve"), curve);
await page.getByLabel("音箱模型", { exact: true }).selectOption("1");
assert.equal(await page.locator("#response-curve").getAttribute("data-curve"), curve);
await page.getByLabel("渲染风格").selectOption("original");
await page.waitForTimeout(100);
const fxOn = await page.locator("#garden").screenshot();
await page.getByLabel("特效演示", { exact: true }).uncheck();
await page.waitForTimeout(100);
assert.notDeepEqual(await page.locator("#garden").screenshot(), fxOn);
await page.getByLabel("特效演示", { exact: true }).check();
const effectImages = [];
for (const mode of ["combined", "legacy", "spatial"]) {
  await page.getByLabel("特效组合").selectOption(mode);
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => window.__garden.effectMode), mode);
  effectImages.push(await page.locator("#garden").screenshot());
}
assert.notDeepEqual(effectImages[1], effectImages[2]);
const responseBounds = await page.locator("#response").boundingBox();
const columnBounds = await page.locator("#columns").boundingBox();
assert.ok(responseBounds.x + responseBounds.width <= columnBounds.x + 1);
assert.ok(responseBounds.height > 140);
assert.equal(await page.getByText("音箱 EQ", { exact: true }).count(), 0);
await page.getByRole("tab", { name: "梦境" }).click();
await page.getByLabel("渲染风格").selectOption("comic");
await page.locator('.pull[data-param="diffusion"]').focus();
await page.keyboard.press("End");
assert.equal(await page.evaluate(() => window.__garden.values.diffusion), 1);
assert.deepEqual(errors, []);
await writeFile("screenshots/visual-test-report.json", JSON.stringify({ passed:true, styles:4, viewports:3, checks:["distinct nonblank styles","no shader errors","style preserves parameter state","EQ model response","effect toggle changes pixels","pillar keyboard in comic mode"], errors },null,2));
await browser.close();
console.log("PASS: 4 styles x 3 viewports, EQ and effect toggle, shader and parameter checks.");
