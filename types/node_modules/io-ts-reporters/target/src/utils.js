"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.takeUntil = void 0;
/**
 * @since 1.1.0
 */
/* eslint-disable @typescript-eslint/array-type */
var takeUntil = function (predicate) {
    return function (as) {
        var init = [];
        // eslint-disable-next-line unicorn/no-for-loop
        for (var i = 0; i < as.length; i++) {
            init[i] = as[i];
            if (predicate(as[i])) {
                return init;
            }
        }
        return init;
    };
};
exports.takeUntil = takeUntil;
/* eslint-enable @typescript-eslint/array-type */
//# sourceMappingURL=utils.js.map