import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateP0 } from "./p0-validator.js";
import type { QualitySnapshot } from "./types.js";

const input = process.argv[2];
if (!input) {
  console.error("Usage: npm run check -- examples/snapshot.good.json");
  process.exit(2);
}

const raw = await readFile(resolve(input), "utf8");
const snapshot = JSON.parse(raw) as QualitySnapshot;
const report = validateP0(snapshot);
console.log(JSON.stringify(report, null, 2));
process.exit(report.status === "reject" ? 1 : 0);
