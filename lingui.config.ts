import { CATALOG_LOCALES, DEFAULT_LOCALE } from "./front/types/locale";
import { defineConfig } from "@lingui/cli";
import { formatter } from "@lingui/format-po";

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
        // Sparkle has no catalog of its own: its strings ship in front's.
        "<rootDir>/sparkle/src",
      ],
      exclude: [
        "**/node_modules/**",
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/*.stories.tsx",
        "<rootDir>/front/components/poke/**",
        "<rootDir>/sparkle/src/lib/i18n.tsx",
        "<rootDir>/sparkle/src/stories/**",
        "<rootDir>/sparkle/src/icons/**",
        "<rootDir>/sparkle/src/logo/**",
        "<rootDir>/sparkle/tests/**",
      ],
    },
  ],
  orderBy: "messageId",
  format: formatter({ lineNumbers: false }),
});
