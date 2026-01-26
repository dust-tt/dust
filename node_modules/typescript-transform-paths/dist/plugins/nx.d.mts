import ts from "typescript";

//#region src/plugins/nx.d.ts
interface TsTransformPathsConfig {
  readonly useRootDirs?: boolean;
  readonly exclude?: string[];
  readonly afterDeclarations?: boolean;
  readonly tsConfig?: string;
  readonly transform?: string;
}
type NxTransformerFactory = (config?: Omit<TsTransformPathsConfig, "transform">, program?: ts.Program) => ts.TransformerFactory<ts.SourceFile>;
interface NxTransformerPlugin {
  before: NxTransformerFactory;
  afterDeclarations: NxTransformerFactory;
}
declare const before: NxTransformerFactory;
declare const afterDeclarations: NxTransformerFactory;
//#endregion
export { NxTransformerFactory, NxTransformerPlugin, TsTransformPathsConfig, afterDeclarations, before };