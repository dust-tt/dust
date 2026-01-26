import { t as transformer } from "../transformer-ltazp64o.mjs";

//#region src/plugins/nx.ts
const voidTransformer = () => (s) => s;
const before = (pluginConfig, program) => pluginConfig?.afterDeclarations ? voidTransformer : transformer(program, { ...pluginConfig });
const afterDeclarations = (pluginConfig, program) => pluginConfig?.afterDeclarations ? transformer(program, { ...pluginConfig }) : voidTransformer;

//#endregion
export { afterDeclarations, before };