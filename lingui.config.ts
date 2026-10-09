import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "@lingui/cli";
import { formatter } from "@lingui/format-po";
import { CATALOG_LOCALES, DEFAULT_LOCALE } from "./front/types/locale";

const SOURCE_DIRECTORIES = ["front/components", "front/hooks", "front/lib"];
const EXCLUDED_DIRECTORIES = new Set(["front/components/poke", "node_modules"]);
const SOURCE_FILE_REGEX = /(?<!\.test|\.stories)\.tsx?$/;
const MACRO_IMPORT_REGEX = /from ["']@lingui\/(?:core|react)\/macro["']/;

/**
 * @cc [owner:sfriquet,label:architecture] one-catalog-per-directory
 * Every directory under `SOURCE_DIRECTORIES` with a non-test source file importing a Lingui macro
 * MUST be configured as its own catalog at
 * `front/locales/{locale}/<directory relative to front>/messages.po`, extracted from the files
 * directly in that directory only, so that changes in different directories never edit the same
 * catalog.
 */
function listTranslatedDirectories(directory: string): string[] {
  const entries = readdirSync(path.join(__dirname, directory), {
    withFileTypes: true,
  });
  const isTranslated = entries.some(
    (entry) =>
      entry.isFile() &&
      SOURCE_FILE_REGEX.test(entry.name) &&
      MACRO_IMPORT_REGEX.test(
        readFileSync(path.join(__dirname, directory, entry.name), "utf8")
      )
  );
  const subdirectories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => `${directory}/${entry.name}`)
    .filter(
      (subdirectory) =>
        !EXCLUDED_DIRECTORIES.has(subdirectory) &&
        !EXCLUDED_DIRECTORIES.has(path.basename(subdirectory))
    );
  return [
    ...(isTranslated ? [directory] : []),
    ...subdirectories.flatMap(listTranslatedDirectories),
  ];
}

export default defineConfig({
  sourceLocale: DEFAULT_LOCALE,
  locales: [...CATALOG_LOCALES],
  fallbackLocales: { default: DEFAULT_LOCALE },
  catalogs: [
    ...SOURCE_DIRECTORIES.flatMap(listTranslatedDirectories).map(
      (directory) => ({
        path: `<rootDir>/front/locales/{locale}/${path.relative("front", directory)}/messages`,
        include: [
          `<rootDir>/${directory}/*.ts`,
          `<rootDir>/${directory}/*.tsx`,
        ],
        exclude: ["**/*.test.ts", "**/*.test.tsx", "**/*.stories.tsx"],
      })
    ),
    // The Slack bot has a single catalog of its own: see `connectors/src/connectors/slack/CONTRACTS`.
    {
      path: "<rootDir>/connectors/locales/{locale}/messages",
      include: ["<rootDir>/connectors/src/connectors/slack"],
      exclude: ["**/node_modules/**", "**/*.test.ts"],
    },
  ],
  orderBy: "origin",
  format: formatter({ lineNumbers: false }),
});
