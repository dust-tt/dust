"use strict";

/**
 * This rule prevents direct imports from "next" or "next/*" packages
 * in shared code directories (components, hooks, lib).
 *
 * This enforces the platform abstraction layer, allowing code to be
 * shared between NextJS and other platforms (e.g., Vite SPA).
 */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Prevent direct imports from 'next' or 'next/*' in shared code directories. Use platform abstractions instead.",
    },
    schema: [],
  },

  create: function (context) {
    return {
      ImportDeclaration(node) {
        const source = node.source.value;

        // Check for "next" or "next/*" imports
        if (source === "next" || source.startsWith("next/")) {
          context.report({
            node,
            message: `Direct import from '${source}' is not allowed in shared code. Use platform abstractions from '@app/lib/platform' instead.`,
          });
        }
      },
    };
  },
};
