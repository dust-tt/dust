"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.predicate = void 0;
exports.handler = handler;
exports.downSample = downSample;
// endregion
/* ****************************************************************************************************************** */
// region: Utils
/* ****************************************************************************************************************** */
const predicate = (context) => context.tsVersionMajor < 4;
exports.predicate = predicate;
function handler(context, prop) {
    const ts = context.tsInstance;
    switch (prop) {
        case "updateCallExpression": {
            // @ts-expect-error TS(7019) FIXME: Rest parameter 'args' implicitly has an 'any[]' type.
            return (...args) => ts.updateCall.apply(void 0, args);
        }
        case "updateImportClause": {
            return function (node, _isTypeOnly, name, namedBindings) {
                // @ts-expect-error TODO investigate type issue
                return ts.updateImportClause.apply(void 0, downSample(node, name, namedBindings));
            };
        }
        case "updateImportDeclaration": {
            return function (node, _modifiers, importClause, moduleSpecifier) {
                const [dsNode, dsImportClause, dsModuleSpecifier] = downSample(node, importClause, moduleSpecifier);
                return ts.updateImportDeclaration(dsNode, dsNode.decorators, dsNode.modifiers, dsImportClause, dsModuleSpecifier);
            };
        }
        case "updateExportDeclaration": {
            return function (node, _modifiers, _isTypeOnly, exportClause, moduleSpecifier) {
                const [dsNode, dsModuleSpecifier, dsExportClause] = downSample(node, moduleSpecifier, exportClause);
                return ts.updateExportDeclaration(dsNode, dsNode.decorators, dsNode.modifiers, dsExportClause, dsModuleSpecifier, dsNode.isTypeOnly);
            };
        }
        case "updateModuleDeclaration": {
            return function (node, _modifiers, name, body) {
                const [dsNode, dsName, dsBody] = downSample(node, name, body);
                return ts.updateModuleDeclaration(dsNode, dsNode.decorators, dsNode.modifiers, dsName, dsBody);
            };
        }
        case "updateImportTypeNode": {
            return function (node, argument, _assertions, qualifier, typeArguments, isTypeOf) {
                const [dsNode, dsArgument, dsQualifier, dsTypeArguments] = downSample(node, argument, qualifier, typeArguments);
                return ts.updateImportTypeNode(dsNode, dsArgument, dsQualifier, dsTypeArguments, isTypeOf);
            };
        }
        default: {
            // @ts-expect-error TS(7019) FIXME: Rest parameter 'args' implicitly has an 'any[]' type.
            return (...args) => ts[prop](...args);
        }
    }
}
function downSample(...args) {
    // @ts-expect-error TS(2322) FIXME: Type 'T' is not assignable to type 'DownSampleTsTypes<TypeMap, T>'.
    return args;
}
// endregion
//# sourceMappingURL=three-eight.js.map