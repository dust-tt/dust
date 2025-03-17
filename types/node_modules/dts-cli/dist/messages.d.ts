export declare const help: () => string;
export declare const missingProjectName: () => string;
export declare const alreadyExists: (projectName: string) => string;
export declare const installing: (packages: string[]) => string;
export declare const installError: (packages: string[]) => void;
export declare const copying: (projectName: string) => string;
export declare const start: (projectName: string) => Promise<string>;
export declare const incorrectNodeVersion: (requiredVersion: string) => string;
