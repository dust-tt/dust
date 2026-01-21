"use strict";

/**
 * This rule ensures that getServerSideProps in NextJS page files
 * only returns 'owner' and simple params from context.params.
 *
 * This prevents data fetching with models/resources in page files,
 * which should instead happen client-side via SWR hooks.
 */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Prevent data fetching in getServerSideProps for NextJS pages. Only 'owner' and context params are allowed.",
    },
    schema: [],
  },

  create: function (context) {
    const filename = context.getFilename();

    // Only apply to pages/ files
    if (!filename.includes("pages/")) {
      return {};
    }

    // Allowed prop names that can be returned from getServerSideProps
    const ALLOWED_PROPS = new Set(["owner"]);

    // Patterns that indicate params extracted from context
    // These are typically string params like wId, dsId, triggerId, etc.
    const PARAM_PATTERNS = [
      /^[a-z]+Id$/i, // matches wId, dsId, cId, aId, etc.
      /^templateId$/,
      /^connectorId$/,
      /^triggerId$/,
      /^runId$/,
      /^hash$/,
    ];

    function isAllowedPropName(name) {
      if (ALLOWED_PROPS.has(name)) {
        return true;
      }
      // Check if it matches a param pattern
      return PARAM_PATTERNS.some((pattern) => pattern.test(name));
    }

    // Check if a node is a simple value (string literal, identifier from params, etc.)
    function isSimpleParamValue(node, paramsIdentifiers) {
      if (!node) {
        return false;
      }

      // Direct identifier that was extracted from context.params
      if (node.type === "Identifier" && paramsIdentifiers.has(node.name)) {
        return true;
      }

      // String literal
      if (node.type === "Literal" && typeof node.value === "string") {
        return true;
      }

      // null literal
      if (node.type === "Literal" && node.value === null) {
        return true;
      }

      // auth.getNonNullableWorkspace() call
      if (
        node.type === "CallExpression" &&
        node.callee.type === "MemberExpression" &&
        node.callee.object.type === "Identifier" &&
        node.callee.object.name === "auth" &&
        node.callee.property.name === "getNonNullableWorkspace"
      ) {
        return true;
      }

      // Variable reference to owner
      if (node.type === "Identifier" && node.name === "owner") {
        return true;
      }

      return false;
    }

    return {
      // Look for getServerSideProps export
      ExportNamedDeclaration(node) {
        if (!node.declaration) {
          return;
        }

        const declaration = node.declaration;
        let functionNode = null;

        // Handle: export const getServerSideProps = ...
        if (
          declaration.type === "VariableDeclaration" &&
          declaration.declarations.length > 0
        ) {
          const decl = declaration.declarations[0];
          if (decl.id.name === "getServerSideProps" && decl.init) {
            // Handle withSuperUserAuthRequirements wrapper
            if (
              decl.init.type === "CallExpression" &&
              decl.init.arguments.length > 0
            ) {
              functionNode = decl.init.arguments[0];
            } else {
              functionNode = decl.init;
            }
          }
        }

        if (!functionNode) {
          return;
        }

        // Collect identifiers that were extracted from context.params
        const paramsIdentifiers = new Set();

        // Find params extraction patterns in the function body
        if (
          functionNode.body &&
          functionNode.body.type === "BlockStatement"
        ) {
          for (const statement of functionNode.body.body) {
            // Look for: const { wId, dsId } = context.params ?? {};
            if (
              statement.type === "VariableDeclaration" &&
              statement.declarations.length > 0
            ) {
              const varDecl = statement.declarations[0];
              if (
                varDecl.id.type === "ObjectPattern" &&
                varDecl.init
              ) {
                // Check if it's from context.params
                const init = varDecl.init;
                let isFromParams = false;

                // context.params
                if (
                  init.type === "MemberExpression" &&
                  init.object.name === "context" &&
                  init.property.name === "params"
                ) {
                  isFromParams = true;
                }

                // context.params ?? {}
                if (
                  init.type === "LogicalExpression" &&
                  init.operator === "??" &&
                  init.left.type === "MemberExpression" &&
                  init.left.object.name === "context" &&
                  init.left.property.name === "params"
                ) {
                  isFromParams = true;
                }

                if (isFromParams) {
                  for (const prop of varDecl.id.properties) {
                    if (prop.key && prop.key.name) {
                      paramsIdentifiers.add(prop.key.name);
                    }
                  }
                }
              }
            }
          }
        }

        // Find return statements with props
        function checkReturnStatement(returnNode) {
          if (!returnNode.argument) {
            return;
          }

          const returnArg = returnNode.argument;

          // Looking for: return { props: { ... } }
          if (returnArg.type !== "ObjectExpression") {
            return;
          }

          const propsProperty = returnArg.properties.find(
            (p) =>
              p.type === "Property" &&
              p.key.name === "props" &&
              p.value.type === "ObjectExpression"
          );

          if (!propsProperty) {
            return;
          }

          const propsObject = propsProperty.value;

          for (const prop of propsObject.properties) {
            if (prop.type !== "Property") {
              continue;
            }

            const propName = prop.key.name || prop.key.value;

            // Check if the prop name is allowed
            if (!isAllowedPropName(propName)) {
              context.report({
                node: prop,
                message: `NextJS pages should not return '${propName}' from getServerSideProps. Only 'owner' and params from context.params are allowed. Fetch data client-side using SWR hooks instead.`,
              });
              continue;
            }

            // Check if the value is a simple param or owner
            if (!isSimpleParamValue(prop.value, paramsIdentifiers)) {
              // Allow shorthand properties where name matches a param
              if (
                prop.shorthand &&
                paramsIdentifiers.has(propName)
              ) {
                continue;
              }
              if (prop.shorthand && propName === "owner") {
                continue;
              }

              context.report({
                node: prop,
                message: `NextJS pages should not fetch data in getServerSideProps. The value for '${propName}' appears to be fetched data. Use SWR hooks client-side instead.`,
              });
            }
          }
        }

        // Traverse the function to find return statements
        function traverseForReturns(node) {
          if (!node) {
            return;
          }

          if (node.type === "ReturnStatement") {
            checkReturnStatement(node);
            return;
          }

          // Traverse child nodes
          for (const key in node) {
            if (key === "parent") {
              continue;
            }
            const child = node[key];
            if (child && typeof child === "object") {
              if (Array.isArray(child)) {
                for (const item of child) {
                  if (item && typeof item === "object" && item.type) {
                    traverseForReturns(item);
                  }
                }
              } else if (child.type) {
                traverseForReturns(child);
              }
            }
          }
        }

        if (functionNode.body) {
          traverseForReturns(functionNode.body);
        }
      },
    };
  },
};
