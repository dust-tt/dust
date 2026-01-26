"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.elideImportOrExportDeclaration = elideImportOrExportDeclaration;
const typescript_1 = require("typescript");
function elideImportOrExportDeclaration(context, node, newModuleSpecifier, resolver) {
    const { tsInstance, factory } = context;
    const { compilerOptions } = context;
    const { visitNode, isNamedImportBindings, isImportSpecifier, SyntaxKind, visitNodes, isNamedExportBindings, 
    // 3.8 does not have this, so we have to define it ourselves
    // isNamespaceExport,
    isIdentifier, isExportSpecifier, } = tsInstance;
    const isNamespaceExport = tsInstance.isNamespaceExport ?? ((node) => node.kind === SyntaxKind.NamespaceExport);
    if (tsInstance.isImportDeclaration(node)) {
        // Do not elide a side-effect only import declaration.
        //  import "foo";
        if (!node.importClause)
            return node.importClause;
        // Always elide type-only imports
        if (node.importClause.isTypeOnly)
            return undefined;
        const importClause = visitNode(node.importClause, visitImportClause);
        if (importClause ||
            compilerOptions.importsNotUsedAsValues === typescript_1.ImportsNotUsedAsValues.Preserve ||
            compilerOptions.importsNotUsedAsValues === typescript_1.ImportsNotUsedAsValues.Error)
            return factory.updateImportDeclaration(node, 
            /*modifiers*/ undefined, importClause, newModuleSpecifier, 
            // This will be changed in the next release of TypeScript, but by that point we can drop elision entirely
            // @ts-expect-error TS(2339) FIXME: Property 'attributes' does not exist on type 'ImportDeclaration'.
            node.attributes || node.assertClause);
        else
            return undefined;
    }
    else {
        if (node.isTypeOnly)
            return undefined;
        if (!node.exportClause || node.exportClause.kind === SyntaxKind.NamespaceExport) {
            // never elide `export <whatever> from <whereever>` declarations -
            // they should be kept for sideffects/untyped exports, even when the
            // type checker doesn't know about any exports
            return node;
        }
        const allowEmpty = !!compilerOptions["verbatimModuleSyntax"] ||
            (!!node.moduleSpecifier &&
                (compilerOptions.importsNotUsedAsValues === typescript_1.ImportsNotUsedAsValues.Preserve ||
                    compilerOptions.importsNotUsedAsValues === typescript_1.ImportsNotUsedAsValues.Error));
        const exportClause = visitNode(node.exportClause, ((bindings) => visitNamedExportBindings(bindings, allowEmpty)), isNamedExportBindings);
        return exportClause
            ? factory.updateExportDeclaration(node, 
            /*modifiers*/ undefined, node.isTypeOnly, exportClause, newModuleSpecifier, 
            // This will be changed in the next release of TypeScript, but by that point we can drop elision entirely
            // @ts-expect-error TS(2339) FIXME: Property 'attributes' does not exist on type 'ExportDeclaration'.
            node.attributes || node.assertClause)
            : undefined;
    }
    /* ********************************************************* *
     * Helpers
     * ********************************************************* */
    // The following visitors are adapted from the TS source-base src/compiler/transformers/ts
    /**
     * Visits an import clause, eliding it if it is not referenced.
     *
     * @param node The import clause node.
     */
    function visitImportClause(node) {
        // Elide the import clause if we elide both its name and its named bindings.
        const name = shouldEmitAliasDeclaration(node) ? node.name : undefined;
        const namedBindings = visitNode(node.namedBindings, visitNamedImportBindings, isNamedImportBindings);
        return name || namedBindings
            ? factory.updateImportClause(node, /*isTypeOnly*/ false, name, namedBindings)
            : undefined;
    }
    /**
     * Visits named import bindings, eliding it if it is not referenced.
     *
     * @param node The named import bindings node.
     */
    function visitNamedImportBindings(node) {
        if (node.kind === SyntaxKind.NamespaceImport) {
            // Elide a namespace import if it is not referenced.
            return shouldEmitAliasDeclaration(node) ? node : undefined;
        }
        else {
            // Elide named imports if all of its import specifiers are elided.
            const allowEmpty = compilerOptions["verbatimModuleSyntax"] ||
                (compilerOptions.preserveValueImports &&
                    (compilerOptions.importsNotUsedAsValues === typescript_1.ImportsNotUsedAsValues.Preserve ||
                        compilerOptions.importsNotUsedAsValues === typescript_1.ImportsNotUsedAsValues.Error));
            const elements = visitNodes(node.elements, visitImportSpecifier, isImportSpecifier);
            return allowEmpty || tsInstance.some(elements) ? factory.updateNamedImports(node, elements) : undefined;
        }
    }
    /**
     * Visits an import specifier, eliding it if it is not referenced.
     *
     * @param node The import specifier node.
     */
    function visitImportSpecifier(node) {
        // Elide an import specifier if it is not referenced.
        return !node.isTypeOnly && shouldEmitAliasDeclaration(node) ? node : undefined;
    }
    /** Visits named exports, eliding it if it does not contain an export specifier that resolves to a value. */
    function visitNamedExports(node, allowEmpty) {
        // Elide the named exports if all of its export specifiers were elided.
        const elements = visitNodes(node.elements, visitExportSpecifier, isExportSpecifier);
        return allowEmpty || tsInstance.some(elements) ? factory.updateNamedExports(node, elements) : undefined;
    }
    function visitNamedExportBindings(node, allowEmpty) {
        return isNamespaceExport(node) ? visitNamespaceExports(node) : visitNamedExports(node, allowEmpty);
    }
    function visitNamespaceExports(node) {
        // Note: This may not work entirely properly, more likely it's just extraneous, but this won't matter soon,
        // as we'll be removing elision entirely
        return factory.updateNamespaceExport(node, typescript_1.Debug.checkDefined(visitNode(node.name, (n) => n, isIdentifier)));
    }
    /**
     * Visits an export specifier, eliding it if it does not resolve to a value.
     *
     * @param node The export specifier node.
     */
    function visitExportSpecifier(node) {
        // Elide an export specifier if it does not reference a value.
        return !node.isTypeOnly && (compilerOptions["verbatimModuleSyntax"] || resolver.isValueAliasDeclaration(node))
            ? node
            : undefined;
    }
    function shouldEmitAliasDeclaration(node) {
        return (!!compilerOptions["verbatimModuleSyntax"] ||
            (0, typescript_1.isInJSFile)(node) ||
            (compilerOptions.preserveValueImports
                ? resolver.isValueAliasDeclaration(node)
                : resolver.isReferencedAliasDeclaration(node)));
    }
}
// endregion
//# sourceMappingURL=elide-import-export.js.map