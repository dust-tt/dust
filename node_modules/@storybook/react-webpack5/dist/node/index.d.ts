import { StorybookConfig } from '../index.js';
import 'storybook/internal/types';
import '@storybook/builder-webpack5';
import '@storybook/preset-react-webpack';
import '@storybook/react';

declare function defineMain(config: StorybookConfig): StorybookConfig;

export { defineMain };
