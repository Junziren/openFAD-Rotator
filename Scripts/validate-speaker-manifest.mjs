import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "Resources", "Speakers", "profiles.json");
const source = fs.readFileSync(manifestPath, "utf8");
const manifest = JSON.parse(source);

if (manifest.schemaVersion !== 1)
  throw new Error(`Expected schemaVersion 1, received ${manifest.schemaVersion}`);

if (!Array.isArray(manifest.profiles) || manifest.profiles.length !== 8)
  throw new Error("Expected exactly eight speaker profiles");

const required = ["id", "name", "description", "lowCut", "highCut", "lowGain", "midGain", "highGain", "lowMidGain", "presenceGain", "airGain"];
const ids = new Set();
for (const [index, profile] of manifest.profiles.entries()) {
  for (const key of required) {
    if (!(key in profile))
      throw new Error(`Profile ${index} is missing ${key}`);
  }

  if (typeof profile.id !== "string" || profile.id.length === 0 || ids.has(profile.id))
    throw new Error(`Profile ${index} has a missing or duplicate id`);
  ids.add(profile.id);

  if (typeof profile.name !== "string" || profile.name.length === 0)
    throw new Error(`Profile ${index} has an invalid name`);
  if (typeof profile.description !== "string" || profile.description.length === 0)
    throw new Error(`Profile ${index} has an invalid description`);

  for (const key of ["lowCut", "highCut", "lowGain", "midGain", "highGain", "lowMidGain", "presenceGain", "airGain"]) {
    if (typeof profile[key] !== "number" || !Number.isFinite(profile[key]))
      throw new Error(`Profile ${profile.id} has a non-finite ${key}`);
  }
  if (profile.lowCut <= 0 || profile.lowCut > 1 || profile.highCut <= 0 || profile.highCut > 1)
    throw new Error(`Profile ${profile.id} has an invalid filter coefficient`);
  if ([profile.lowGain, profile.midGain, profile.highGain, profile.lowMidGain, profile.presenceGain, profile.airGain].some((value) => value < 0.1 || value > 4))
    throw new Error(`Profile ${profile.id} has an implausible gain coefficient`);
}

process.stdout.write(`Speaker manifest OK: ${manifest.profiles.length} profiles, schema ${manifest.schemaVersion}\n`);
