import { Minimatch } from "minimatch";
import ts from "typescript";
import { PluginConfig, TransformerExtras } from "ts-patch";

//#region src/types.d.ts

interface TsTransformPathsConfig extends PluginConfig {
  readonly useRootDirs?: boolean;
  readonly exclude?: string[];
}
//#endregion
//#region src/transformer.d.ts
declare function transformer(program?: ts.Program, pluginConfig?: TsTransformPathsConfig, transformerExtras?: TransformerExtras, /** Supply if manually transforming with compiler API via 'transformNodes' / 'transformModule' */
manualTransformOptions?: {
  compilerOptions?: ts.CompilerOptions;
  fileNames?: string[];
}): (transformationContext: ts.TransformationContext) => (sourceFile: ts.SourceFile) => ts.SourceFile;
//#endregion
export { type TsTransformPathsConfig, transformer as default };