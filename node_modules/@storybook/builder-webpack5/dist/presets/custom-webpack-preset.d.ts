import { PresetProperty, Options } from 'storybook/internal/types';
import * as webpackDep from 'webpack';
import { Configuration } from 'webpack';

declare const swc: PresetProperty<'swc'>;
declare function webpack(config: Configuration, options: Options): Promise<any>;
declare const webpackInstance: () => Promise<typeof webpackDep>;
declare const webpackVersion: () => Promise<string>;

export { swc, webpack, webpackInstance, webpackVersion };
