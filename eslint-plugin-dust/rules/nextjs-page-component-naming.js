"use strict";

/**
 * This rule ensures that NextJS page files follow the page pattern:
 * - The default export must be named xxxNextJS
 * - It should render a component named xxxPage
 */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ensure NextJS page default exports are named xxxNextJS and render xxxPage components.",
    },
    schema: [],
  },

  create: function (context) {
    const filename = context.getFilename();

    // Only apply to pages/ files
    if (!filename.includes("pages/")) {
      return {};
    }

    let defaultExportName = null;
    let defaultExportNode = null;

    return {
      // Track default export: export default function XxxNextJS
      ExportDefaultDeclaration(node) {
        if (node.declaration) {
          if (
            node.declaration.type === "FunctionDeclaration" &&
            node.declaration.id
          ) {
            defaultExportName = node.declaration.id.name;
            defaultExportNode = node;
          } else if (node.declaration.type === "Identifier") {
            defaultExportName = node.declaration.name;
            defaultExportNode = node;
          }
        }
      },

      // Check at the end of the file
      "Program:exit"() {
        if (!defaultExportName || !defaultExportNode) {
          return;
        }

        // Check if the default export name ends with "NextJS"
        if (!defaultExportName.endsWith("NextJS")) {
          context.report({
            node: defaultExportNode,
            message: `NextJS page default export should be named with 'NextJS' suffix (e.g., '${defaultExportName}NextJS'). Current name: '${defaultExportName}'.`,
          });
          return;
        }

        // Extract the expected Page component name (XxxNextJS -> XxxPage, or XxxPageNextJS -> XxxPage)
        let expectedPageName = defaultExportName.replace(/NextJS$/, "");
        if (!expectedPageName.endsWith("Page")) {
          expectedPageName = expectedPageName + "Page";
        }

        // Find the function body to check what it renders
        let functionNode = null;
        if (defaultExportNode.declaration.type === "FunctionDeclaration") {
          functionNode = defaultExportNode.declaration;
        }

        if (!functionNode || !functionNode.body) {
          return;
        }

        // Look for return statement with JSX
        let foundPageComponent = false;
        let returnedComponentName = null;

        function checkReturnStatement(node) {
          if (!node.argument) {
            return;
          }

          let jsxElement = node.argument;

          // Handle fragments: <><XxxPage /></>
          if (jsxElement.type === "JSXFragment") {
            if (
              jsxElement.children &&
              jsxElement.children.length > 0
            ) {
              for (const child of jsxElement.children) {
                if (child.type === "JSXElement") {
                  jsxElement = child;
                  break;
                }
              }
            }
          }

          if (jsxElement.type === "JSXElement") {
            const openingElement = jsxElement.openingElement;
            if (openingElement && openingElement.name) {
              let componentName = null;
              if (openingElement.name.type === "JSXIdentifier") {
                componentName = openingElement.name.name;
              } else if (openingElement.name.type === "JSXMemberExpression") {
                // Handle cases like <Namespace.Component />
                componentName = openingElement.name.property.name;
              }

              if (componentName) {
                returnedComponentName = componentName;
                if (componentName === expectedPageName) {
                  foundPageComponent = true;
                }
              }
            }
          }
        }

        // Traverse the function body to find return statements
        function traverse(node) {
          if (!node) {
            return;
          }

          if (node.type === "ReturnStatement") {
            checkReturnStatement(node);
            return;
          }

          for (const key in node) {
            if (key === "parent") {
              continue;
            }
            const child = node[key];
            if (child && typeof child === "object") {
              if (Array.isArray(child)) {
                for (const item of child) {
                  if (item && typeof item === "object" && item.type) {
                    traverse(item);
                  }
                }
              } else if (child.type) {
                traverse(child);
              }
            }
          }
        }

        traverse(functionNode.body);

        if (!foundPageComponent && returnedComponentName) {
          context.report({
            node: defaultExportNode,
            message: `NextJS page '${defaultExportName}' should render '${expectedPageName}', but renders '${returnedComponentName}'.`,
          });
        }
      },
    };
  },
};
