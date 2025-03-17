import { PackageJson } from './types';
export declare function isTypesRollupEnabled(appPackageJson: PackageJson): boolean;
export declare function rollupTypes(tsconfig: string | undefined, appPackageJson: PackageJson): Promise<void>;
