module.exports = {
  extends: [
    "next/core-web-vitals",
    "prettier",
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
  ],
  plugins: ["import", "simple-import-sort", "filenames"],
  rules: {
    "import/no-cycle": "error",
    curly: ["error", "all"],
    "react/no-unescaped-entities": 0,
    "@typescript-eslint/consistent-type-imports": "error",
    "import/consistent-type-specifier-style": ["error", "prefer-top-level"],
    "@typescript-eslint/no-explicit-any": 0,
    "@typescript-eslint/no-unused-vars": "error",
    "no-case-declarations": 0,
    "@next/next/no-img-element": 0,
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/no-misused-promises": [
      "error",
      {
        checksVoidReturn: false,
      },
    ],
    "jsx-a11y/alt-text": 0,
    "no-restricted-syntax": [
      "error",
      {
        selector: "JSXAttribute[name.name='className'][value.value=/\\bs-/]",
        message:
          "className values with 's-' prefix are not allowed in front. These are reserved for sparkle components.",
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
    "@typescript-eslint/return-await": ["error", "in-try-catch"],
  },
  overrides: [
    {
      files: ["*.jsx", "*.js", "*.ts", "*.tsx", "**/*.jsx"],
    },
    {
      // Force the setting of a swagger description on each public api endpoint
      files: ["pages/api/v1/**/*.ts"],
      excludedFiles: ["**/*.test.ts"],
      plugins: ["jsdoc"],
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
    },
    {
      files: ["pages/**/*.test.ts"], // Apply to *.test.ts files under pages/ and its subdirectories
      rules: {
        "filenames/match-regex": [
          2, // Error level
          {
            // No brackets in test file names, since it breaks the endpoints
            // See https://dust4ai.slack.com/archives/C050SM8NSPK/p1746457322664439
            ".test.ts$": "^[^[]]+.test.ts$",
          },
          false, // Match just the filename, not the entire path
        ],
      },
    },
  ],
  env: {
    browser: true,
    node: true,
    es6: true,
    jest: true,
  },
  parserOptions: {
    project: "./tsconfig.json",
    tsconfigRootDir: __dirname,
  },
};
