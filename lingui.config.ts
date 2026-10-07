import { defineConfig } from "@lingui/cli";
import { formatter } from "@lingui/format-po";
import { CATALOG_LOCALES, DEFAULT_LOCALE } from "./front/types/locale";

export default defineConfig({
  sourceLocale: DEFAULT_LOCALE,
  locales: [...CATALOG_LOCALES],
  fallbackLocales: { default: DEFAULT_LOCALE },
  catalogs: [
    {
      path: "<rootDir>/front/locales/{locale}/messages",
      include: [
        "<rootDir>/front/components",
        "<rootDir>/front/hooks",
        "<rootDir>/front/lib",
      ],
      exclude: [
        "**/node_modules/**",
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/*.stories.tsx",
        "<rootDir>/front/components/poke/**",
      ],
    },
  ],
  orderBy: "origin",
  format: formatter({ lineNumbers: false }),
});
