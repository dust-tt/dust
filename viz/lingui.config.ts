import { defineConfig } from "@lingui/cli";
import { formatter } from "@lingui/format-po";

import { VIZ_CATALOG_LOCALES, VIZ_SOURCE_LOCALE } from "./app/lib/i18n/locales";

export default defineConfig({
  sourceLocale: VIZ_SOURCE_LOCALE,
  locales: [...VIZ_CATALOG_LOCALES],
  catalogs: [
    {
      path: "<rootDir>/locales/{locale}/messages",
      include: [
        "<rootDir>/app",
        "<rootDir>/components",
        "<rootDir>/hooks",
        "<rootDir>/lib",
      ],
      exclude: ["**/node_modules/**"],
    },
  ],
  compileNamespace: "ts",
  orderBy: "origin",
  format: formatter({ lineNumbers: false }),
});
