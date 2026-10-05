import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getConfig } from "@lingui/conf";
import { formatter } from "@lingui/format-po";

// Checks Sparkle's translation catalogs (`src/locales/{locale}/messages.po`) and their compiled
// form (`messages.json`, bundled by `src/lib/i18n.tsx`). Usage: `npm run i18n:check`.
//
// use-application-logger note: console is used deliberately — this is a standalone Node script
// where the app logger is not available, matching the sibling build-cjs.mjs.

const sparkleDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = getConfig({ cwd: sparkleDir });
const [catalog] = config.catalogs;
const localesDir = path.relative(
  sparkleDir,
  path.dirname(path.dirname(catalog.path.replace("<rootDir>", config.rootDir)))
);

function catalogPath(locale) {
  return catalog.path.replace("<rootDir>", config.rootDir).replace("{locale}", locale) + ".po";
}

function listStaleFiles() {
  execSync("npx lingui extract --clean && npx lingui compile", {
    cwd: sparkleDir,
    stdio: "ignore",
  });
  return [
    `git diff --name-only -- ${localesDir}`,
    `git ls-files --others --exclude-standard -- ${localesDir}`,
  ]
    .map((command) => execSync(command, { cwd: sparkleDir, encoding: "utf8" }))
    .join("\n")
    .split("\n")
    .filter((line) => line.trim().length > 0);
}

async function listUntranslatedMessages(locale) {
  const filename = catalogPath(locale);
  const parsed = await formatter().parse(fs.readFileSync(filename, "utf8"), {
    locale,
    sourceLocale: config.sourceLocale,
    filename,
  });
  return Object.values(parsed)
    .filter((entry) => !entry.obsolete && !entry.translation)
    .map((entry) => entry.message ?? "");
}

/**
 * @cc [owner:ykmsd,label:testing] sparkle-i18n-check-fails-on-stale-or-missing
 * The check MUST exit non-zero when running `lingui extract --clean` then `lingui compile` leaves
 * any file under the catalogs directory modified or untracked, or when any non-obsolete message of
 * a locale other than the source locale has an empty translation.
 */
async function main() {
  const staleFiles = listStaleFiles();
  if (staleFiles.length > 0) {
    console.error(
      `Sparkle translation catalogs are out of date: run \`npm run i18n:extract\` in sparkle and commit the result.\n${staleFiles.join("\n")}`
    );
    process.exit(1);
  }

  let hasMissingTranslations = false;
  for (const locale of config.locales) {
    if (locale === config.sourceLocale) {
      continue;
    }
    const untranslated = await listUntranslatedMessages(locale);
    if (untranslated.length > 0) {
      hasMissingTranslations = true;
      console.error(
        `Missing ${locale} translations: fill every empty \`msgstr\` of the catalog.\n${untranslated.map((message) => `  ${message}`).join("\n")}`
      );
    }
  }
  if (hasMissingTranslations) {
    process.exit(1);
  }

  console.log("Sparkle translation catalogs are up to date and complete.");
}

void main();
