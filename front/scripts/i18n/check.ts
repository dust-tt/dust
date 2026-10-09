import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import logger from "@app/logger/logger";
import * as frontLocales from "@app/types/locale";
import { CATALOG_LOCALES, DEFAULT_LOCALE } from "@app/types/locale";
import { getCatalogs } from "@lingui/cli/api";
import { getConfig } from "@lingui/conf";
import { formatter } from "@lingui/format-po";

// Connectors cannot import front: it keeps a copy of the locales, checked below.
import * as connectorsLocales from "../../../connectors/src/types/locale";

const FRONT_DIR = path.resolve(__dirname, "../..");
// The `locales/` directories of every catalog in `lingui.config.ts`, relative to front.
const LOCALES_DIRS = ["locales", "../connectors/locales"];

async function listCatalogPaths(locale: string): Promise<string[]> {
  const catalogs = await getCatalogs(getConfig({ cwd: FRONT_DIR }));
  return catalogs.map((catalog) => catalog.getFilename(locale));
}

function listPoFiles(directory: string): string[] {
  // `i18n:extract` deletes empty catalogs: the connectors one has no file until it has a message.
  if (!existsSync(directory)) {
    return [];
  }
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
  const localesDirs = LOCALES_DIRS.join(" ");
  const changedOrUntracked = [
    `git diff --name-only -- ${localesDirs}`,
    `git ls-files --others --exclude-standard -- ${localesDirs}`,
  ].map((command) => execSync(command, { cwd: FRONT_DIR, encoding: "utf8" }));
  const catalogPaths = new Set(
    (
      await Promise.all(
        CATALOG_LOCALES.map((locale) => listCatalogPaths(locale))
      )
    ).flat()
  );
  const orphanCatalogs = LOCALES_DIRS.flatMap((localesDir) =>
    listPoFiles(path.join(FRONT_DIR, localesDir))
  )
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
    // Messages with an explicit id (the connectors catalog uses the English text as id) have no
    // `message`: report the id instead.
    untranslated.push(
      ...Object.entries(catalog)
        .filter(([, entry]) => !entry.obsolete && !entry.translation)
        .map(([id, entry]) => entry.message ?? id)
    );
  }
  return untranslated;
}

async function listConflictingTranslations(locale: string) {
  // Keyed by PO `msgid` and `msgctxt`, not by Lingui id: front ids are hashes of the message while
  // the connectors catalog uses the English text as id, so the same message has different ids.
  const translationsByMessage = new Map<
    string,
    { message: string; context?: string; translations: Record<string, string> }
  >();
  for (const catalog of await getCatalogs(getConfig({ cwd: FRONT_DIR }))) {
    const filename = path.relative(FRONT_DIR, catalog.getFilename(locale));
    for (const [id, entry] of Object.entries(
      (await catalog.read(locale)) ?? {}
    )) {
      if (entry.obsolete || !entry.translation) {
        continue;
      }
      // Messages with an explicit id have no `message`: their `msgid` is the id.
      const message = entry.message ?? id;
      const key = `${message}\u0004${entry.context ?? ""}`;
      const translations = translationsByMessage.get(key) ?? {
        message,
        context: entry.context,
        translations: {},
      };
      translations.translations[filename] = entry.translation;
      translationsByMessage.set(key, translations);
    }
  }
  return [...translationsByMessage.values()].filter(
    ({ translations }) => new Set(Object.values(translations)).size > 1
  );
}

function listDriftedConnectorsLocales(): string[] {
  return Object.entries(connectorsLocales)
    .filter(([, value]) => typeof value !== "function")
    .filter(
      ([name, value]) =>
        !isDeepStrictEqual(
          value,
          frontLocales[name as keyof typeof frontLocales]
        )
    )
    .map(([name]) => name);
}

/**
 * @cc [owner:sfriquet,label:testing] i18n-check-fails-on-stale-or-missing
 * The check MUST exit non-zero when running `npm run i18n:extract` leaves any file under one of
 * `LOCALES_DIRS` modified or untracked, when a `.po` file under one of `LOCALES_DIRS` belongs to no
 * catalog of `lingui.config.ts`, or when any non-obsolete message of any catalog of a `CATALOG_LOCALES` entry
 * other than `DEFAULT_LOCALE` has an empty translation.
 */
/**
 * @cc [owner:sfriquet,label:testing] i18n-check-fails-on-conflicting-translations
 * The check MUST exit non-zero when two catalogs of `lingui.config.ts` for the same
 * `CATALOG_LOCALES` entry hold the same non-obsolete message (same `msgid` and `msgctxt`) with
 * different non-empty translations.
 */
/**
 * @cc [owner:Nils-Fedrigo,label:testing] i18n-check-fails-on-locale-drift
 * The check MUST exit non-zero when an export of `connectors/src/types/locale.ts` that is not a
 * function differs from the export of the same name in `front/types/locale.ts`.
 */
async function main() {
  const driftedLocales = listDriftedConnectorsLocales();
  if (driftedLocales.length > 0) {
    logger.error(
      { driftedLocales },
      "`connectors/src/types/locale.ts` differs from `front/types/locale.ts`: copy the front values."
    );
    process.exit(1);
  }

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
