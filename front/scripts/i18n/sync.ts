/**
 * Keeps the Lingui catalogs in sync with the source code.
 *
 *   npm run i18n:sync          extract messages, fill missing translations, write catalogs
 *   npm run i18n:sync -- --check
 *                              same, but exit 1 if any catalog would change (for CI)
 *
 * Runs from `front/` (see package.json). Extraction covers the paths listed in the root
 * `lingui.config.ts`. Translation is a placeholder for the proof of concept; see `fill.ts`.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { fillMissingTranslations } from "./fill";

// tsx runs this file as CommonJS (front is not an ES module package), so `__dirname` is available.
const FRONT_DIR = path.resolve(__dirname, "../..");
const LOCALES_DIR = path.join(FRONT_DIR, "locales");
const SOURCE_LOCALE = "en";

function catalogPath(locale: string): string {
  return path.join(LOCALES_DIR, locale, "messages.po");
}

// Lingui rewrites the POT-Creation-Date header on every extraction. Ignoring it keeps catalogs
// unchanged (and commits clean) when no message changed.
function withoutCreationDate(poText: string): string {
  return poText.replace(/^"POT-Creation-Date: .*\\n"\n/m, "");
}

function sameMessages(a: string, b: string): boolean {
  return withoutCreationDate(a) === withoutCreationDate(b);
}

function readCatalogs(): Map<string, string> {
  const catalogs = new Map<string, string>();
  for (const locale of fs.readdirSync(LOCALES_DIR)) {
    const file = catalogPath(locale);
    if (fs.existsSync(file)) {
      catalogs.set(locale, fs.readFileSync(file, "utf8"));
    }
  }
  return catalogs;
}

function main() {
  const check = process.argv.includes("--check");
  const before = readCatalogs();

  // `--clean` drops messages that no longer exist in the source.
  execSync("npx lingui extract --clean", { cwd: FRONT_DIR, stdio: "inherit" });

  const after = readCatalogs();
  let changed = false;
  for (const [locale, extracted] of after) {
    let next = extracted;
    if (locale !== SOURCE_LOCALE) {
      const { poText, filled } = fillMissingTranslations({
        poText: extracted,
        locale,
      });
      next = poText;
      if (filled > 0) {
        console.log(
          `[i18n] ${locale}: filled ${filled} missing translation(s)`
        );
      }
    }
    const previous = before.get(locale);
    if (previous !== undefined && sameMessages(previous, next)) {
      // Nothing changed but the header date: keep the committed file byte for byte.
      fs.writeFileSync(catalogPath(locale), previous);
      continue;
    }
    changed = true;
    if (check) {
      // Restore the committed catalog so --check has no side effect.
      if (previous !== undefined) {
        fs.writeFileSync(catalogPath(locale), previous);
      }
    } else {
      fs.writeFileSync(catalogPath(locale), next);
    }
  }

  if (check && changed) {
    console.error(
      "[i18n] Catalogs are out of date. Run `npm run i18n:sync` in front/ and commit the result."
    );
    process.exit(1);
  }
  console.log(
    check ? "[i18n] Catalogs are up to date." : "[i18n] Catalogs synced."
  );
}

main();
