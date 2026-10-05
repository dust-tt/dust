import { defineConfig } from "@lingui/conf";
import { formatter } from "@lingui/format-po";

// Sparkle's own Lingui setup: its catalogs and the runtime module its macros compile to. The macro
// plugin loads the nearest config from the working directory, so front keeps the root config.
//
// Catalogs are compiled to `src/locales/{locale}/messages.json` (`npm run i18n:compile`), which
// `src/lib/i18n.tsx` bundles so Sparkle translates itself in any app, with or without Lingui.
// Adding a locale here also means importing its compiled catalog in `src/lib/i18n.tsx`.
export default defineConfig({
  sourceLocale: "en-US",
  locales: ["en-US", "fr-FR"],
  fallbackLocales: { default: "en-US" },
  catalogs: [
    {
      path: "<rootDir>/src/locales/{locale}/messages",
      include: ["<rootDir>/src"],
      exclude: [
        "**/node_modules/**",
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/*.stories.tsx",
        "<rootDir>/src/lib/i18n.tsx",
        "<rootDir>/src/locales/**",
        "<rootDir>/src/stories/**",
        "<rootDir>/src/icons/**",
        "<rootDir>/src/logo/**",
      ],
    },
  ],
  compileNamespace: "json",
  orderBy: "messageId",
  format: formatter({ lineNumbers: false }),
  runtimeConfigModule: {
    useLingui: ["@sparkle/lib/i18n", "useLingui"],
    Trans: ["@sparkle/lib/i18n", "Trans"],
    i18n: ["@sparkle/lib/i18n", "i18n"],
  },
});
