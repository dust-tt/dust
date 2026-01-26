"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nodeVisitor = nodeVisitor;
const utils_1 = require("./utils");
const isAsyncImport = ({ tsInstance }, node) => tsInstance.isCallExpression(node) &&
    node.expression.kind === tsInstance.SyntaxKind.ImportKeyword &&
    !!node.arguments[0] &&
    tsInstance.isStringLiteral(node.arguments[0]) &&
    node.arguments.length === 1;
const isRequire = ({ tsInstance }, node) => tsInstance.isCallExpression(node) &&
    tsInstance.isIdentifier(node.expression) &&
    node.expression.text === "require" &&
    !!node.arguments[0] &&
    tsInstance.isStringLiteral(node.arguments[0]) &&
    node.arguments.length === 1;
/** Visit and replace nodes with module specifiers */
function nodeVisitor(node) {
    const { factory, tsInstance, transformationContext } = this;
    /**
     * Update require / import functions
     *
     * @example
     *   require("module");
     *   import("module");
     */
    if (isRequire(this, node) || isAsyncImport(this, node))
        return (0, utils_1.resolvePathAndUpdateNode)(this, node, node.arguments[0].text, (p) => {
            const res = factory.updateCallExpression(node, node.expression, node.typeArguments, [p]);
            /* Handle comments */
            const textNode = node.arguments[0];
            if (!textNode)
                throw new Error("Expected textNode");
            const commentRanges = tsInstance.getLeadingCommentRanges(textNode.getFullText(), 0) ?? [];
            for (const range of commentRanges) {
                const { kind, pos, end, hasTrailingNewLine } = range;
                const caption = textNode
                    .getFullText()
                    .substring(pos, end)
                    .replace(
                /* searchValue */ kind === tsInstance.SyntaxKind.MultiLineCommentTrivia
                    ? // Comment range in a multi-line comment with more than one line erroneously
                        // includes the node's text in the range. For that reason, we use the greedy
                        // selector in capture group and dismiss anything after the final comment close tag
                        /^\/\*(.+)\*\/.*/s
                    : /^\/\/(.+)/s, 
                /* replaceValue */ "$1");
                tsInstance.addSyntheticLeadingComment(p, kind, caption, hasTrailingNewLine);
            }
            return res;
        });
    /**
     * Update ExternalModuleReference
     *
     * @example
     *   import foo = require("foo");
     */
    if (tsInstance.isExternalModuleReference(node) && tsInstance.isStringLiteral(node.expression))
        return (0, utils_1.resolvePathAndUpdateNode)(this, node, node.expression.text, (p) => factory.updateExternalModuleReference(node, p));
    /**
     * Update ImportTypeNode
     *
     * @example
     *   typeof import("./bar");
     *   import("package").MyType;
     */
    if (tsInstance.isImportTypeNode(node)) {
        const argument = node.argument;
        if (!tsInstance.isStringLiteral(argument.literal))
            return node;
        const { text } = argument.literal;
        if (!text)
            return node;
        const res = (0, utils_1.resolvePathAndUpdateNode)(this, node, text, (p) => factory.updateImportTypeNode(node, factory.updateLiteralTypeNode(argument, p), node.assertions, node.qualifier, node.typeArguments, node.isTypeOf));
        return tsInstance.visitEachChild(res, this.getVisitor(), transformationContext);
    }
    /**
     * Update ImportDeclaration
     *
     * @example
     *   import ... 'module';
     */
    if (tsInstance.isImportDeclaration(node) && node.moduleSpecifier && tsInstance.isStringLiteral(node.moduleSpecifier))
        return (0, utils_1.resolvePathAndUpdateNode)(this, node, node.moduleSpecifier.text, (p) => {
            // TODO - In next major version, we can remove this entirely due to TS PR 57223
            //   see: https://github.com/microsoft/TypeScript/pull/57223
            //   We should at least skip this if doing a minor version update if the ts version is high enough to not need it
            if (!this.isDeclarationFile && node.importClause?.namedBindings) {
                const resolver = transformationContext.getEmitResolver();
                // If run in "manual" mode without a Program, we won't have a resolver, so we can't elide
                if (resolver)
                    return (0, utils_1.elideImportOrExportDeclaration)(this, node, p, resolver);
            }
            return factory.updateImportDeclaration(node, node.modifiers, node.importClause, p, node.assertClause);
        });
    /**
     * Update ExportDeclaration
     *
     * @example
     *   export ... 'module';
     */
    if (tsInstance.isExportDeclaration(node) && node.moduleSpecifier && tsInstance.isStringLiteral(node.moduleSpecifier))
        return (0, utils_1.resolvePathAndUpdateNode)(this, node, node.moduleSpecifier.text, (p) => {
            // TODO - In next major version, we can remove this entirely due to TS PR 57223
            //   see: https://github.com/microsoft/TypeScript/pull/57223
            //   We should at least skip this if doing a minor version update if the ts version is high enough to not need it
            if (!this.isDeclarationFile && node.exportClause && tsInstance.isNamedExports(node.exportClause)) {
                const resolver = transformationContext.getEmitResolver();
                // If run in "manual" mode without a Program, we won't have a resolver, so we can't elide
                if (resolver)
                    return (0, utils_1.elideImportOrExportDeclaration)(this, node, p, resolver);
            }
            return factory.updateExportDeclaration(node, node.modifiers, node.isTypeOnly, node.exportClause, p, node.assertClause);
        });
    /** Update module augmentation */
    if (tsInstance.isModuleDeclaration(node) && tsInstance.isStringLiteral(node.name))
        return (0, utils_1.resolvePathAndUpdateNode)(this, node, node.name.text, (p) => factory.updateModuleDeclaration(node, node.modifiers, p, node.body));
    return tsInstance.visitEachChild(node, this.getVisitor(), transformationContext);
}
//# sourceMappingURL=visitor.js.map