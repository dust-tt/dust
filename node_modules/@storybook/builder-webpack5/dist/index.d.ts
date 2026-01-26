import { Options as Options$1, Builder } from 'storybook/internal/types';
import webpackDep__default, { Configuration, Stats } from 'webpack';
import { StorybookConfig, Options, BuilderResult as BuilderResult$1, TypescriptOptions as TypescriptOptions$1 } from '@storybook/core-webpack';
import ForkTsCheckerWebpackPlugin from 'fork-ts-checker-webpack-plugin';

type TypeScriptOptionsBase = Partial<TypescriptOptions$1>;
/** Options for TypeScript usage within Storybook. */
interface TypescriptOptions extends TypeScriptOptionsBase {
    /** Configures `fork-ts-checker-webpack-plugin` */
    checkOptions?: ConstructorParameters<typeof ForkTsCheckerWebpackPlugin>[0];
}
interface StorybookConfigWebpack extends Omit<StorybookConfig, 'webpack' | 'webpackFinal'> {
    /**
     * Modify or return a custom Webpack config after the Storybook's default configuration has run
     * (mostly used by addons).
     */
    webpack?: (config: Configuration, options: Options) => Configuration | Promise<Configuration>;
    /** Modify or return a custom Webpack config after every addon has run. */
    webpackFinal?: (config: Configuration, options: Options) => Configuration | Promise<Configuration>;
}
type BuilderOptions = {
    fsCache?: boolean;
    lazyCompilation?: boolean;
};
interface BuilderResult extends BuilderResult$1 {
    stats?: Stats;
}

declare const getVirtualModules: (options: Options$1) => Promise<{
    virtualModules: Record<string, string>;
    entries: string[];
}>;

declare const WebpackDefinePlugin: typeof webpackDep__default.DefinePlugin;
declare const WebpackIgnorePlugin: typeof webpackDep__default.IgnorePlugin;
declare const printDuration: (startTime: [number, number]) => string;
type WebpackBuilder = Builder<Configuration, Stats>;
type BuilderStartOptions = Parameters<WebpackBuilder['start']>['0'];
declare const executor: {
    get: (options: Options$1) => Promise<typeof webpackDep__default>;
};
declare const getConfig: WebpackBuilder['getConfig'];
declare const bail: WebpackBuilder['bail'];
declare const start: (options: BuilderStartOptions) => Promise<void | {
    stats?: Stats | undefined;
    totalTime: ReturnType<typeof process.hrtime>;
    bail: (e?: Error) => Promise<void>;
}>;
declare const build: (options: BuilderStartOptions) => Promise<void | Stats>;
declare const corePresets: string[];
declare const overridePresets: string[];

export { BuilderOptions, BuilderResult, StorybookConfigWebpack, TypescriptOptions, WebpackDefinePlugin, WebpackIgnorePlugin, bail, build, corePresets, executor, getConfig, getVirtualModules, overridePresets, printDuration, start };
