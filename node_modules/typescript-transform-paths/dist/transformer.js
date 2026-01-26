"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = transformer;
const node_path_1 = __importDefault(require("node:path"));
const typescript_1 = __importDefault(require("typescript"));
const types_1 = require("./types");
const visitor_1 = require("./visitor");
const harmony_1 = require("./harmony");
const minimatch_1 = require("minimatch");
const ts_helpers_1 = require("./utils/ts-helpers");
function getTsProperties(args) {
    let fileNames;
    let compilerOptions;
    let runMode;
    let tsNodeState;
    const { 0: program, 2: extras, 3: manualTransformOptions } = args;
    const tsInstance = extras?.ts ?? typescript_1.default;
    if (program)
        compilerOptions = program.getCompilerOptions();
    const tsNodeProps = (0, ts_helpers_1.getTsNodeRegistrationProperties)(tsInstance);
    /* Determine RunMode & Setup */
    // Note: ts-node passes a Program with the paths property stripped, so we do some comparison to determine if it's the caller
    const isTsNode = tsNodeProps && (!program || compilerOptions.configFilePath === tsNodeProps.compilerOptions.configFilePath);
    // RunMode: Program
    if (program && !isTsNode) {
        runMode = types_1.RunMode.Program;
        compilerOptions = compilerOptions;
    }
    // RunMode: Manual
    else if (manualTransformOptions) {
        runMode = types_1.RunMode.Manual;
        fileNames = manualTransformOptions.fileNames;
        compilerOptions = manualTransformOptions.compilerOptions;
    }
    // RunMode: TsNode
    else if (isTsNode) {
        fileNames = tsNodeProps.fileNames;
        runMode = types_1.RunMode.TsNode;
        tsNodeState =
            !program ||
                (fileNames.length > 1 && program?.getRootFileNames().length === 1) ||
                (!compilerOptions.paths && tsNodeProps.compilerOptions.paths)
                ? types_1.TsNodeState.Stripped
                : types_1.TsNodeState.Full;
        compilerOptions =
            tsNodeState === types_1.TsNodeState.Full
                ? compilerOptions
                : {
                    ...program?.getCompilerOptions(),
                    ...tsNodeProps.compilerOptions,
                };
    }
    else {
        throw new Error(`Cannot transform without a Program, ts-node instance, or manual parameters supplied. ` +
            `Make sure you're using ts-patch or ts-node with transpileOnly.`);
    }
    return { tsInstance, compilerOptions, fileNames, runMode, tsNodeState };
}
function transformer(program, pluginConfig, transformerExtras, 
/** Supply if manually transforming with compiler API via 'transformNodes' / 'transformModule' */
manualTransformOptions) {
    return (transformationContext) => {
        // prettier-ignore
        const { tsInstance, compilerOptions, fileNames, runMode, tsNodeState } = getTsProperties([program, pluginConfig, transformerExtras, manualTransformOptions]);
        const rootDirs = compilerOptions.rootDirs?.filter(node_path_1.default.isAbsolute);
        const config = pluginConfig ?? {};
        const getCanonicalFileName = tsInstance.createGetCanonicalFileName(tsInstance.sys.useCaseSensitiveFileNames);
        /* Add supplements for various run modes */
        let emitHost = transformationContext.getEmitHost();
        if (!emitHost || tsNodeState === types_1.TsNodeState.Stripped) {
            if (!fileNames)
                throw new Error(`No EmitHost found and could not determine files to be processed. Please file an issue with a reproduction!`);
            emitHost = (0, ts_helpers_1.createSyntheticEmitHost)(compilerOptions, tsInstance, getCanonicalFileName, fileNames);
        }
        /* Create Visitor Context */
        const { configFile, paths } = compilerOptions;
        const { tryParsePatterns } = tsInstance;
        const [tsVersionMajor, tsVersionMinor] = tsInstance.versionMajorMinor.split(".").map((v) => +v);
        if (tsVersionMajor === undefined || tsVersionMinor === undefined)
            throw new Error("Expected version to be parsed");
        const tsTransformPathsContext = {
            compilerOptions,
            config,
            elisionMap: new Map(),
            tsFactory: transformationContext.factory,
            program,
            rootDirs,
            transformationContext,
            tsInstance,
            tsVersionMajor,
            tsVersionMinor,
            emitHost,
            runMode,
            tsNodeState,
            excludeMatchers: config.exclude?.map((globPattern) => new minimatch_1.Minimatch(globPattern, { matchBase: true })),
            outputFileNamesCache: new Map(),
            // Get paths patterns appropriate for TS compiler version
            pathsPatterns: paths &&
                (tryParsePatterns
                    ? configFile?.configFileSpecs?.pathPatterns || tryParsePatterns(paths)
                    : tsInstance.getOwnKeys(paths)),
        };
        return (sourceFile) => {
            const visitorContext = {
                ...tsTransformPathsContext,
                sourceFile,
                isDeclarationFile: sourceFile.isDeclarationFile,
                originalSourceFile: typescript_1.default.getParseTreeNode(sourceFile, typescript_1.default.isSourceFile) || sourceFile,
                getVisitor() {
                    return visitor_1.nodeVisitor.bind(this);
                },
                factory: (0, harmony_1.createHarmonyFactory)(tsTransformPathsContext),
            };
            return tsInstance.visitEachChild(sourceFile, visitorContext.getVisitor(), transformationContext);
        };
    };
}
//# sourceMappingURL=transformer.js.map