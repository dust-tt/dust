import { RollupOptions } from 'rollup';
import { DtsOptions, PackageJson } from './types';
export declare function createRollupConfig(appPackageJson: PackageJson, opts: DtsOptions, outputNum: number): Promise<RollupOptions>;
