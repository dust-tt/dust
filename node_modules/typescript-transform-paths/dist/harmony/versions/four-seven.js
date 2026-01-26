"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.predicate = void 0;
exports.handler = handler;
exports.downSample = downSample;
// endregion
/* ****************************************************************************************************************** */
// region: Utils
/* ****************************************************************************************************************** */
const predicate = ({ tsVersionMajor, tsVersionMinor }) => tsVersionMajor == 4 && tsVersionMinor < 8;
exports.predicate = predicate;
function handler(context, prop) {
    const factory = context.tsFactory;
    switch (prop) {
        case "updateImportDeclaration": {
            return function (node, _modifiers, importClause, moduleSpecifier, assertClause) {
                const [dsNode, dsImportClause, dsModuleSpecifier, dsAssertClause] = downSample(node, importClause, moduleSpecifier, assertClause);
                return factory.updateImportDeclaration(dsNode, dsNode.decorators, dsNode.modifiers, dsImportClause, dsModuleSpecifier, dsAssertClause);
            };
        }
        case "updateExportDeclaration": {
            return function (node, _modifiers, isTypeOnly, exportClause, moduleSpecifier, assertClause) {
                const [dsNode, dsExportClause, dsModuleSpecifier, dsAssertClause] = downSample(node, exportClause, moduleSpecifier, assertClause);
                return factory.updateExportDeclaration(dsNode, dsNode.decorators, dsNode.modifiers, isTypeOnly, dsExportClause, dsModuleSpecifier, dsAssertClause);
            };
        }
        case "updateModuleDeclaration": {
            return function (node, _modifiers, name, body) {
                const [dsNode, dsName, dsBody] = downSample(node, name, body);
                return factory.updateModuleDeclaration(dsNode, dsNode.decorators, dsNode.modifiers, dsName, dsBody);
            };
        }
        default: {
            // @ts-expect-error TS(7019) FIXME: Rest parameter 'args' implicitly has an 'any[]' type.
            return (...args) => factory[prop](...args);
        }
    }
}
function downSample(...args) {
    // @ts-expect-error TS(2322) FIXME: Type 'T' is not assignable to type 'DownSampleTsTypes<TypeMap, T>'.
    return args;
}
// endregion
//# sourceMappingURL=four-seven.js.map