// Differential test vs SheetJS (spec §7.4 oracle 2): typed cell values
// must agree between the engine (via engine-cli canonical JSON) and SheetJS
// (pinned in package-lock.json) over the synthetic corpus.
//
// Exits nonzero on any unexcepted disagreement. Exceptions: corpus/diff-exceptions.toml.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import xlsxPkg from "xlsx";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(root, "target/release/engine-cli");

if (!existsSync(cli)) {
  console.error("engine-cli not built — run: cargo build -p engine-cli --release");
  process.exit(2);
}

const exceptions = new Set(
  readFileSync(join(root, "corpus/diff-exceptions.toml"), "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split("=")[0].trim()),
);

// SheetJS densifies sheets between min and max used cell, so the max-extent
// file OOMs it (same limitation as calamine; the sparse engine model is the
// fix). Covered by goldens + generator-model + calamine-skip rationale.
const SKIP = new Set(["extremes.xlsx"]);

let failures = 0;
let filesChecked = 0;
let cellsChecked = 0;

function fail(msg) {
  failures += 1;
  console.error(`DIFF: ${msg}`);
}

function near(a, b) {
  if (a === b) return true;
  const scale = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) <= 1e-9 * scale;
}

for (const file of readdirSync(join(root, "corpus/gen")).filter((f) => f.endsWith(".xlsx")).sort()) {
  if (SKIP.has(file)) {
    console.log(`skip ${file} (SheetJS dense-range OOM)`);
    continue;
  }
  const path = join(root, "corpus/gen", file);
  const engineOut = JSON.parse(
    execFileSync(cli, ["parse", path], { maxBuffer: 1 << 28 }).toString(),
  );
  const sjs = xlsxPkg.read(readFileSync(path), { type: "buffer", cellNF: true, dense: true });

  if (sjs.SheetNames.length !== engineOut.sheets.length) {
    fail(`${file}: sheet count engine=${engineOut.sheets.length} sheetjs=${sjs.SheetNames.length}`);
    continue;
  }

  sjs.SheetNames.forEach((sheetName, sheetIdx) => {
    const engineSheet = engineOut.sheets[sheetIdx];
    if (engineSheet.name !== sheetName) {
      fail(`${file}: sheet ${sheetIdx} name engine=${engineSheet.name} sheetjs=${sheetName}`);
      return;
    }
    const engineCells = new Map(engineSheet.cells.map((c) => [c.a1, c]));
    // xlsx@0.18.5 dense mode: the worksheet object IS the row array.
    const ws = sjs.Sheets[sheetName];
    const rows = Array.isArray(ws) ? ws : ws["!data"] ?? [];
    rows.forEach((row, r) => {
      if (!row) return;
      row.forEach((cell, c) => {
        if (!cell || cell.t === "z") return;
        const a1 = xlsxPkg.utils.encode_cell({ r, c });
        if (exceptions.has(`${file}:${a1}`)) return;
        cellsChecked += 1;
        const mine = engineCells.get(a1);
        if (!mine) {
          fail(`${file} ${sheetName}!${a1}: sheetjs has ${JSON.stringify(cell.v)}, engine has nothing`);
          return;
        }
        switch (cell.t) {
          case "n":
            if (mine.t !== "n" || !near(Number(mine.v), cell.v)) {
              fail(`${file} ${sheetName}!${a1}: engine ${mine.t}:${mine.v} vs sheetjs n:${cell.v}`);
            }
            break;
          case "s":
          case "str":
            if (mine.t !== "s" || mine.v !== String(cell.v)) {
              fail(`${file} ${sheetName}!${a1}: engine ${mine.t}:${JSON.stringify(mine.v)} vs sheetjs s:${JSON.stringify(cell.v)}`);
            }
            break;
          case "b":
            if (mine.t !== "b" || mine.v !== cell.v) {
              fail(`${file} ${sheetName}!${a1}: engine ${mine.t}:${mine.v} vs sheetjs b:${cell.v}`);
            }
            break;
          case "e":
            if (mine.t !== "e" || mine.v !== cell.w) {
              fail(`${file} ${sheetName}!${a1}: engine ${mine.t}:${mine.v} vs sheetjs e:${cell.w}`);
            }
            break;
          default:
            break;
        }
      });
    });
  });
  filesChecked += 1;
}

console.log(`sheetjs differential: ${filesChecked} files, ${cellsChecked} cells, ${failures} failures`);
process.exit(failures === 0 ? 0 : 1);
