import { defineConfig } from "@lingui/cli";
import { formatter } from "@lingui/format-po";

/**
 * Lingui configuration for the Dust monorepo.
 *
 * English source text is the message key: components use `<Trans>`, `t` and `msg` with English
 * text, and Lingui hashes that text into a stable id at build time. Nobody writes ids by hand.
 *
 * Catalogs live in `front/locales/<locale>/messages.po`. They are updated by `npm run i18n:sync`
 * (run from `front/`), which extracts messages from the source and fills missing translations.
 * The Vite plugin compiles the `.po` files on import, so no compiled catalog is committed.
 *
 * `en` is the source locale but its catalog is still loaded at runtime: in production builds the
 * macro strips the English text from the bundle and keeps only the id.
 */
export default defineConfig({
  sourceLocale: "en",
  locales: ["en", "fr"],
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
  // Message ids are hashed from the English text, so ordering by id keeps the catalog diff stable
  // when strings move between files.
  orderBy: "messageId",
  // Line numbers churn on every unrelated edit; file references alone are enough for context.
  format: formatter({ lineNumbers: false }),
});
