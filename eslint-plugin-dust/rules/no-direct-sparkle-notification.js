"use strict";

module.exports = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "discourage direct import of useSendNotification from @dust-tt/sparkle",
    },
    schema: [],
    fixable: "code",
  },

  create: function (context) {
    return {
      ImportDeclaration(node) {
        // Check if importing from @dust-tt/sparkle
        if (node.source.value === "@dust-tt/sparkle") {
          // Check if useSendNotification is being imported
          const useSendNotificationSpecifier = node.specifiers.find(
            (specifier) =>
              specifier.type === "ImportSpecifier" &&
              specifier.imported.name === "useSendNotification"
          );

          if (useSendNotificationSpecifier) {
            context.report({
              node: useSendNotificationSpecifier,
              message:
                "Avoid importing useSendNotification from @dust-tt/sparkle. Use 'import { useSendNotification } from \"@app/hooks/useNotification\"' instead for better logging and monitoring.",
              fix(fixer) {
                // If this is the only import, replace the entire import
                if (node.specifiers.length === 1) {
                  return fixer.replaceText(
                    node,
                    'import { useSendNotification } from "@app/hooks/useNotification";'
                  );
                }

                // If there are multiple imports, just remove this specifier
                // and add a new import line
                const sourceCode = context.getSourceCode();
                const fixes = [];

                // Remove the specifier
                if (node.specifiers.length === 2) {
                  // Find the other specifier
                  const otherSpecifier = node.specifiers.find(
                    (s) => s !== useSendNotificationSpecifier
                  );
                  const comma = sourceCode.getTokenAfter(
                    useSendNotificationSpecifier
                  );
                  if (comma && comma.value === ",") {
                    fixes.push(
                      fixer.removeRange([
                        useSendNotificationSpecifier.range[0],
                        comma.range[1],
                      ])
                    );
                  } else {
                    const comma = sourceCode.getTokenBefore(
                      useSendNotificationSpecifier
                    );
                    if (comma && comma.value === ",") {
                      fixes.push(
                        fixer.removeRange([
                          comma.range[0],
                          useSendNotificationSpecifier.range[1],
                        ])
                      );
                    }
                  }
                } else {
                  // Multiple imports, remove just this one with its comma
                  const nextToken = sourceCode.getTokenAfter(
                    useSendNotificationSpecifier
                  );
                  if (nextToken && nextToken.value === ",") {
                    fixes.push(
                      fixer.removeRange([
                        useSendNotificationSpecifier.range[0],
                        nextToken.range[1],
                      ])
                    );
                  } else {
                    const prevToken = sourceCode.getTokenBefore(
                      useSendNotificationSpecifier
                    );
                    if (prevToken && prevToken.value === ",") {
                      fixes.push(
                        fixer.removeRange([
                          prevToken.range[0],
                          useSendNotificationSpecifier.range[1],
                        ])
                      );
                    }
                  }
                }

                // Add new import line
                fixes.push(
                  fixer.insertTextAfter(
                    node,
                    '\nimport { useSendNotification } from "@app/hooks/useNotification";'
                  )
                );

                return fixes;
              },
            });
          }
        }
      },
    };
  },
};
