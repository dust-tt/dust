import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { packageOfficeAssets } from "./package.mjs";

function fixture(t, platforms = ["excel"]) {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), "office-assets-"));
  t.after(() => rmSync(rootDir, { recursive: true, force: true }));
  mkdirSync(path.join(rootDir, "office"));
  writeFileSync(
    path.join(rootDir, "office/_headers"),
    "/*\n  X-Robots-Tag: noindex\n"
  );
  for (const platform of platforms) {
    const platformDir = path.join(rootDir, "platforms", platform);
    mkdirSync(path.join(platformDir, "build/assets"), { recursive: true });
    for (const file of ["taskpane.html", "auth.html", "assets/main.hash.js"]) {
      writeFileSync(path.join(platformDir, "build", file), `${platform}/${file}`);
    }
    writeFileSync(
      path.join(platformDir, "manifest.prod.xml"),
      `${platform} manifest`
    );
  }
  return rootDir;
}

test("packages Excel and its manifest under /excel, not at the root", (t) => {
  const rootDir = fixture(t);
  packageOfficeAssets({ rootDir });
  const output = path.join(rootDir, "office/dist");
  assert.equal(
    readFileSync(path.join(output, "excel/manifest.xml"), "utf8"),
    "excel manifest"
  );
  assert.equal(
    readFileSync(path.join(output, "excel/auth.html"), "utf8"),
    "excel/auth.html"
  );
  assert.ok(existsSync(path.join(output, "excel/assets/main.hash.js")));
  assert.ok(existsSync(path.join(output, "_headers")));
  assert.equal(existsSync(path.join(output, "taskpane.html")), false);
  assert.equal(existsSync(path.join(output, "word")), false);
});

test("can package all three Office platforms without overwriting each other", (t) => {
  const platforms = ["excel", "powerpoint", "word"];
  const rootDir = fixture(t, platforms);
  packageOfficeAssets({ rootDir, platforms });
  for (const platform of platforms) {
    assert.equal(
      readFileSync(
        path.join(rootDir, "office/dist", platform, "taskpane.html"),
        "utf8"
      ),
      `${platform}/taskpane.html`
    );
  }
});

test("removes stale files when repackaging", (t) => {
  const rootDir = fixture(t);
  packageOfficeAssets({ rootDir });
  const stale = path.join(rootDir, "office/dist/stale.js");
  writeFileSync(stale, "old build");
  packageOfficeAssets({ rootDir });
  assert.equal(existsSync(stale), false);
});

test("fails before removing the previous output if a platform is incomplete", (t) => {
  const rootDir = fixture(t);
  packageOfficeAssets({ rootDir });
  rmSync(path.join(rootDir, "platforms/excel/build/auth.html"));
  assert.throws(
    () => packageOfficeAssets({ rootDir }),
    /Missing excel\/build\/auth.html/
  );
  assert.ok(existsSync(path.join(rootDir, "office/dist/excel/taskpane.html")));
});

test("rejects unknown platform names", (t) => {
  const rootDir = fixture(t);
  assert.throws(
    () => packageOfficeAssets({ rootDir, platforms: ["../other"] }),
    /Unknown Office platform/
  );
});
