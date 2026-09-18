module.exports = {
  meta: { name: "dust" },
  rules: {
    "relative-package-files": {
      meta: {
        type: "problem",
        schema: [
          {
            type: "object",
            properties: {
              frameRoot: { type: "string" },
              packageFiles: {
                type: "object",
                additionalProperties: { type: "boolean" },
              },
            },
            required: ["frameRoot", "packageFiles"],
            additionalProperties: false,
          },
        ],
        messages: {
          relative:
            'Use "./{{path}}" instead of "{{found}}" so this Frame still works after it moves',
        },
      },
      create(context) {
        const { frameRoot, packageFiles } = context.options[0];
        const prefix = `${frameRoot}/`;
        const check = (node, value) => {
          if (typeof value !== "string" || !value.startsWith(prefix)) {
            return;
          }
          const relativePath = value.slice(prefix.length);
          if (Object.hasOwn(packageFiles, relativePath)) {
            context.report({
              node,
              messageId: "relative",
              data: { path: relativePath, found: value },
            });
          }
        };
        return {
          Literal: (node) => check(node, node.value),
          TemplateLiteral: (node) => {
            if (node.expressions.length === 0) {
              check(node, node.quasis[0].value.cooked);
            }
          },
        };
      },
    },
  },
};
