"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
let tsNode;
try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    tsNode = require("ts-node");
}
catch {
    throw new Error(`Cannot resolve ts-node. Make sure ts-node is installed before using typescript-transform-paths/register`);
}
tsNode.register();
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("./").register();
//# sourceMappingURL=register-entry.js.map