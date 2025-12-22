// eslint.config.mjs

import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import importPlugin from "eslint-plugin-import";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import unusedImports from "eslint-plugin-unused-imports";
import tseslint from "typescript-eslint";

export default [
  // Ignores
  {
    ignores: [
      ".eslintrc.js",
      "eslint.config.js",
      "config/",
      "dist/",
      "knip.ts",
    ],
  },

  // Base configs
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Global settings
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        // Node
        process: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        module: "readonly",
        require: "readonly",
        global: "readonly",
        console: "readonly",
      },
    },
  },

  // Plugin configurations
  {
    plugins: {
      import: importPlugin,
      "simple-import-sort": simpleImportSort,
      "unused-imports": unusedImports,
    },
  },

  // Main rules
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    rules: {
      // Import rules
      "import/no-cycle": "error",
      "import/consistent-type-specifier-style": ["error", "prefer-top-level"],
      "import/no-extraneous-dependencies": [
        "warn",
        {
          devDependencies: [
            "**/*.test.ts",
            "**/*.test.tsx",
            "**/*.spec.ts",
            "**/*.config.js",
            "**/*.config.ts",
            "**/scripts/**",
            "**/migrations/**",
            "vitest.config.ts",
            "vite.setup.ts",
            "esbuild.config.ts",
          ],
        },
      ],

      // Import sorting
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
            // @connectors imports.
            ["^@connectors"],
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

      // TypeScript rules
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        {
          checksVoidReturn: false,
        },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_|Schema$|USE_CASES$",
          caughtErrorsIgnorePattern: "^_|^(e|error)$",
        },
      ],
      "@typescript-eslint/return-await": ["error", "in-try-catch"],
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-require-imports": "off",

      // Unused imports
      "unused-imports/no-unused-imports": "error",

      // General rules
      curly: ["error", "all"],
      "no-unused-expressions": "error",
    },
  },

  // Prettier config (must be last)
  eslintConfigPrettier,
];
