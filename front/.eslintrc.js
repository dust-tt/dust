module.exports = {
  extends: [
    "next/core-web-vitals",
    "prettier",
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
  ],
  plugins: ["import", "simple-import-sort"],
  rules: {
    /**
    "@typescript-eslint/naming-convention": [
      "error",
      {
        "selector": "variableLike",
        "format": ["camelCase"]
      }
    ],
    */
    curly: ["error", "all"],
    "react/no-unescaped-entities": 0,
    // "@typescript-eslint/strict-boolean-expressions": [
    //   "error",
    //   {
    //     allowNullableBoolean: true,
    //     allowNullableString: true,
    //     allowNullableObject: true,
    //     allowNullableNumber: true,
    //     allowNullableEnum: true,
    //     allowAny: true,
    //   },
    // ],
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
