import ts from "typescript";
export interface TsTransformPathsConfig {
    readonly useRootDirs?: boolean;
    readonly exclude?: string[];
    readonly afterDeclarations?: boolean;
    readonly tsConfig?: string;
    readonly transform?: string;
}
export type NxTransformerFactory = (config?: Omit<TsTransformPathsConfig, "transform">, program?: ts.Program) => ts.TransformerFactory<ts.SourceFile>;
export interface NxTransformerPlugin {
    before: NxTransformerFactory;
    afterDeclarations: NxTransformerFactory;
}
export declare const before: NxTransformerFactory;
export declare const afterDeclarations: NxTransformerFactory;
