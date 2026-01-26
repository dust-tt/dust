"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = exports.nxTransformerPlugin = exports.register = void 0;
var register_1 = require("./register");
Object.defineProperty(exports, "register", { enumerable: true, get: function () { return register_1.register; } });
var plugins_1 = require("./plugins");
Object.defineProperty(exports, "nxTransformerPlugin", { enumerable: true, get: function () { return plugins_1.nxTransformerPlugin; } });
var transformer_1 = require("./transformer");
Object.defineProperty(exports, "default", { enumerable: true, get: function () { return __importDefault(transformer_1).default; } });
//# sourceMappingURL=index.js.map