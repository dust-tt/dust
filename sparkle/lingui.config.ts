import { defineConfig } from "@lingui/conf";

// Runtime options for the Lingui macro in Sparkle builds, Storybook and tests. The macro plugin
// loads the nearest config from the working directory, so front keeps the root config, which
// also extracts Sparkle's messages into front's catalogs.
export default defineConfig({
  sourceLocale: "en-US",
  locales: ["en-US", "fr-FR"],
  runtimeConfigModule: {
    useLingui: ["@sparkle/lib/i18n", "useLingui"],
    Trans: ["@sparkle/lib/i18n", "Trans"],
    i18n: ["@sparkle/lib/i18n", "i18n"],
  },
});
