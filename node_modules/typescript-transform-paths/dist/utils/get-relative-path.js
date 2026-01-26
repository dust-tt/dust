"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMatchPortion = getMatchPortion;
exports.getRelativePath = getRelativePath;
const node_fs_1 = __importDefault(require("node:fs"));
const os = __importStar(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
/* ****************************************************************************************************************** */
// region: Locals
/* ****************************************************************************************************************** */
let isCaseSensitiveFilesystem;
// endregion
/* ****************************************************************************************************************** */
// region: Helpers
/* ****************************************************************************************************************** */
function tryRmFile(fileName) {
    try {
        if (node_fs_1.default.existsSync(fileName))
            node_fs_1.default.rmSync(fileName, { force: true });
    }
    catch { }
}
function getIsFsCaseSensitive() {
    if (isCaseSensitiveFilesystem != undefined)
        return isCaseSensitiveFilesystem;
    for (let i = 0; i < 1000; i++) {
        const tmpFileName = node_path_1.default.join(os.tmpdir(), `tstp~${i}.tmp`);
        tryRmFile(tmpFileName);
        try {
            node_fs_1.default.writeFileSync(tmpFileName, "");
            isCaseSensitiveFilesystem = !node_fs_1.default.existsSync(tmpFileName.replace("tstp", "TSTP"));
            return isCaseSensitiveFilesystem;
        }
        catch {
        }
        finally {
            tryRmFile(tmpFileName);
        }
    }
    console.warn(`Could not determine filesystem's case sensitivity. Please file a bug report with your system's details`);
    isCaseSensitiveFilesystem = false;
    return isCaseSensitiveFilesystem;
}
/** @private The Export is only for unit tests */
function getMatchPortion(from, to) {
    const lowerFrom = from.toLocaleLowerCase();
    const lowerTo = to.toLocaleLowerCase();
    const maxLen = Math.max(lowerFrom.length, lowerTo.length);
    let i = 0;
    while (i < maxLen) {
        if (lowerFrom[i] !== lowerTo[i])
            break;
        i++;
    }
    return to.slice(0, i);
}
// endregion
/* ****************************************************************************************************************** */
// region: Utils
/* ****************************************************************************************************************** */
function getRelativePath(from, to) {
    try {
        from = node_fs_1.default.realpathSync.native(from);
        to = node_fs_1.default.realpathSync.native(to);
    }
    catch {
        if (!getIsFsCaseSensitive()) {
            const matchPortion = getMatchPortion(from, to);
            from = matchPortion + from.slice(matchPortion.length);
            to = matchPortion + to.slice(matchPortion.length);
        }
    }
    return node_path_1.default.relative(from, to);
}
// endregion
//# sourceMappingURL=get-relative-path.js.map