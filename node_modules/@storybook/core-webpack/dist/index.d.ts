import { StorybookConfig as StorybookConfig$1, Options, NormalizedStoriesSpecifier } from 'storybook/internal/types';
export { BuilderResult, Options, Preset, TypescriptOptions } from 'storybook/internal/types';

type RulesConfig = any;
type ModuleConfig = {
    rules?: RulesConfig[];
};
type ResolveConfig = {
    extensions?: string[];
    mainFields?: (string | string[])[] | undefined;
    alias?: any;
};
interface WebpackConfiguration {
    plugins?: any[];
    module?: ModuleConfig;
    resolve?: ResolveConfig;
    optimization?: any;
    devtool?: false | string;
}
type BuilderOptions = {
    fsCache?: boolean;
    lazyCompilation?: boolean;
};
type StorybookConfig<TWebpackConfiguration = WebpackConfiguration> = StorybookConfig$1 & {
    /**
     * Modify or return a custom Webpack config after the Storybook's default configuration has run
     * (mostly used by addons).
     */
    webpack?: (config: TWebpackConfiguration, options: Options) => TWebpackConfiguration | Promise<TWebpackConfiguration>;
    /** Modify or return a custom Webpack config after every addon has run. */
    webpackFinal?: (config: TWebpackConfiguration, options: Options) => TWebpackConfiguration | Promise<TWebpackConfiguration>;
};

declare const loadCustomWebpackConfig: (configDir: string) => any;

declare const checkWebpackVersion: (webpack: {
    version?: string;
}, specifier: string, caption: string) => void;

declare function mergeConfigs(config: WebpackConfiguration, customConfig: WebpackConfiguration): WebpackConfiguration;

declare function webpackIncludeRegexp(specifier: NormalizedStoriesSpecifier): RegExp;
declare function toImportFnPart(specifier: NormalizedStoriesSpecifier): string;
declare function toImportFn(stories: NormalizedStoriesSpecifier[], { needPipelinedImport }?: {
    needPipelinedImport?: boolean;
}): string;

declare const toRequireContext: (specifier: NormalizedStoriesSpecifier) => {
    path: string;
    recursive: boolean;
    match: RegExp;
};
declare const toRequireContextString: (specifier: NormalizedStoriesSpecifier) => string;

export { BuilderOptions, ModuleConfig, ResolveConfig, RulesConfig, StorybookConfig, WebpackConfiguration, checkWebpackVersion, loadCustomWebpackConfig, mergeConfigs, toImportFn, toImportFnPart, toRequireContext, toRequireContextString, webpackIncludeRegexp };
