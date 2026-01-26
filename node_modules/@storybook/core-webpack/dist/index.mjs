import { resolve } from 'node:path';
import { serverRequire, globToRegexp } from 'storybook/internal/common';
import { logger } from 'storybook/internal/node-logger';
import { dedent } from 'ts-dedent';

var webpackConfigs=["webpack.config","webpackfile"],loadCustomWebpackConfig=configDir=>serverRequire(webpackConfigs.map(configName=>resolve(configDir,configName)));var checkWebpackVersion=(webpack,specifier,caption)=>{if(!webpack.version){logger.info("Skipping webpack version check, no version available");return}webpack.version!==specifier&&logger.warn(dedent`
      Unexpected webpack version in ${caption}:
      - Received '${webpack.version}'
      - Expected '${specifier}'

      If you're using Webpack 5 in SB6.2 and upgrading, consider: https://github.com/storybookjs/storybook/blob/next/MIGRATION.md#webpack-5-manager-build

      For more info about Webpack 5 support: https://gist.github.com/shilman/8856ea1786dcd247139b47b270912324#troubleshooting
    `);};function mergePluginsField(defaultPlugins=[],customPlugins=[]){return [...defaultPlugins,...customPlugins]}function mergeRulesField(defaultRules=[],customRules=[]){return [...defaultRules,...customRules]}function mergeExtensionsField({extensions:defaultExtensions=[]},{extensions:customExtensions=[]}){return [...defaultExtensions,...customExtensions]}function mergeAliasField({alias:defaultAlias={}},{alias:customAlias={}}){return {...defaultAlias,...customAlias}}function mergeModuleField(a,b){return {...a,...b,rules:mergeRulesField(a.rules||[],b.rules||[])}}function mergeResolveField({resolve:defaultResolve={}},{resolve:customResolve={}}){return {...defaultResolve,...customResolve,alias:mergeAliasField(defaultResolve,customResolve),extensions:mergeExtensionsField(defaultResolve,customResolve)}}function mergeOptimizationField({optimization:defaultOptimization={}},{optimization:customOptimization={}}){return {...defaultOptimization,...customOptimization}}function mergeConfigs(config,customConfig){return {...customConfig,...config,devtool:customConfig.devtool||config.devtool,plugins:mergePluginsField(config.plugins,customConfig.plugins),module:mergeModuleField(config.module||{},customConfig.module||{}),resolve:mergeResolveField(config,customConfig),optimization:mergeOptimizationField(config,customConfig)}}function importPipeline(){let importGate=Promise.resolve();return async importFn=>{await importGate;let moduleExportsPromise=importFn();return importGate=importGate.then(async()=>{await moduleExportsPromise;}),moduleExportsPromise}}function adjustRegexToExcludeNodeModules(originalRegex){let originalRegexString=originalRegex.source,startsWithCaret=originalRegexString.startsWith("^"),excludeNodeModulesPattern=startsWithCaret?"(?!.*node_modules)":"^(?!.*node_modules)",adjustedRegexString=startsWithCaret?`^${excludeNodeModulesPattern}${originalRegexString.substring(1)}`:excludeNodeModulesPattern+originalRegexString;return new RegExp(adjustedRegexString)}function webpackIncludeRegexp(specifier){let{directory,files}=specifier,directoryWithoutLeadingDots=directory.replace(/^(\.+\/)+/,"/"),webpackIncludeGlob=[".",".."].includes(directory)?files:`${directoryWithoutLeadingDots}/${files}`,webpackIncludeRegexpWithCaret=webpackIncludeGlob.includes("node_modules")?globToRegexp(webpackIncludeGlob):adjustRegexToExcludeNodeModules(globToRegexp(webpackIncludeGlob));return new RegExp(webpackIncludeRegexpWithCaret.source.replace(/^\^/,""))}function toImportFnPart(specifier){let{directory,importPathMatcher}=specifier;return dedent`
      async (path) => {
        if (!${importPathMatcher}.exec(path)) {
          return;
        }

        const pathRemainder = path.substring(${directory.length+1});
        return import(
          /* webpackChunkName: "[request]" */
          /* webpackInclude: ${webpackIncludeRegexp(specifier)} */
          '${directory}/' + pathRemainder
        );
      }

  `}function toImportFn(stories,{needPipelinedImport}={}){let pipelinedImport="const pipeline = (x) => x();";return needPipelinedImport&&(pipelinedImport=`
      const importPipeline = ${importPipeline};
      const pipeline = importPipeline();
    `),dedent`
    ${pipelinedImport}

    const importers = [
      ${stories.map(toImportFnPart).join(`,
`)}
    ];

    export async function importFn(path) {
      for (let i = 0; i < importers.length; i++) {
        const moduleExports = await pipeline(() => importers[i](path));
        if (moduleExports) {
          return moduleExports;
        }
      }
    }
  `}var toRequireContext=specifier=>{let{directory,files}=specifier,match=globToRegexp(`./${files}`);return {path:directory,recursive:files.includes("**")||files.split("/").length>1,match}},toRequireContextString=specifier=>{let{path:p,recursive:r,match:m}=toRequireContext(specifier);return `require.context('${p}', ${r}, ${m})`};

export { checkWebpackVersion, loadCustomWebpackConfig, mergeConfigs, toImportFn, toImportFnPart, toRequireContext, toRequireContextString, webpackIncludeRegexp };
