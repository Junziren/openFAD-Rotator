import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const out = "../build-vs/validation/garden-native";
await mkdir(out, { recursive: true });
const browser = await chromium.connectOverCDP(process.env.ROTATOR_CDP ?? "http://127.0.0.1:9231");
const page = browser.contexts()[0].pages().find(p => p.url().startsWith("https://juce.backend/"));
assert.ok(page, "Launch the native editor with a local WebView2 debugging port");
const errors = [], requests = [];
page.on("pageerror", e => errors.push(e.message));
page.on("console", message => {
  if (message.type() === "error" && /shader|THREE|WebGL/i.test(message.text())) errors.push(message.text());
});
page.on("request", request => requests.push(request.url()));
await page.reload();
await page.waitForFunction(() => window.__garden?.ready && window.__garden.connected);
await page.evaluate(() => {
  window.__probe = { commands: [], states: [], telemetry: [] };
  const backend = window.__JUCE__.backend;
  const original = backend.emitEvent.bind(backend);
  backend.emitEvent = (id, payload) => {
    if (id === "__juce__invoke" && payload.name === "rotatorCommand")
      window.__probe.commands.push(JSON.parse(payload.params[0]));
    return original(id, payload);
  };
  backend.addEventListener("state", payload => window.__probe.states.push(payload));
  backend.addEventListener("telemetry", payload => window.__probe.telemetry.push(payload));
});
assert.equal(await page.locator("#pause,#reset,#save,#load,#about-button,.prototype-tag").count(), 0);
assert.equal(await page.locator("#preset-select option").count(), 9);
await page.locator("#preset-select").selectOption("0");
await page.waitForTimeout(160);
const before = await page.evaluate(() => window.__garden.values.drive);
const slider = page.locator('.pull[data-param="drive"]');
const b = await slider.boundingBox();
await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
await page.mouse.down();
await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 - 40, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(200);
assert.ok(await page.evaluate(() => window.__garden.values.drive) > before);
const gestures = await page.evaluate(() => window.__probe.commands.filter(c => c.id === "drive"));
assert.equal(gestures[0].phase, "begin");
assert.equal(gestures.at(-1).phase, "end");
assert.equal(gestures.filter(c => c.phase === "begin").length, 1);
assert.equal(gestures.filter(c => c.phase === "end").length, 1);
const state = await page.evaluate(() => window.__probe.states.at(-1));
assert.ok(state.parameters.find(p => p.id === "drive").value > before);
assert.equal(state.parameters.length, 40);
assert.ok((await page.locator("#preset-select option:checked").textContent()).endsWith("*"));
await page.locator("#preset-select").selectOption("0");
await page.waitForTimeout(180);
assert.equal(await page.evaluate(() => window.__garden.values.drive), before);
assert.ok(!(await page.locator("#preset-select option:checked").textContent()).endsWith("*"));
for (const style of ["original","hologram","comic","cel"]) {
  const values = await page.evaluate(() => window.__garden.values);
  await page.getByLabel("渲染风格").selectOption(style);
  await page.waitForTimeout(120);
  assert.deepEqual(await page.evaluate(() => window.__garden.values), values);
  await page.screenshot({ path: `${out}/${style}.png` });
}
await page.locator("#brand").click();
await page.waitForTimeout(450);
const frames = await page.evaluate(() => window.__garden.frameCount);
await page.waitForTimeout(150);
assert.equal(await page.evaluate(() => window.__garden.frameCount), frames);
await page.screenshot({ path: `${out}/about.png` });
await page.keyboard.press("Escape");
await page.getByLabel("渲染风格").selectOption("original");
const telemetry = await page.evaluate(() => window.__probe.telemetry.at(-1));
assert.equal(typeof telemetry.drumPhase, "number");
assert.equal(typeof telemetry.drumSignedRate, "number");
assert.ok(requests.some(url => url.endsWith("models/acoustic-garden.glb")));
assert.ok(requests.every(url => url.startsWith("https://juce.backend/") || url.startsWith("data:")), requests.join("\n"));
assert.deepEqual(errors, []);
await writeFile(`${out}/report.json`, JSON.stringify({
  passed: true, surface: "native JUCE editor / WebView2", url: page.url(), parameters: state.parameters.length,
  checks: ["embedded GLB", "no external resource requests", "native gesture begin/set/end", "native parameter echo", "factory preset restore including same index", "dirty indicator", "four styles", "About suspension", "real drum telemetry"],
  errors, requestCount: requests.length,
}, null, 2));
await browser.close();
console.log("PASS: native editor, embedded GLB, 40 parameters, gestures, presets, four styles, About, telemetry.");
