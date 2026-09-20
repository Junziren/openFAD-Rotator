import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const out = "../build-vs/validation/garden-browser";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({ viewport: { width: 1100, height: 760 } });
await context.addInitScript(() => {
  const listeners = new Map();
  let token = 0, contract;
  const state = { parameters: [], program: 0, programName: "Test Preset", programNames: ["Test Preset","Second Preset"], programCount: 2, presetRevision: 0 };
  const emit = (id, value) => {
    for (const listener of listeners.values()) if (listener.id === id) listener.fn(value);
  };
  window.__mock = { commands: [], emit, state };
  window.__JUCE__ = { backend: {
    addEventListener(id, fn) { listeners.set(++token, { id, fn }); return token; },
    removeEventListener(id) { listeners.delete(id); },
    async emitEvent(id, payload) {
      if (id !== "__juce__invoke") return;
      const c = JSON.parse(payload.params[0]);
      window.__mock.commands.push(c);
      if (!contract) contract = await import("/src/parameterContract.ts");
      if (!state.parameters.length) state.parameters = Object.entries(contract.defaultPluginValues)
        .filter(([id]) => id !== "bpm").map(([id, value]) => ({
          id, value: contract.normalisedForParameter(id, value), default: contract.normalisedForParameter(id, value),
        }));
      if (c.type === "parameter" && c.phase === "set") state.parameters.find(p => p.id === c.id).value = c.value;
      if (["program","nextProgram","previousProgram"].includes(c.type)) {
        state.program = c.type === "program" ? c.index : 1 - state.program;
        state.programName = state.programNames[state.program];
        state.presetRevision++;
        state.parameters.forEach(p => p.value = p.default);
      }
      if (["uiReady","parameter","program","nextProgram","previousProgram"].includes(c.type)) emit("state", structuredClone(state));
      emit("__juce__complete", { promiseId: payload.resultId, result: { ok: true } });
    },
  }};
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", e => errors.push(e.message));
await page.goto("http://127.0.0.1:5188");
await page.waitForFunction(() => window.__garden?.ready && window.__garden.connected);
assert.equal(await page.locator("#pause,#reset,#save,#load,#about-button").count(), 0);
const pull = page.locator('.pull[data-param="drive"]');
const b = await pull.boundingBox();
await page.mouse.move(b.x + b.width / 2, b.y + 70);
await page.mouse.down();
await page.mouse.move(b.x + b.width / 2, b.y + 25, { steps: 8 });
await page.evaluate(() => window.dispatchEvent(new Event("blur")));
await page.mouse.up();
let gestures = await page.evaluate(() => window.__mock.commands.filter(c => c.type === "parameter"));
assert.equal(gestures[0].phase, "begin");
assert.equal(gestures.at(-1).phase, "end");
assert.equal(gestures.filter(c => c.phase === "begin").length, 1);
assert.equal(gestures.filter(c => c.phase === "end").length, 1);
const count = gestures.length;
await page.evaluate(() => {
  window.__mock.state.parameters.find(p => p.id === "drive").value = .73;
  window.__mock.emit("state", structuredClone(window.__mock.state));
});
assert.equal(await page.evaluate(() => window.__garden.values.drive), .73);
assert.equal(await page.evaluate(() => window.__mock.commands.filter(c => c.type === "parameter").length), count, "Host echo must not emit gestures");
await page.locator("#preset-select").selectOption("1");
assert.equal(await page.evaluate(() => window.__garden.values.drive), .2);
await page.locator("#preset-action").selectOption("save");
await page.locator("#preset-action").selectOption("open");
const commands = await page.evaluate(() => window.__mock.commands);
assert.ok(commands.some(c => c.type === "savePreset"));
assert.ok(commands.some(c => c.type === "openPreset"));
await page.getByLabel("驱动数值", { exact: true }).fill("95");
await page.getByLabel("驱动数值", { exact: true }).press("Escape");
assert.equal(await page.evaluate(() => window.__garden.values.drive), .2);
await page.evaluate(() => window.__mock.emit("telemetry", {
  rotorPhase: 1.1, rotorRate: .8, rotorSignedRate: .8,
  drumPhase: .7, drumSignedRate: .35, audioSequence: 15, bands: [.02,.01,.02], bpm:120,
}));
await page.waitForTimeout(250);
const stopped = await page.evaluate(() => window.__garden.frameCount);
await page.waitForTimeout(120);
assert.equal(await page.evaluate(() => window.__garden.frameCount), stopped, "Stale audio must stop continuous rendering");
for (const [width,height] of [[1100,760],[820,600],[390,844]]) {
  await page.setViewportSize({ width,height });
  for (const style of ["original","hologram","comic","cel"]) {
    await page.getByLabel("渲染风格").selectOption(style);
    await page.waitForTimeout(80);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight), false);
    await page.screenshot({ path: `${out}/${width}-${style}.png` });
  }
}
await page.locator("#brand").click();
await page.waitForTimeout(300);
const frozen = await page.evaluate(() => window.__garden.frameCount);
await page.evaluate(() => window.__mock.emit("telemetry", { rotorPhase: 2, drumPhase:1, audioSequence: 30, bands:[.03,.03,.03] }));
await page.waitForTimeout(150);
assert.equal(await page.evaluate(() => window.__garden.frameCount), frozen);
await page.keyboard.press("Escape");
assert.deepEqual(errors, []);
await writeFile(`${out}/report.json`, JSON.stringify({ passed:true, checks:["40 parameter bridge","gesture cancellation","host echo no feedback","preset calls","numeric Escape","stale telemetry suspension","four styles / three sizes","About suspension"], errors },null,2));
await browser.close();
console.log("PASS: production garden browser bridge and responsive checks.");
