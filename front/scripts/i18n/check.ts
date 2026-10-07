import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import logger from "@app/logger/logger";
import { CATALOG_LOCALES, DEFAULT_LOCALE } from "@app/types/locale";
import { getCatalogs } from "@lingui/cli/api";
import { getConfig } from "@lingui/conf";
import { formatter } from "@lingui/format-po";

const FRONT_DIR = path.resolve(__dirname, "../..");
const LOCALES_DIR = path.join(FRONT_DIR, "locales");

async function listCatalogPaths(locale: string): Promise<string[]> {
  const catalogs = await getCatalogs(getConfig({ cwd: FRONT_DIR }));
  return catalogs.map((catalog) => catalog.getFilename(locale));
}

function listPoFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return listPoFiles(entryPath);
    }
    return entry.name.endsWith(".po") ? [entryPath] : [];
  });
}

async function listStaleCatalogs(): Promise<string[]> {
  execSync("npm run i18n:extract", { cwd: FRONT_DIR, stdio: "ignore" });
  const changedOrUntracked = [
    "git diff --name-only -- locales",
    "git ls-files --others --exclude-standard -- locales",
  ].map((command) => execSync(command, { cwd: FRONT_DIR, encoding: "utf8" }));
  const catalogPaths = new Set(
    (
      await Promise.all(
        CATALOG_LOCALES.map((locale) => listCatalogPaths(locale))
      )
    ).flat()
  );
  const orphanCatalogs = listPoFiles(LOCALES_DIR)
    .filter((file) => !catalogPaths.has(file))
    .map((file) => path.relative(FRONT_DIR, file));
  return [
    ...changedOrUntracked
      .join("\n")
      .split("\n")
      .filter((line) => line.trim().length > 0),
    ...orphanCatalogs,
  ];
}

async function listUntranslatedMessages(locale: string): Promise<string[]> {
  const untranslated: string[] = [];
  for (const filename of await listCatalogPaths(locale)) {
    if (!existsSync(filename)) {
      continue;
    }
    const catalog = await formatter().parse(readFileSync(filename, "utf8"), {
      locale,
      sourceLocale: DEFAULT_LOCALE,
      filename,
    });
    untranslated.push(
      ...Object.values(catalog)
        .filter((entry) => !entry.obsolete && !entry.translation)
        .map((entry) => entry.message ?? "")
    );
  }
  return untranslated;
}

async function listConflictingTranslations(locale: string) {
  const translationsById = new Map<
    string,
    { message?: string; context?: string; translations: Record<string, string> }
  >();
  for (const catalog of await getCatalogs(getConfig({ cwd: FRONT_DIR }))) {
    const filename = path.relative(FRONT_DIR, catalog.getFilename(locale));
    for (const [id, entry] of Object.entries(
      (await catalog.read(locale)) ?? {}
    )) {
      if (entry.obsolete || !entry.translation) {
        continue;
      }
      const translations = translationsById.get(id) ?? {
        message: entry.message,
        context: entry.context,
        translations: {},
      };
      translations.translations[filename] = entry.translation;
      translationsById.set(id, translations);
    }
  }
  return [...translationsById.values()].filter(
    ({ translations }) => new Set(Object.values(translations)).size > 1
  );
}

/**
 * @cc [owner:sfriquet,label:testing] i18n-check-fails-on-stale-or-missing
 * The check MUST exit non-zero when running `npm run i18n:extract` leaves any file under `locales/`
 * modified or untracked, when a `.po` file under `locales/` belongs to no catalog of
 * `lingui.config.ts`, or when any non-obsolete message of any catalog of a `CATALOG_LOCALES` entry
 * other than `DEFAULT_LOCALE` has an empty translation.
 */
/**
 * @cc [owner:sfriquet,label:testing] i18n-check-fails-on-conflicting-translations
 * The check MUST exit non-zero when two catalogs of `lingui.config.ts` for the same
 * `CATALOG_LOCALES` entry hold the same non-obsolete message (same `msgid` and `msgctxt`) with
 * different non-empty translations.
 */
async function main() {
  const staleCatalogs = await listStaleCatalogs();
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
        "Missing translations: fill every empty `msgstr` of the catalogs."
      );
    }
  }
  if (hasMissingTranslations) {
    process.exit(1);
  }

  let hasConflictingTranslations = false;
  for (const locale of CATALOG_LOCALES) {
    const conflicts = await listConflictingTranslations(locale);
    if (conflicts.length > 0) {
      hasConflictingTranslations = true;
      logger.error(
        { locale, conflicts },
        "Conflicting translations: translate a message the same way in every catalog, or give messages with different meanings a Lingui `context`."
      );
    }
  }
  if (hasConflictingTranslations) {
    process.exit(1);
  }

  logger.info({}, "Translation catalogs are up to date and complete.");
}

void main();
