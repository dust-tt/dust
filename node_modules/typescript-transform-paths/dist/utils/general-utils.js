"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.maybeAddRelativeLocalPrefix = exports.isBaseDir = exports.isURL = void 0;
const node_url_1 = __importDefault(require("node:url"));
const node_path_1 = __importDefault(require("node:path"));
/* ****************************************************************************************************************** *
 * General Utilities & Helpers
 * ****************************************************************************************************************** */
const isURL = (s) => !!s && (!!node_url_1.default.parse(s).host || !!node_url_1.default.parse(s).hostname);
exports.isURL = isURL;
const isBaseDir = (baseDir, testDir) => {
    const relative = node_path_1.default.relative(baseDir, testDir);
    return relative ? !relative.startsWith("..") && !node_path_1.default.isAbsolute(relative) : true;
};
exports.isBaseDir = isBaseDir;
const maybeAddRelativeLocalPrefix = (p) => (p[0] === "." ? p : `./${p}`);
exports.maybeAddRelativeLocalPrefix = maybeAddRelativeLocalPrefix;
//# sourceMappingURL=general-utils.js.map