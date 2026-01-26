"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createHarmonyFactory = createHarmonyFactory;
const versions_1 = require("./versions");
// endregion
/* ****************************************************************************************************************** */
// region: Utilities
/* ****************************************************************************************************************** */
/** Creates a node factory compatible with TS v3+ */
function createHarmonyFactory(context) {
    return new Proxy(context.tsFactory ?? context.tsInstance, {
        get(target, prop) {
            if (versions_1.TsThreeEight.predicate(context)) {
                return versions_1.TsThreeEight.handler(context, prop);
            }
            else if (versions_1.TsFourSeven.predicate(context)) {
                return versions_1.TsFourSeven.handler(context, prop);
            }
            else {
                // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expression of type 'string | symbol' can't be used to index type 'typeof import("typescript") | NodeFactory'.
                return target[prop];
            }
        },
    });
}
// endregion
//# sourceMappingURL=harmony-factory.js.map