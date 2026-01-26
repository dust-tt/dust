import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import tseslint from "typescript-eslint";
import unusedImports from "eslint-plugin-unused-imports";

export default [
  // Ignores
  {
    ignores: [".next/", "node_modules/"],
  },

  // Base configs
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Global settings
  {
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
      },
    },
  },

  // Next.js plugin
  {
    plugins: {
      "@next/next": nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },

  // Unused imports plugin
  {
    plugins: {
      "unused-imports": unusedImports,
    },
  },

  // Main rules
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    rules: {
      eqeqeq: "error",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_|^(e|err|error)$",
        },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "unused-imports/no-unused-imports": "error",
    },
  },

  // Config files - allow require
  {
    files: ["*.config.{js,ts,mjs}", "*.config.*.{js,ts,mjs}"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];
