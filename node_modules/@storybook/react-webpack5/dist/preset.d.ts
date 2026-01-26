import { PresetProperty } from 'storybook/internal/types';
import { StorybookConfig } from './index.js';
import '@storybook/builder-webpack5';
import '@storybook/preset-react-webpack';
import '@storybook/react';

declare const addons: PresetProperty<'addons'>;
declare const core: PresetProperty<'core'>;
declare const webpack: StorybookConfig['webpack'];

export { addons, core, webpack };
