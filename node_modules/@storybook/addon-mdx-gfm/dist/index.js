'use strict';

var nodeLogger = require('storybook/internal/node-logger');
var remarkGfm = require('remark-gfm');
var tsDedent = require('ts-dedent');

function _interopDefault (e) { return e && e.__esModule ? e : { default: e }; }

var remarkGfm__default = /*#__PURE__*/_interopDefault(remarkGfm);

var mdxLoaderOptions=async config=>(config.mdxCompileOptions.remarkPlugins=config.mdxCompileOptions.remarkPlugins||[],config.mdxCompileOptions.remarkPlugins.push(remarkGfm__default.default),config);nodeLogger.deprecate(tsDedent.dedent`
  The "@storybook/addon-mdx-gfm" addon is meant as a migration assistant for Storybook 8.0; and will likely be removed in a future version.
  It's recommended you read this document:
  https://storybook.js.org/docs/writing-docs/mdx#markdown-tables-arent-rendering-correctly

  Once you've made the necessary changes, you can remove the addon from your package.json and storybook config.
`);

exports.mdxLoaderOptions = mdxLoaderOptions;
