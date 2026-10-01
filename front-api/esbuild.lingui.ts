import { readFile } from "node:fs/promises";
import path from "node:path";

import { transformAsync } from "@babel/core";
import { getConfig } from "@lingui/conf";
import type esbuild from "esbuild";

const REPO_ROOT = path.resolve(__dirname, "..");

const MACRO_IMPORT_REGEX = /from ["']@lingui\/(?:core|react)\/macro["']/;

// Mirrors the Vite setup (`@lingui/babel-plugin-lingui-macro` +
// `@lingui/vite-plugin`) for front-api's esbuild bundle: macros are compiled
// with Babel before esbuild strips the types, and `.po` catalogs are compiled
// to JS modules exporting `messages`.
export const linguiPlugin: esbuild.Plugin = {
  name: "lingui",
  setup(build) {
    build.onLoad({ filter: /\.tsx?$/ }, async (args) => {
      if (args.path.includes("node_modules")) {
        return;
      }
      const source = await readFile(args.path, "utf8");
      if (!MACRO_IMPORT_REGEX.test(source)) {
        return;
      }
      const isTsx = args.path.endsWith(".tsx");
      const result = await transformAsync(source, {
        filename: args.path,
        babelrc: false,
        configFile: false,
        parserOpts: {
          plugins: isTsx ? ["typescript", "jsx"] : ["typescript"],
        },
        plugins: ["@lingui/babel-plugin-lingui-macro"],
      });
      return { contents: result?.code ?? "", loader: isTsx ? "tsx" : "ts" };
    });

    build.onLoad({ filter: /\.po$/ }, async (args) => {
      const { getCatalogForFile, getCatalogs, createCompiledCatalog } =
        await import("@lingui/cli/api");
      const config = getConfig({ cwd: REPO_ROOT });
      const fileCatalog = getCatalogForFile(
        path.relative(config.rootDir, args.path),
        await getCatalogs(config)
      );
      if (!fileCatalog) {
        throw new Error(`${args.path} is not a Lingui catalog.`);
      }
      const { locale, catalog } = fileCatalog;
      const { messages } = await catalog.getTranslations(locale, {
        fallbackLocales: config.fallbackLocales,
        sourceLocale: config.sourceLocale,
      });
      const { source, errors } = createCompiledCatalog(locale, messages, {
        namespace: "es",
      });
      if (errors.length > 0) {
        throw new Error(`Failed to compile Lingui catalog ${args.path}.`);
      }
      return { contents: source, loader: "js" };
    });
  },
};
