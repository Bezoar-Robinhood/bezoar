#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, "../../../apps/worker/src/rules.js");
const DEST = path.resolve(HERE, "../lib/rules.js");

const src = fs.readFileSync(SRC, "utf8");
if (process.argv.includes("--check")) {
  if (!fs.existsSync(DEST) || fs.readFileSync(DEST, "utf8") !== src) {
    console.error("lib/rules.js is out of date. Run: npm run sync-rules");
    process.exit(1);
  }
} else {
  fs.writeFileSync(DEST, src);
  console.log("synced lib/rules.js");
}
