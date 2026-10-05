import { defineConfig } from "@lingui/cli";
import { formatter } from "@lingui/format-po";

import {
  SPARKLE_CATALOG_LOCALES,
  SPARKLE_SOURCE_LOCALE,
} from "./src/lib/i18n/locales";

export default defineConfig({
  sourceLocale: SPARKLE_SOURCE_LOCALE,
  locales: [...SPARKLE_CATALOG_LOCALES],
  catalogs: [
    {
      path: "<rootDir>/src/locales/{locale}/messages",
      include: ["<rootDir>/src"],
      exclude: ["**/node_modules/**", "<rootDir>/src/stories/**"],
    },
  ],
  // Macros resolve to sparkle's own hook and component, which fall back to English when the
  // consumer has no `I18nProvider` (marketing, viz).
  runtimeConfigModule: {
    useLingui: ["@sparkle/lib/i18n/useLingui", "useLingui"],
    Trans: ["@sparkle/lib/i18n/Trans", "Trans"],
  },
  compileNamespace: "ts",
  orderBy: "messageId",
  format: formatter({ lineNumbers: false }),
});
