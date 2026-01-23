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
    ignores: [".eslintrc.js", "eslint.config.js", "dist/", "node_modules/"],
  },

  // Base configs
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Global settings
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.mjs", "esbuild.config.ts"],
        },
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
      "import/consistent-type-specifier-style": ["error", "prefer-top-level"],
      "import/no-extraneous-dependencies": [
        "warn",
        {
          devDependencies: [
            "**/*.config.js",
            "**/*.config.ts",
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
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_|Schema$|^MCP_",
        },
      ],
      "@typescript-eslint/return-await": ["error", "in-try-catch"],

      // Unused imports
      "unused-imports/no-unused-imports": "error",

      // General rules
      curly: ["error", "all"],
    },
  },

  // Prettier config (must be last)
  eslintConfigPrettier,
];
