import * as webpackDep from 'webpack';

declare const webpack: (_: unknown, options: any) => Promise<webpackDep.Configuration>;
declare const entries: (_: unknown, options: any) => Promise<string[]>;
declare const previewMainTemplate: () => string;

export { entries, previewMainTemplate, webpack };
