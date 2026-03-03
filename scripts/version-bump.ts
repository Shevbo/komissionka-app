#!/usr/bin/env npx tsx
/**
 * Вспомогательный скрипт для обновления версий.
 * Использование: npx tsx scripts/version-bump.ts <component> <type>
 * component: app | agent | tgbot
 * type: major | minor | patch
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd());
const component = process.argv[2];
const bumpType = process.argv[3];

if (!component || !bumpType || !["app", "agent", "tgbot"].includes(component) || !["major", "minor", "patch"].includes(bumpType)) {
  console.error("Использование: npx tsx scripts/version-bump.ts <app|agent|tgbot> <major|minor|patch>");
  process.exit(1);
}

const versionPath = join(root, "version.json");
const data = JSON.parse(readFileSync(versionPath, "utf-8"));
const key = component === "app" ? "app" : component === "agent" ? "agent" : "tgbot";
const current = (data[key] ?? "1.0.0").split(".").map(Number);
let next: number[];
if (bumpType === "major") {
  next = [current[0]! + 1, 0, 0];
} else if (bumpType === "minor") {
  next = [current[0]!, current[1]! + 1, 0];
} else {
  next = [current[0]!, current[1]!, (current[2] ?? 0) + 1];
}
data[key] = next.join(".");
writeFileSync(versionPath, JSON.stringify(data, null, 2) + "\n", "utf-8");
console.log(`${key}: ${current.join(".")} -> ${data[key]}`);
