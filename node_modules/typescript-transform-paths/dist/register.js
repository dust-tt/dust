"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mergeTransformers = mergeTransformers;
exports.register = register;
const transformer_1 = __importDefault(require("./transformer"));
function getProjectTransformerConfig(pcl) {
    const plugins = pcl.options.plugins;
    if (!plugins)
        return;
    const res = {};
    for (const plugin of plugins) {
        if (plugin.transform === "typescript-transform-paths" && !plugin.after)
            res[plugin.afterDeclarations ? "afterDeclarations" : "before"] = plugin;
    }
    return res;
}
function getTransformers(program, beforeConfig, afterDeclarationsConfig) {
    return {
        ...(beforeConfig && { before: [(0, transformer_1.default)(program, beforeConfig)] }),
        ...(afterDeclarationsConfig && { afterDeclarations: [(0, transformer_1.default)(program, afterDeclarationsConfig)] }),
    };
}
function mergeTransformers(baseTransformers, transformers) {
    const res = {
        ...((baseTransformers.before || transformers.before) && {
            before: [...(transformers.before ?? []), ...(baseTransformers.before ?? [])],
        }),
        ...((baseTransformers.afterDeclarations || transformers.afterDeclarations) && {
            afterDeclarations: [...(transformers.afterDeclarations ?? []), ...(baseTransformers.afterDeclarations ?? [])],
        }),
    };
    const remainingBaseTransformers = { ...baseTransformers };
    delete remainingBaseTransformers.before;
    delete remainingBaseTransformers.afterDeclarations;
    return Object.assign(res, remainingBaseTransformers);
}
// endregion
/* ****************************************************************************************************************** */
// region: TsNode Registration Utility
/* ****************************************************************************************************************** */
function register() {
    const { tsNodeInstance, tsNode } = register.initialize();
    const transformerConfig = getProjectTransformerConfig(tsNodeInstance.config);
    if (!transformerConfig)
        return;
    const { before: beforeConfig, afterDeclarations: afterDeclarationsConfig } = transformerConfig;
    const registerOptions = Object.assign({}, tsNodeInstance.options);
    if (registerOptions.transformers) {
        if (typeof registerOptions.transformers === "function") {
            const oldTransformersFactory = registerOptions.transformers;
            registerOptions.transformers = (program) => {
                const transformers = getTransformers(program, beforeConfig, afterDeclarationsConfig);
                const baseTransformers = oldTransformersFactory(program);
                return mergeTransformers(baseTransformers, transformers);
            };
        }
        else {
            registerOptions.transformers = mergeTransformers(registerOptions.transformers, getTransformers(undefined, beforeConfig, afterDeclarationsConfig));
        }
    }
    else {
        registerOptions.transformers = getTransformers(undefined, beforeConfig, afterDeclarationsConfig);
    }
    // Re-register with new transformers
    tsNode.register(registerOptions);
    return registerOptions;
}
register.initialize = function initialize() {
    let tsNode;
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        tsNode = require("ts-node");
    }
    catch {
        throw new Error(`Cannot resolve ts-node. Make sure ts-node is installed before using typescript-transform-paths/register`);
    }
    const instanceSymbol = tsNode["REGISTER_INSTANCE"];
    let tsNodeInstance = global.process[instanceSymbol];
    if (!tsNodeInstance) {
        tsNode.register(); // Register initially
        tsNodeInstance = global.process[instanceSymbol];
    }
    if (!tsNodeInstance)
        throw new Error(`Could not register ts-node instance!`);
    return { tsNode, instanceSymbol, tsNodeInstance };
};
exports.default = register;
// endregion
//# sourceMappingURL=register.js.map