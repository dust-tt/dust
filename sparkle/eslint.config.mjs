import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import prettier from "eslint-config-prettier";
import storybook from "eslint-plugin-storybook";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import unusedImports from "eslint-plugin-unused-imports";
import importPlugin from "eslint-plugin-import";
import { fixupPluginRules } from "@eslint/compat";
import globals from "globals";

export default [
  js.configs.recommended,
  prettier,
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.json",
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
        ...globals.jest,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      import: fixupPluginRules(importPlugin),
      "simple-import-sort": simpleImportSort,
      "unused-imports": unusedImports,
    },
    rules: {
      "import/no-cycle": "error",
      curly: ["error", "all"],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-unused-vars": "off", // Turn off to use unused-imports instead
      "no-unused-vars": "off", // Turn off base rule
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "error",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
      "simple-import-sort/imports": [
        "error",
        {
          groups: [
            // Side effect imports.
            ["^\\u0000"],
            // Node.js builtins prefixed with `node:`.
            ["^node:"],
            // Packages.
            // Things that start with a letter (or digit or underscore), or `@` followed by a letter.
            ["^@?\\w"],
            // @sparkle imports.
            ["^@sparkle"],
            // Absolute imports and other imports such as Vue-style `@/foo`.
            // Anything not matched in another group.
            ["^"],
            // Relative imports.
            // Anything that starts with a dot.
            ["^\\."],
          ],
        },
      ],
      "simple-import-sort/exports": "error",
      "@typescript-eslint/return-await": ["error", "in-try-catch"],
      "no-restricted-imports": [
        "error",
        {
          patterns: ["*/index_with_tw_base"],
        },
      ],
    },
  },
  {
    files: ["**/*.stories.tsx"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  {
    files: ["**/*.stories.{js,jsx,ts,tsx}"],
    plugins: {
      storybook: storybook,
    },
    rules: {
      ...storybook.configs.recommended.rules,
    },
  },
  {
    ignores: [
      "rollup.config.js",
      "eslint.js",
      ".eslintrc.js",
      "eslint.config.mjs",
      "dist/",
      "node_modules/",
      "svgr.config.js",
      "postcss.config.js",
      "tailwind.config.js",
      "svgr-*-template.js",
    ],
  },
];
