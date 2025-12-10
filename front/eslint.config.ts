import { createRequire } from "node:module";
import js from "@eslint/js";
import type { Linter } from "eslint";
import nextPlugin from "@next/eslint-plugin-next";
import importPlugin from "eslint-plugin-import";
import jsdocPlugin from "eslint-plugin-jsdoc";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import unusedImports from "eslint-plugin-unused-imports";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";

const require = createRequire(import.meta.url);
const dustPlugin = require("eslint-plugin-dust");

export default defineConfig(
  // Ignores - must come first in flat config
  {
    ignores: [
      ".prettierrc.js",
      "eslint.config.ts",
      "**/*.config.js",
      "**/node_modules/**",
      "**/.next/**",
      "**/out/**",
      "**/dist/**",
      "**/build/**",
      "**migrations/**",
      "**mailing/**",
      // Specific problematic binary files
      "**/node_modules/**/character-reference-invalid/index.js",
    ],
  },

  // Base configs
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  // Global settings
  {
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.ts"],
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
      "@next/next": nextPlugin,
      import: importPlugin,
      "simple-import-sort": simpleImportSort,
      dust: dustPlugin,
      "unused-imports": unusedImports,
      jsdoc: jsdocPlugin,
    },
  },

  // Main rules
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    rules: {
      // Next.js rules
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      "@next/next/no-img-element": "off",

      // Import rules
      "import/consistent-type-specifier-style": ["error", "prefer-top-level"],

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
            // @app imports.
            ["^@app"],
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
      "import/no-cycle": ["error", { maxDepth: 1, ignoreExternal: true }],

      // TypeScript rules
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        {
          checksVoidReturn: false,
        },
      ],
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      "@typescript-eslint/return-await": ["error", "in-try-catch"],
      // Disable rule that causes stack overflow on complex types
      "@typescript-eslint/no-redundant-type-constituents": "off",
      // To activate
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/no-unsafe-enum-comparison": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/only-throw-error": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/unbound-method": "off",
      "@typescript-eslint/no-duplicate-type-constituents": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "@typescript-eslint/no-base-to-string": "off",
      "@typescript-eslint/await-thenable": "off",
      "@typescript-eslint/prefer-promise-reject-errors": "off",
      "@typescript-eslint/no-for-in-array": "off",
      "@typescript-eslint/no-empty-object-type": "off",

      // Unused imports
      "unused-imports/no-unused-imports": "error",

      // General rules
      curly: ["error", "all"],
      "react/no-unescaped-entities": "off",
      "no-case-declarations": "off",
      "jsx-a11y/alt-text": "off",
      "no-unused-expressions": "error",
      "no-restricted-globals": [
        "warn",
        {
          name: "fetch",
          message:
            "Use clientFetch, trustedFetch, or untrustedFetch from @app/lib/egress instead of the global fetch to make egress intent explicit.",
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name='className'][value.value=/\\bs-/]",
          message:
            "className values with 's-' prefix are not allowed in front. These are reserved for sparkle components.",
        },
      ],

      // Custom Dust rules
      "dust/no-raw-sql": "error",
      "dust/no-unverified-workspace-bypass": "error",
      "dust/too-long-index-name": "error",
      "dust/no-direct-sparkle-notification": "warn",
      "dust/no-bulk-lodash": "error",
      "dust/enforce-client-types-in-public-api": "error",
    },
  },
  // react rules
  reactHooks.configs.flat.recommended,

  // Public API endpoints - require Swagger docs
  {
    files: ["pages/api/v1/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: {
      "jsdoc/no-missing-syntax": [
        "error",
        {
          contexts: [
            {
              comment:
                "JsdocBlock:has(JsdocTag[tag=/^(swagger|ignoreswagger)$/])",
              context: "any",
              message:
                "@swagger documentation is required on each public endpoint.",
            },
          ],
        },
      ],
    },
  }
) satisfies Linter.Config[];
