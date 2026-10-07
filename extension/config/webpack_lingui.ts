import type { RuleSetRule, RuleSetUseItem } from "webpack";

export const linguiMacroLoader: RuleSetUseItem = {
  loader: "babel-loader",
  options: {
    babelrc: false,
    configFile: false,
    plugins: [require.resolve("@lingui/babel-plugin-lingui-macro")],
    overrides: [
      { test: /\.tsx$/, parserOpts: { plugins: ["typescript", "jsx"] } },
      { test: /\.ts$/, parserOpts: { plugins: ["typescript"] } },
    ],
  },
};

export const linguiCatalogRule: RuleSetRule = {
  test: /\.catalog$/,
  use: { loader: require.resolve("./lingui_catalog_loader") },
};
