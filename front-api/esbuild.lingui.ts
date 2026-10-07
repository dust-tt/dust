import { readFile } from "node:fs/promises";

import { transformAsync } from "@babel/core";
import type esbuild from "esbuild";

import {
  compileMergedCatalog,
  MERGED_CATALOG_FILE_REGEX,
} from "../front/scripts/i18n/merged_catalog";

const MACRO_IMPORT_REGEX = /from ["']@lingui\/(?:core|react)\/macro["']/;

// Mirrors the Vite setup (`@lingui/babel-plugin-lingui-macro` +
// `linguiMergedCatalogPlugin`) for front-api's esbuild bundle: macros are compiled
// with Babel before esbuild strips the types, and `.catalog` imports are
// compiled to JS modules exporting the merged `messages` of every catalog.
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

    build.onLoad({ filter: MERGED_CATALOG_FILE_REGEX }, async (args) => {
      const { source, dependencies } = await compileMergedCatalog(args.path);
      return { contents: source, loader: "js", watchFiles: dependencies };
    });
  },
};
