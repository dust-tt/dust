module.exports = {
  extends: [
    "prettier",
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
  ],
  plugins: ["import", "simple-import-sort", "eslint-plugin-unused-imports"],
  rules: {
    curly: ["error", "all"],
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
    "unused-imports/no-unused-imports": "error",
    "simple-import-sort/exports": "error",
    "@typescript-eslint/consistent-type-imports": "error",
    "import/consistent-type-specifier-style": ["error", "prefer-top-level"],
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/no-misused-promises": [
      "error",
      {
        checksVoidReturn: false,
      },
    ],
    "@typescript-eslint/no-unused-vars": "error",
    "@typescript-eslint/return-await": ["error", "in-try-catch"],
  },
  overrides: [
    {
      files: ["*.jsx", "*.js", "*.ts", "*.tsx"],
    },
  ],
  env: {
    node: true,
    es6: true,
  },
  parserOptions: {
    project: "./tsconfig.json",
    tsconfigRootDir: __dirname,
  },
};
