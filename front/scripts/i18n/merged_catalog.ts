import path from "node:path";
import {
  createCompiledCatalog,
  getCatalogDependentFiles,
  getCatalogs,
} from "@lingui/cli/api";
import { getConfig } from "@lingui/conf";
import type { Plugin } from "vite";

export const MERGED_CATALOG_FILE_REGEX = /\.catalog$/;

/**
 * @cc [owner:sfriquet,label:architecture] merged-catalog-covers-all-catalogs
 * Importing `front/locales/{locale}.catalog` MUST compile to a module exporting `messages`, the
 * translations of every catalog of `lingui.config.ts` for `{locale}` merged together, with the same
 * fallback to `DEFAULT_LOCALE` as a single catalog. Every bundler loading front code MUST compile
 * `.catalog` imports with this function.
 */
export async function compileMergedCatalog(
  catalogFile: string
): Promise<{ source: string; dependencies: string[] }> {
  const locale = path
    .basename(catalogFile)
    .replace(MERGED_CATALOG_FILE_REGEX, "");
  const config = getConfig({ cwd: path.dirname(catalogFile) });
  if (!config.locales.includes(locale)) {
    throw new Error(`${catalogFile} does not name a Lingui locale.`);
  }

  const messages: Record<string, string> = {};
  const dependencies: string[] = [];
  for (const catalog of await getCatalogs(config)) {
    const translations = await catalog.getTranslations(locale, {
      fallbackLocales: config.fallbackLocales,
      sourceLocale: config.sourceLocale,
    });
    Object.assign(messages, translations.messages);
    dependencies.push(...(await getCatalogDependentFiles(catalog, locale)));
  }

  const { source, errors } = createCompiledCatalog(locale, messages, {
    namespace: "es",
    pseudoLocale: config.pseudoLocale,
  });
  if (errors.length > 0) {
    throw new Error(`Failed to compile the ${locale} Lingui catalogs.`);
  }
  return { source, dependencies };
}

export function linguiMergedCatalogPlugin(): Plugin {
  return {
    name: "lingui-merged-catalog",
    async load(id) {
      if (!MERGED_CATALOG_FILE_REGEX.test(id)) {
        return null;
      }
      const { source, dependencies } = await compileMergedCatalog(id);
      dependencies.forEach((file) => this.addWatchFile(file));
      return source;
    },
  };
}
