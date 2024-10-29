module.exports = {
  extends: [
    "prettier",
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:storybook/recommended",
  ],
  plugins: ["import", "simple-import-sort"],
  ignorePatterns: [
    "rollup.config.js",
    "eslint.js",
    ".eslintrc.js",
    "dist/",
    "node_modules/",
    "svgr.config.js",
    "postcss.config.js",
    "tailwind.config.js",
    "svgr-*-template.js",
  ],
  rules: {
    "import/no-cycle": "error",
    curly: ["error", "all"],
    "@typescript-eslint/no-floating-promises": "error",
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
    "no-restricted-imports": ["error", {
      "patterns": ["*/index_with_tw_base"]
    }]
  },
  overrides: [
    {
      files: ["*.stories.tsx"],
      rules: {
        "no-restricted-imports": ["off"]
      }
    }
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
