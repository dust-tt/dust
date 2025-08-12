"use strict";

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow bulk lodash imports in front/components",
      category: "Best Practices",
      recommended: true,
    },
    fixable: "code",
    schema: [],
  },

  create(context) {
    return {
      ImportDeclaration(node) {
        // Only check files in specified paths
        const pathsToCheck = [
          "front/components/",
          "front/lib/client/",
          "front/lib/swr/",
        ];

        const filename = context.getFilename();
        if (!pathsToCheck.some((path) => filename.includes(path))) {
          return;
        }

        if (
          node.source.value === "lodash" &&
          node.specifiers.length > 0 &&
          node.specifiers[0].type === "ImportSpecifier"
        ) {
          const imports = node.specifiers.map((spec) => spec.imported.name);

          context.report({
            node,
            message:
              "Bulk lodash imports are not allowed in this file. Use individual imports instead.",
            fix(fixer) {
              const newImports = imports
                .map((name) => `import ${name} from 'lodash/${name}';`)
                .join("\n");
              return fixer.replaceText(node, newImports);
            },
          });
        }
      },
    };
  },
};
