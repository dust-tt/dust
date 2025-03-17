import { Linter } from 'eslint';
import { PackageJson } from './types';
interface CreateEslintConfigArgs {
    pkg: PackageJson;
    rootDir: string;
    writeFile: boolean;
}
export declare function createEslintConfig({ pkg, rootDir, writeFile, }: CreateEslintConfigArgs): Promise<Linter.Config | void>;
export {};
