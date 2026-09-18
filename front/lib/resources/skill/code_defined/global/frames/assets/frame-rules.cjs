const FRAME_FUNCTION_HOOKS = new Set([
  "useFrameFunction",
  "useFrameFunctionMutation",
  "usePodFunction",
  "usePodFunctionMutation",
]);

function getHookCall(identifier, specifier) {
  let callee = identifier;
  let hook = specifier.imported?.name ?? specifier.imported?.value;
  if (specifier.type === "ImportNamespaceSpecifier") {
    callee = identifier.parent;
    if (
      callee.type !== "MemberExpression" ||
      callee.computed ||
      callee.object !== identifier
    ) {
      return null;
    }
    hook = callee.property.name;
  }
  const call = callee.parent;
  if (
    !FRAME_FUNCTION_HOOKS.has(hook) ||
    call.type !== "CallExpression" ||
    call.callee !== callee
  ) {
    return null;
  }
  return { hook, call };
}

module.exports = {
  meta: { name: "dust" },
  rules: {
    "declared-frame-functions": {
      meta: {
        type: "problem",
        schema: [{ type: "array", items: { type: "string" } }],
        messages: {
          undeclared:
            "{{hook}}('{{name}}') calls a function not declared in manifest.json. {{declared}}",
        },
      },
      create(context) {
        const names = context.options[0];
        const declared = new Set(names);
        const summary = names.length
          ? `Declared functions: ${names.map((name) => `'${name}'`).join(", ")}.`
          : "This Frame's manifest declares no functions.";
        return {
          ImportDeclaration: (node) => {
            if (node.source.value !== "@dust/react-hooks") {
              return;
            }
            // Follow imported bindings so a same-named local function is not checked.
            for (const variable of context.sourceCode.getDeclaredVariables(node)) {
              const specifier = variable.defs[0].node;
              for (const { identifier } of variable.references) {
                const hookCall = getHookCall(identifier, specifier);
                if (!hookCall) {
                  continue;
                }
                const argument = hookCall.call.arguments[0];
                let name;
                if (argument?.type === "Literal") {
                  name = argument.value;
                } else if (
                  argument?.type === "TemplateLiteral" &&
                  argument.expressions.length === 0
                ) {
                  name = argument.quasis[0].value.cooked;
                }
                if (typeof name === "string" && !declared.has(name)) {
                  context.report({
                    node: argument,
                    messageId: "undeclared",
                    data: { hook: hookCall.hook, name, declared: summary },
                  });
                }
              }
            }
          },
        };
      },
    },
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
            'File "{{found}}" is inside this Frame package. Use "./{{path}}" so the reference still works when the Frame moves.',
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
