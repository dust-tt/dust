import { RollupOptions } from 'rollup';
import { NormalizedOpts, PackageJson } from './types';
export declare function createBuildConfigs(opts: NormalizedOpts, appPackageJson: PackageJson): Promise<Array<RollupOptions>>;
