"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ThrowReporter = void 0;
var PathReporter_1 = require("./PathReporter");
var Either_1 = require("fp-ts/lib/Either");
/**
 * @category deprecated
 * @since 1.0.0
 * @deprecated
 */
exports.ThrowReporter = {
    report: function (validation) {
        if ((0, Either_1.isLeft)(validation)) {
            throw new Error(PathReporter_1.PathReporter.report(validation).join('\n'));
        }
    }
};
