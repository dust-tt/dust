import { TypescriptOptions as TypescriptOptions$1, WebpackConfiguration, StorybookConfig as StorybookConfig$1 } from '@storybook/core-webpack';
import { PluginOptions } from '@storybook/react-docgen-typescript-plugin';

interface ReactOptions {
    strictMode?: boolean;
    /**
     * Use React's legacy root API to mount components
     *
     * React has introduced a new root API with React 18.x to enable a whole set of new features (e.g.
     * concurrent features) If this flag is true, the legacy Root API is used to mount components to
     * make it easier to migrate step by step to React 18.
     *
     * @default false
     */
    legacyRootApi?: boolean;
}
type TypescriptOptions = TypescriptOptions$1 & {
    /**
     * Sets the type of Docgen when working with React and TypeScript
     *
     * @default `'react-docgen'`
     */
    reactDocgen: 'react-docgen-typescript' | 'react-docgen' | false;
    /**
     * Configures `react-docgen-typescript-plugin`
     *
     * @default
     * @see https://github.com/storybookjs/storybook/blob/next/code/builders/builder-webpack5/src/config/defaults.js#L4-L6
     */
    reactDocgenTypescriptOptions: PluginOptions;
};
type StorybookConfig<TWebpackConfiguration = WebpackConfiguration> = StorybookConfig$1<TWebpackConfiguration> & {
    typescript?: Partial<TypescriptOptions>;
};

export { ReactOptions as R, StorybookConfig as S, TypescriptOptions as T };
