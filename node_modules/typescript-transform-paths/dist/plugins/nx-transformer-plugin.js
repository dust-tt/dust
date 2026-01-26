"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.afterDeclarations = exports.before = void 0;
const transformer_1 = __importDefault(require("../transformer"));
/* ****************************************************************************************************************** *
 * Locals
 * ****************************************************************************************************************** */
const voidTransformer = () => (s) => s;
/* ****************************************************************************************************************** *
 * Transformer
 * ****************************************************************************************************************** */
const before = (pluginConfig, program) => pluginConfig?.afterDeclarations ? voidTransformer : (0, transformer_1.default)(program, { ...pluginConfig });
exports.before = before;
const afterDeclarations = (pluginConfig, program) => pluginConfig?.afterDeclarations ? (0, transformer_1.default)(program, { ...pluginConfig }) : voidTransformer;
exports.afterDeclarations = afterDeclarations;
//# sourceMappingURL=nx-transformer-plugin.js.map