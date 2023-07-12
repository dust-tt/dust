module.exports = {
  extends: ["next/core-web-vitals", "prettier", "eslint:recommended", "plugin:@typescript-eslint/recommended", "plugin:storybook/recommended"],
  plugins: ["simple-import-sort"],
  rules: {
    "react/no-unescaped-entities": 0,
    "@typescript-eslint/no-explicit-any": 0,
    "no-case-declarations": 0,
    "react-hooks/rules-of-hooks": 0,
    "react-hooks/exhaustive-deps": 0,
    "@next/next/no-img-element": 0,
    "@typescript-eslint/no-floating-promises": "error",
    "jsx-a11y/alt-text": 0,
    "simple-import-sort/imports": ["error", {
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
      ["^\\."]]
    }],
    "simple-import-sort/exports": "error"
  },
  overrides: [{
    files: ["*.jsx", "*.js", "*.ts", "*.tsx", "**/*.jsx"]
  }],
  env: {
    browser: true,
    node: true,
    es6: true,
    jest: true
  },
  parserOptions: {
    project: "./tsconfig.json",
    tsconfigRootDir: __dirname
  }
};