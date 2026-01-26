"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOutputDirForSourceFile = getOutputDirForSourceFile;
exports.isModulePathsMatch = isModulePathsMatch;
exports.createSyntheticEmitHost = createSyntheticEmitHost;
exports.getTsNodeRegistrationProperties = getTsNodeRegistrationProperties;
const node_path_1 = __importDefault(require("node:path"));
/* ****************************************************************************************************************** */
// region: TS Helpers
/* ****************************************************************************************************************** */
/** Determine output file path for source file */
function getOutputDirForSourceFile(context, sourceFile) {
    const { tsInstance, emitHost, outputFileNamesCache, compilerOptions, tsInstance: { getOwnEmitOutputFilePath, getOutputExtension }, } = context;
    if (outputFileNamesCache.has(sourceFile))
        return outputFileNamesCache.get(sourceFile);
    // Note: In project references, resolved path is different from path. In that case, our output path is already
    // determined in resolvedPath
    const outputPath = sourceFile.path && sourceFile.resolvedPath && sourceFile.path !== sourceFile.resolvedPath
        ? sourceFile.resolvedPath
        : getOwnEmitOutputFilePath(sourceFile.fileName, emitHost, getOutputExtension(sourceFile.fileName, compilerOptions));
    if (!outputPath)
        throw new Error(`Could not resolve output path for ${sourceFile.fileName}. Please report a GH issue at: ` +
            `https://github.com/LeDDGroup/typescript-transform-paths/issues`);
    const res = node_path_1.default.dirname(outputPath);
    outputFileNamesCache.set(sourceFile, res);
    return tsInstance.normalizePath(res);
}
/** Determine if moduleName matches config in paths */
function isModulePathsMatch(context, moduleName) {
    const { pathsPatterns, tsInstance: { matchPatternOrExact }, } = context;
    return !!(pathsPatterns && matchPatternOrExact(pathsPatterns, moduleName));
}
/** Create barebones EmitHost (for no-Program transform) */
function createSyntheticEmitHost(compilerOptions, tsInstance, getCanonicalFileName, fileNames) {
    return {
        getCompilerOptions: () => compilerOptions,
        getCurrentDirectory: tsInstance.sys.getCurrentDirectory,
        getCommonSourceDirectory: () => tsInstance.getCommonSourceDirectoryOfConfig({ options: compilerOptions, fileNames: fileNames }, !tsInstance.sys.useCaseSensitiveFileNames),
        getCanonicalFileName,
    };
}
/** Get ts-node register info */
function getTsNodeRegistrationProperties(tsInstance) {
    let tsNodeSymbol;
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        tsNodeSymbol = require("ts-node")?.["REGISTER_INSTANCE"];
    }
    catch {
        return;
    }
    if (!global.process[tsNodeSymbol])
        return;
    const { config, options } = global.process[tsNodeSymbol];
    const { configFilePath } = config.options;
    // @ts-expect-error TS(2345) FIXME: Argument of type 'System' is not assignable to parameter of type 'ParseConfigFileHost'.
    const pcl = configFilePath ? tsInstance.getParsedCommandLineOfConfigFile(configFilePath, {}, tsInstance.sys) : void 0;
    const fileNames = pcl?.fileNames || config.fileNames;
    const compilerOptions = Object.assign({}, config.options, options.compilerOptions, { outDir: pcl?.options.outDir });
    return { compilerOptions, fileNames, tsNodeOptions: options };
}
// endregion
//# sourceMappingURL=ts-helpers.js.map