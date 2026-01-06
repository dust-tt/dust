// eslint.config.mjs

import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import importPlugin from "eslint-plugin-import";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import tseslint from "typescript-eslint";

export default [
  // Ignores
  {
    ignores: [
      "rollup.config.js",
      "eslint.js",
      ".eslintrc.js",
      "eslint.config.js",
      "dist/",
      "node_modules/",
      "svgr.config.js",
      "postcss.config.js",
      "tailwind.config.js",
      "svgr-*-template.js",
      "**/*.stories.tsx",
      ".storybook/**",
      "scripts/**",
    ],
  },

  // Base configs
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Global settings
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            "eslint.config.mjs",
            "playground/postcss.config.cjs",
            "playground/tailwind.config.cjs",
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        // Browser
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        fetch: "readonly",
        // Node
        process: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        module: "readonly",
        require: "readonly",
        global: "readonly",
        // Jest
        describe: "readonly",
        it: "readonly",
        test: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        jest: "readonly",
      },
    },
  },

  // Plugin configurations
  {
    plugins: {
      import: importPlugin,
      "simple-import-sort": simpleImportSort,
    },
  },

  // Main rules
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    rules: {
      // Import rules
      "import/no-cycle": "error",
      "import/no-extraneous-dependencies": [
        "warn",
        {
          devDependencies: [
            "**/*.stories.tsx",
            "**/*.config.js",
            "**/*.config.ts",
            "**/scripts/**",
            ".storybook/**",
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

      // TypeScript rules
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern:
            "^_|(VARIANTS|SIZES|HEIGHTS|SIDES|STATUS|STATES|DIRECTIONS)$",
          caughtErrorsIgnorePattern: "^_|^(e|error)$",
        },
      ],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/return-await": ["error", "in-try-catch"],
      "@typescript-eslint/no-empty-object-type": "off",

      // General rules
      curly: ["error", "all"],

      // Restricted imports
      "no-restricted-imports": [
        "error",
        {
          patterns: ["*/index_with_tw_base"],
        },
      ],
    },
  },

  // Allow require() in CommonJS config files
  {
    files: ["**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },

  // Prettier config (must be last)
  eslintConfigPrettier,
];
