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
          ["^\\u0000"],
          ["^node:"],
          ["^@?\\w"],
          ["^@sparkle"],
          ["^"],
          ["^\\."],
        ],
      },
    ],
    "simple-import-sort/exports": "error",
    "@typescript-eslint/return-await": ["error", "in-try-catch"],
    "no-restricted-imports": [
      "error",
      {
        patterns: ["*/index_with_tw_base"],
      },
    ],
    "no-restricted-syntax": [
      "error",
      {
        selector:
          "JSXAttribute[name.name='className'] Literal[value=/\\bs-z-/]",
        message: "Usage of s-z- tailwind classes (z-index) is forbidden.",
      },
    ],
  },
  overrides: [
    {
      files: ["*.stories.tsx"],
      rules: {
        "no-restricted-imports": ["off"],
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
