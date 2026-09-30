import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import logger from "@app/logger/logger";
import { CATALOG_LOCALES, DEFAULT_LOCALE } from "@app/types/locale";
import { formatter } from "@lingui/format-po";

const FRONT_DIR = path.resolve(__dirname, "../..");
const LOCALES_DIR = path.join(FRONT_DIR, "locales");

function catalogPath(locale: string): string {
  return path.join(LOCALES_DIR, locale, "messages.po");
}

function listStaleCatalogs(): string[] {
  execSync("npx lingui extract --clean", { cwd: FRONT_DIR, stdio: "ignore" });
  const changedOrUntracked = [
    "git diff --name-only -- locales",
    "git ls-files --others --exclude-standard -- locales",
  ].map((command) => execSync(command, { cwd: FRONT_DIR, encoding: "utf8" }));
  return changedOrUntracked
    .join("\n")
    .split("\n")
    .filter((line) => line.trim().length > 0);
}

async function listUntranslatedMessages(locale: string): Promise<string[]> {
  const filename = catalogPath(locale);
  const catalog = await formatter().parse(readFileSync(filename, "utf8"), {
    locale,
    sourceLocale: DEFAULT_LOCALE,
    filename,
  });
  return Object.values(catalog)
    .filter((entry) => !entry.obsolete && !entry.translation)
    .map((entry) => entry.message ?? "");
}

/**
 * @cc [owner:sfriquet,label:testing] i18n-check-fails-on-stale-or-missing
 * The check MUST exit non-zero when running `lingui extract --clean` leaves any file under `locales/`
 * modified or untracked, or when any non-obsolete message of a `CATALOG_LOCALES` entry other than
 * `DEFAULT_LOCALE` has an empty translation.
 */
async function main() {
  const staleCatalogs = listStaleCatalogs();
  if (staleCatalogs.length > 0) {
    logger.error(
      { staleCatalogs },
      "Translation catalogs are out of date: run `npm run i18n:extract` in front and commit the result."
    );
    process.exit(1);
  }

  let hasMissingTranslations = false;
  for (const locale of CATALOG_LOCALES) {
    if (locale === DEFAULT_LOCALE) {
      continue;
    }
    const untranslated = await listUntranslatedMessages(locale);
    if (untranslated.length > 0) {
      hasMissingTranslations = true;
      logger.error(
        { locale, untranslated },
        "Missing translations: fill every empty `msgstr` of the catalog."
      );
    }
  }
  if (hasMissingTranslations) {
    process.exit(1);
  }

  logger.info({}, "Translation catalogs are up to date and complete.");
}

void main();
