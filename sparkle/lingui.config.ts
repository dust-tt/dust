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
      exclude: [
        "**/node_modules/**",
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/*.stories.tsx",
        "<rootDir>/src/stories/**",
      ],
    },
  ],
  // Macros resolve to sparkle's own hook, which falls back to English when the consumer has no
  // `I18nProvider` (marketing, viz).
  runtimeConfigModule: {
    useLingui: ["@sparkle/lib/i18n/useLingui", "useLingui"],
  },
  compileNamespace: "ts",
  orderBy: "messageId",
  format: formatter({ lineNumbers: false }),
});
