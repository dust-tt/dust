"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvePathAndUpdateNode = resolvePathAndUpdateNode;
const general_utils_1 = require("./general-utils");
const ts_helpers_1 = require("./ts-helpers");
const resolve_module_name_1 = require("./resolve-module-name");
/** Gets proper path and calls updaterFn to get the new node if it should be updated */
function resolvePathAndUpdateNode(context, node, moduleName, updaterFn) {
    const { sourceFile, tsInstance, factory } = context;
    const { normalizePath } = tsInstance;
    /* Handle JSDoc statement tags */
    const tags = getStatementTags();
    // Skip if @no-transform-path specified
    if (tags.shouldSkip)
        return node;
    // Accommodate direct override via @transform-path tag
    if (tags.overridePath) {
        const transformedPath = (0, general_utils_1.isURL)(tags.overridePath)
            ? tags.overridePath
            : (0, general_utils_1.maybeAddRelativeLocalPrefix)(normalizePath(tags.overridePath));
        return updaterFn(factory.createStringLiteral(transformedPath));
    }
    /* Resolve Module */
    // Skip if no paths match found
    if (!(0, ts_helpers_1.isModulePathsMatch)(context, moduleName))
        return node;
    const res = (0, resolve_module_name_1.resolveModuleName)(context, moduleName);
    if (!res)
        return node;
    const { outputPath, resolvedPath } = res;
    /* Skip if matches exclusion */
    if (context.excludeMatchers)
        for (const matcher of context.excludeMatchers)
            if (matcher.match(outputPath) || (resolvedPath && matcher.match(resolvedPath)))
                return node;
    return updaterFn(factory.createStringLiteral(outputPath));
    /* ********************************************************* *
     * Helpers
     * ********************************************************* */
    function getStatementTags() {
        let targetNode = tsInstance.isStatement(node)
            ? node
            : (tsInstance.findAncestor(node, tsInstance.isStatement) ?? node);
        targetNode = tsInstance.getOriginalNode(targetNode);
        let jsDocTags;
        try {
            jsDocTags = tsInstance.getJSDocTags(targetNode);
        }
        catch { }
        const commentTags = new Map();
        if (targetNode.pos >= 0) {
            try {
                const trivia = targetNode.getFullText(sourceFile).slice(0, targetNode.getLeadingTriviaWidth(sourceFile));
                const regex = /^\s*\/{2,3}\s*@(transform-path|no-transform-path)(?:[^\S\n\r](.+?))?$/gim;
                for (let match = regex.exec(trivia); match; match = regex.exec(trivia))
                    if (match[1])
                        commentTags.set(match[1], match[2]);
            }
            catch { }
        }
        const overridePath = findTag("transform-path");
        const shouldSkip = findTag("no-transform-path");
        return {
            overridePath: typeof overridePath === "string" ? overridePath : void 0,
            shouldSkip: !!shouldSkip,
        };
        function findTag(expected) {
            if (commentTags.has(expected))
                return commentTags.get(expected) || true;
            if (!jsDocTags?.length)
                return undefined;
            for (const tag of jsDocTags) {
                const tagName = tag.tagName.text.toLowerCase();
                if (tagName === expected)
                    return typeof tag.comment === "string" ? tag.comment : true;
                /* The following handles older TS which splits tags at first hyphens */
                if (typeof tag.comment !== "string" || tag.comment[0] !== "-")
                    continue;
                const dashPos = expected.indexOf("-");
                if (dashPos < 0)
                    return void 0;
                if (tagName === expected.slice(0, dashPos)) {
                    const comment = tag.comment;
                    const choppedCommentTagName = comment.slice(0, expected.length - dashPos);
                    return choppedCommentTagName === expected.slice(dashPos)
                        ? comment.slice(choppedCommentTagName.length + 1).trim() || true
                        : void 0;
                }
            }
            return undefined;
        }
    }
}
//# sourceMappingURL=resolve-path-update-node.js.map