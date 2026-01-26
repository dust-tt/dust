import { CompatibleString } from 'storybook/internal/types';
import { BuilderOptions, StorybookConfigWebpack, TypescriptOptions } from '@storybook/builder-webpack5';
import { ReactOptions, StorybookConfig as StorybookConfig$1, TypescriptOptions as TypescriptOptions$1 } from '@storybook/preset-react-webpack';
export { __definePreview as definePreview } from '@storybook/react';

type FrameworkName = CompatibleString<'@storybook/react-webpack5'>;
type BuilderName = CompatibleString<'@storybook/builder-webpack5'>;
type FrameworkOptions = ReactOptions & {
    builder?: BuilderOptions;
};
type StorybookConfigFramework = {
    framework: FrameworkName | {
        name: FrameworkName;
        options: FrameworkOptions;
    };
    core?: StorybookConfig$1['core'] & {
        builder?: BuilderName | {
            name: BuilderName;
            options: BuilderOptions;
        };
    };
    typescript?: Partial<TypescriptOptions & TypescriptOptions$1> & StorybookConfig$1['typescript'];
};
/** The interface for Storybook configuration in `main.ts` files. */
type StorybookConfig = Omit<StorybookConfig$1, keyof StorybookConfigWebpack | keyof StorybookConfigFramework> & StorybookConfigWebpack & StorybookConfigFramework;

export { FrameworkOptions, StorybookConfig };
