"use strict";

/**
 * ESLint rule to enforce Zod schema validation on public API responses
 *
 * This rule ensures that all responses from public API endpoints are validated
 * using Zod schemas with `.strip().parse()` to prevent data leakage from
 * private/internal API responses.
 *
 * Valid patterns:
 * - PublicSchema.strip().parse(privateResponse)
 * - PublicSchema.strip().safeParse(privateResponse)
 * - inline: res.json(PublicSchema.strip().parse(privateResponse))
 */

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Enforce Zod schema validation with .strip().parse() on public API responses to prevent data leakage",
      category: "Best Practices",
      recommended: true,
    },
    schema: [
      {
        type: "object",
        properties: {
          strictness: {
            type: "string",
            enum: ["strict", "flexible", "custom"],
            default: "strict",
          },
          schemaPattern: {
            type: "string",
            default: "^[A-Z].*Schema$",
          },
          requireStrip: {
            type: "boolean",
            default: true,
          },
          ignoredPaths: {
            type: "array",
            items: { type: "string" },
            default: [],
          },
          customValidators: {
            type: "array",
            items: { type: "string" },
            default: [],
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missingValidation:
        "Public API response must be validated with Zod schema before returning. Use: {{schema}}.strip().parse({{variable}})",
      missingStrip:
        "Schema validation must use .strip() before .parse() to remove unknown fields. Use: {{schema}}.strip().parse({{variable}})",
      unsafeDirectReturn:
        "Returning data directly without schema validation. Expected: {{schema}}.strip().parse({{variable}})",
      invalidValidationPattern:
        "Invalid validation pattern detected. Use .strip().parse() or .strip().safeParse()",
    },
    fixable: "code",
  },

  create: function (context) {
    const filename = context.getFilename();
    const sourceCode = context.getSourceCode();

    // Get configuration options
    const options = context.options[0] || {};
    const strictness = options.strictness || "strict";
    const requireStrip = options.requireStrip !== false;
    const ignoredPaths = options.ignoredPaths || [];
    const customValidators = options.customValidators || [];

    // Check if file is in v1 API directory
    const isV1ApiFile =
      (filename.includes("/pages/api/v1/") ||
        filename.includes("\\pages\\api\\v1\\")) &&
      !filename.includes(".test.");

    // Skip if file is in ignored paths
    const isIgnoredPath = ignoredPaths.some((pattern) =>
      filename.includes(pattern)
    );

    if (!isV1ApiFile || isIgnoredPath) {
      return {};
    }

    // Track Zod schema imports and validated variables
    const zodSchemas = new Set();
    const clientSchemas = new Set(); // Schemas imported from @dust-tt/client
    const validatedVariables = new Set();
    const variableAssignments = new Map(); // Track what variables are assigned to
    const handlerResponseTypes = new Map(); // Map handler functions to their response types

    return {
      // Track Zod schema imports
      ImportDeclaration(node) {
        // Track imports from zod
        if (node.source.value === "zod") {
          node.specifiers.forEach((specifier) => {
            if (specifier.type === "ImportSpecifier") {
              // Track z import (z.object, etc.)
              if (specifier.imported.name === "z") {
                // Will track z.object(...) patterns
              }
            }
          });
        }

        // Track schema imports from @dust-tt/client
        if (node.source.value === "@dust-tt/client") {
          node.specifiers.forEach((specifier) => {
            if (
              specifier.type === "ImportSpecifier" &&
              /Schema$/.test(specifier.imported.name)
            ) {
              clientSchemas.add(specifier.imported.name);
            }
          });
        }

        // Track schema variable imports (e.g., import { UserSchema } from './schemas')
        node.specifiers.forEach((specifier) => {
          if (
            specifier.type === "ImportSpecifier" &&
            /Schema$/.test(specifier.imported.name)
          ) {
            zodSchemas.add(specifier.imported.name);
          }
        });
      },

      // Track variable declarations that might be Zod schemas
      VariableDeclarator(node) {
        if (
          node.id.type === "Identifier" &&
          /Schema$/.test(node.id.name) &&
          node.init
        ) {
          zodSchemas.add(node.id.name);

          // Check if this is a validated assignment
          if (isValidatedExpression(node.init)) {
            validatedVariables.add(node.id.name);
          }

          // Track variable assignments for flow analysis
          variableAssignments.set(node.id.name, node.init);
        }

        // Track any variable that is assigned a validated expression
        if (node.id.type === "Identifier" && node.init) {
          if (isValidatedExpression(node.init)) {
            validatedVariables.add(node.id.name);
          }
          variableAssignments.set(node.id.name, node.init);
        }
      },

      // Check return statements in handler functions
      ReturnStatement(node) {
        if (!node.argument) return;

        // Check if we're in a handler function
        if (!isInHandlerFunction(node)) return;

        // Check various return patterns
        checkReturnStatement(node);
      },

      // Check res.json(), res.send(), res.status().json() calls
      CallExpression(node) {
        if (!isResponseMethodCall(node)) return;

        // Check if we're in a handler function
        if (!isInHandlerFunction(node)) return;

        // Get the argument passed to res.json/send
        const argument = node.arguments[0];
        if (!argument) return;

        // Check if the argument is validated
        checkArgumentValidation(argument);
      },
    };

    /**
     * Get the expected schema name for the current handler
     * Infers from response type annotation (e.g., MeResponseType -> MeResponseSchema)
     */
    function getExpectedSchemaName(node) {
      // Find the handler function that contains this node
      let parent = node.parent;
      while (parent) {
        if (
          parent.type === "FunctionDeclaration" ||
          parent.type === "FunctionExpression" ||
          parent.type === "ArrowFunctionExpression"
        ) {
          // Check if this is a handler function with (req, res) signature
          if (parent.params && parent.params.length >= 2) {
            const resParam = parent.params[1];
            if (
              resParam &&
              resParam.name &&
              (resParam.name === "res" || resParam.name === "response")
            ) {
              // Extract type from response parameter
              const schemaName = extractSchemaFromResponseType(resParam);
              // Return the inferred schema name even if not imported
              // This helps developers know which schema to import
              if (schemaName) {
                return schemaName;
              }
            }
          }
        }
        parent = parent.parent;
      }

      // If we have any imported schemas, suggest the first one
      if (clientSchemas.size > 0) {
        return Array.from(clientSchemas)[0];
      }

      // Fallback to generic name
      return "PublicSchema";
    }

    /**
     * Extract schema name from response type annotation
     * e.g., NextApiResponse<WithAPIErrorResponse<MeResponseType>> -> MeResponseSchema
     */
    function extractSchemaFromResponseType(resParam) {
      if (!resParam.typeAnnotation || !resParam.typeAnnotation.typeAnnotation) {
        return null;
      }

      const typeAnnotation = resParam.typeAnnotation.typeAnnotation;

      // Look for WithAPIErrorResponse<SomeType>
      if (typeAnnotation.type === "TSTypeReference") {
        // Check for NextApiResponse<...>
        if (
          typeAnnotation.typeName &&
          getTypeReferenceName(typeAnnotation.typeName) === "NextApiResponse"
        ) {
          if (
            typeAnnotation.typeParameters &&
            typeAnnotation.typeParameters.params.length > 0
          ) {
            const firstParam = typeAnnotation.typeParameters.params[0];
            return extractSchemaFromTypeParam(firstParam);
          }
        }
        // Direct type reference
        return extractSchemaFromTypeParam(typeAnnotation);
      }

      return null;
    }

    /**
     * Extract schema name from a type parameter
     */
    function extractSchemaFromTypeParam(typeNode) {
      if (!typeNode) return null;

      if (typeNode.type === "TSTypeReference") {
        const typeName = getTypeReferenceName(typeNode.typeName);

        // Handle WithAPIErrorResponse<ActualType>
        if (typeName === "WithAPIErrorResponse") {
          if (
            typeNode.typeParameters &&
            typeNode.typeParameters.params.length > 0
          ) {
            return extractSchemaFromTypeParam(typeNode.typeParameters.params[0]);
          }
        }

        // Convert Type name to Schema name
        // e.g., MeResponseType -> MeResponseSchema
        //       GetConversationsResponseType -> GetConversationsResponseSchema
        if (typeName && typeName.endsWith("Type")) {
          const schemaName = typeName.replace(/Type$/, "Schema");
          return schemaName;
        }

        return typeName;
      }

      // Handle union types - try to find a specific response type
      if (typeNode.type === "TSUnionType") {
        for (const unionType of typeNode.types) {
          const schemaName = extractSchemaFromTypeParam(unionType);
          if (schemaName && !schemaName.includes("Error")) {
            return schemaName;
          }
        }
      }

      return null;
    }

    /**
     * Get the name from a type reference (handles both Identifier and TSQualifiedName)
     */
    function getTypeReferenceName(typeName) {
      if (!typeName) return null;

      if (typeName.type === "Identifier") {
        return typeName.name;
      }
      if (typeName.type === "TSQualifiedName") {
        return getTypeReferenceName(typeName.right);
      }
      return null;
    }

    /**
     * Check if a call expression is a whitelisted error handler
     */
    function isErrorHandler(node) {
      // Check if it's a call to apiError or similar error handling functions
      if (node.type === "CallExpression" && node.callee.type === "Identifier") {
        const errorHandlers = [
          "apiError",
          "apiErrorForConversation",
          "apiErrorForAssistant",
        ];
        return errorHandlers.includes(node.callee.name);
      }
      return false;
    }

    /**
     * Check if a call expression is delegating to another handler function
     * Handler functions are those that take (req, res) parameters
     */
    function isHandlerDelegation(node) {
      if (node.type !== "CallExpression") return false;

      // Check if the call has (req, res) or (request, response) arguments
      if (node.arguments.length < 2) return false;

      const firstArg = node.arguments[0];
      const secondArg = node.arguments[1];

      // Check if arguments are identifiers with handler-like names
      if (
        firstArg.type === "Identifier" &&
        secondArg.type === "Identifier"
      ) {
        const firstArgName = firstArg.name;
        const secondArgName = secondArg.name;

        // Common handler parameter patterns
        const isHandlerPattern =
          (firstArgName === "req" || firstArgName === "request") &&
          (secondArgName === "res" || secondArgName === "response");

        return isHandlerPattern;
      }

      return false;
    }

    /**
     * Check if an argument passed to res.json/send needs validation
     */
    function checkArgumentValidation(argument) {
      // If it's a validated expression or variable, it's fine
      if (isValidatedExpression(argument) || isValidatedVariable(argument)) {
        return;
      }

      // If it's a whitelisted error handler, it's fine
      if (isErrorHandler(argument)) {
        return;
      }

      // If it's an object literal, check each property
      if (argument.type === "ObjectExpression") {
        argument.properties.forEach((prop) => {
          if (prop.type === "Property" && prop.value) {
            const value = prop.value;

            // Skip literals and other safe values
            if (
              value.type === "Literal" ||
              value.type === "TemplateLiteral" ||
              value.type === "BinaryExpression" ||
              value.type === "UnaryExpression"
            ) {
              return;
            }

            // Skip validated expressions and variables
            if (isValidatedExpression(value) || isValidatedVariable(value)) {
              return;
            }

            // Check if it's an identifier that looks like API data
            if (value.type === "Identifier") {
              const varName = value.name;
              if (looksLikeApiData(varName)) {
                context.report({
                  node: value,
                  messageId: "missingValidation",
                  data: {
                    schema: getExpectedSchemaName(value),
                    variable: varName,
                  },
                });
              }
            }

            // Check nested objects recursively
            if (value.type === "ObjectExpression") {
              checkArgumentValidation(value);
            }

            // Check array expressions
            if (value.type === "ArrayExpression") {
              value.elements.forEach((element) => {
                if (element && element.type === "Identifier") {
                  const varName = element.name;
                  if (
                    looksLikeApiData(varName) &&
                    !isValidatedVariable(element)
                  ) {
                    context.report({
                      node: element,
                      messageId: "missingValidation",
                      data: {
                        schema: getExpectedSchemaName(element),
                        variable: varName,
                      },
                    });
                  }
                }
              });
            }
          }
        });
        return;
      }

      // For identifiers, check if they look like API data
      if (argument.type === "Identifier") {
        if (looksLikeApiData(argument.name)) {
          context.report({
            node: argument,
            messageId: "missingValidation",
            data: {
              schema: getExpectedSchemaName(argument),
              variable: argument.name,
            },
          });
        }
        return;
      }

      // For member expressions (e.g., result.data from safeParse)
      if (argument.type === "MemberExpression") {
        const varName = getVariableName(argument) || "data";
        context.report({
          node: argument,
          messageId: "missingValidation",
          data: {
            schema: getExpectedSchemaName(argument),
            variable: varName,
          },
        });
        return;
      }

      // For call expressions that aren't validated
      if (argument.type === "CallExpression") {
        const varName = getVariableName(argument) || "data";
        context.report({
          node: argument,
          messageId: "missingValidation",
          data: {
            schema: getExpectedSchemaName(argument),
            variable: varName,
          },
        });
      }
    }

    /**
     * Check if a variable name looks like it might contain API data
     * Returns false only for clearly safe/primitive values
     */
    function looksLikeApiData(name) {
      if (!name) return false;

      // Whitelist of names that are clearly not API data (primitive values, metadata)
      const safeNames = [
        "status",
        "message",
        "error",
        "success",
        "ok",
        "code",
        "count",
        "total",
        "limit",
        "offset",
        "page",
        "perPage",
        "timestamp",
      ];

      // If it's in the safe list, it's not API data
      if (safeNames.includes(name)) {
        return false;
      }

      // Everything else should be considered potentially unsafe
      // and require validation
      return true;
    }

    /**
     * Check if an expression is a validated Zod schema call
     * e.g., Schema.strip().parse(data) or Schema.strip().safeParse(data)
     */
    function isValidatedExpression(node) {
      if (!node) return false;

      // Check for .parse() or .safeParse() call
      if (node.type === "CallExpression") {
        if (
          node.callee.type === "MemberExpression" &&
          (node.callee.property.name === "parse" ||
            node.callee.property.name === "safeParse")
        ) {
          // Check if there's .strip() in the chain
          if (requireStrip) {
            return hasStripInChain(node.callee.object);
          }
          return true;
        }

        // Check for custom validators
        if (
          node.callee.type === "Identifier" &&
          customValidators.includes(node.callee.name)
        ) {
          return true;
        }
      }

      // Check for safeParse result access (result.data)
      if (
        node.type === "MemberExpression" &&
        node.property.name === "data"
      ) {
        const objectName = getVariableName(node.object);
        // Check if this variable was assigned from safeParse
        const assignment = variableAssignments.get(objectName);
        if (assignment && isValidatedExpression(assignment)) {
          return true;
        }
      }

      return false;
    }

    /**
     * Check if .strip() is called in the chain before .parse()
     */
    function hasStripInChain(node) {
      if (!node) return false;

      if (node.type === "CallExpression") {
        if (
          node.callee.type === "MemberExpression" &&
          node.callee.property.name === "strip"
        ) {
          return true;
        }
        // Recursively check the chain
        return hasStripInChain(node.callee.object);
      }

      if (node.type === "MemberExpression") {
        if (node.property.name === "strip") {
          return true;
        }
        return hasStripInChain(node.object);
      }

      return false;
    }

    /**
     * Check if a variable has been validated
     */
    function isValidatedVariable(node) {
      if (node.type !== "Identifier") return false;

      // Use a set to track visited variables to avoid infinite loops
      const visited = new Set();
      return isValidatedVariableRecursive(node.name, visited);
    }

    /**
     * Recursively check if a variable is validated, following assignment chains
     */
    function isValidatedVariableRecursive(name, visited) {
      if (visited.has(name)) return false;
      visited.add(name);

      if (validatedVariables.has(name)) {
        return true;
      }

      // Check if variable was assigned from a validated expression
      const assignment = variableAssignments.get(name);
      if (assignment) {
        // Check if it's a validated expression
        if (isValidatedExpression(assignment)) {
          return true;
        }

        // Check if it's assigned from another validated variable
        if (assignment.type === "Identifier") {
          return isValidatedVariableRecursive(assignment.name, visited);
        }
      }

      return false;
    }

    /**
     * Check if node is inside a handler function
     */
    function isInHandlerFunction(node) {
      let parent = node.parent;
      while (parent) {
        if (
          (parent.type === "FunctionDeclaration" ||
            parent.type === "FunctionExpression" ||
            parent.type === "ArrowFunctionExpression") &&
          parent.params &&
          parent.params.length >= 2
        ) {
          // Check if params match (req, res) pattern
          const params = parent.params;
          if (
            params[0] &&
            params[1] &&
            (params[1].name === "res" || params[1].name === "response")
          ) {
            return true;
          }
        }
        parent = parent.parent;
      }
      return false;
    }

    /**
     * Check if a call expression is a response method (res.json, res.send, etc.)
     */
    function isResponseMethodCall(node) {
      if (node.type !== "CallExpression") return false;

      const callee = node.callee;

      // Direct call: res.json(), res.send()
      if (callee.type === "MemberExpression") {
        const method = callee.property.name;

        // Check if it's a json or send call
        if (method === "json" || method === "send") {
          // Check if the object is 'res' directly
          if (
            callee.object.type === "Identifier" &&
            (callee.object.name === "res" || callee.object.name === "response")
          ) {
            return true;
          }

          // Check if the object is a chained call (res.status(200).json())
          if (callee.object.type === "CallExpression") {
            return isChainedResponseCall(callee.object);
          }
        }
      }

      return false;
    }

    /**
     * Check if a call is part of a response chain (e.g., res.status(200))
     */
    function isChainedResponseCall(node) {
      if (node.type !== "CallExpression") return false;

      const callee = node.callee;
      if (callee.type !== "MemberExpression") return false;

      // Check if the base object is 'res' or 'response'
      if (callee.object.type === "Identifier") {
        return (
          callee.object.name === "res" || callee.object.name === "response"
        );
      }

      // Recursively check for longer chains
      if (callee.object.type === "CallExpression") {
        return isChainedResponseCall(callee.object);
      }

      return false;
    }

    /**
     * Get the variable name from a node
     */
    function getVariableName(node) {
      if (!node) return null;

      if (node.type === "Identifier") {
        return node.name;
      }

      if (node.type === "MemberExpression") {
        const obj = getVariableName(node.object);
        const prop = node.property.name;
        return obj ? `${obj}.${prop}` : prop;
      }

      if (node.type === "CallExpression") {
        return getVariableName(node.callee);
      }

      return null;
    }

    /**
     * Check return statements for validation
     */
    function checkReturnStatement(node) {
      const argument = node.argument;

      // Skip error handlers in return statements
      if (isErrorHandler(argument)) {
        return;
      }

      // Check for direct return of data
      if (argument.type === "Identifier") {
        if (!isValidatedVariable(argument)) {
          context.report({
            node: argument,
            messageId: "unsafeDirectReturn",
            data: {
              schema: getExpectedSchemaName(argument),
              variable: argument.name,
            },
          });
        }
      }

      // Check for return of object literal
      if (argument.type === "ObjectExpression") {
        // Check each property
        argument.properties.forEach((prop) => {
          if (prop.type === "Property" && prop.value) {
            if (
              prop.value.type === "Identifier" &&
              !isValidatedVariable(prop.value) &&
              !isValidatedExpression(prop.value)
            ) {
              // This might be unsafe - but could be a primitive or safe value
              // We'll be conservative and not report unless it looks like API data
              const varName = prop.value.name;
              if (
                varName &&
                (varName.includes("data") ||
                  varName.includes("response") ||
                  varName.includes("result") ||
                  varName.includes("Data") ||
                  varName.includes("Response"))
              ) {
                context.report({
                  node: prop.value,
                  messageId: "missingValidation",
                  data: {
                    schema: getExpectedSchemaName(prop.value),
                    variable: varName,
                  },
                });
              }
            }
          }
        });
      }

      // Check for call expressions that aren't validated
      if (argument.type === "CallExpression") {
        if (!isValidatedExpression(argument)) {
          // Skip handler delegations (e.g., return handleAuth(req, res))
          if (isHandlerDelegation(argument)) {
            return;
          }

          // Check if it's a response method - those are handled separately
          if (!isResponseMethodCall(argument)) {
            const varName = getVariableName(argument) || "data";
            context.report({
              node: argument,
              messageId: "missingValidation",
              data: {
                schema: getExpectedSchemaName(argument),
                variable: varName,
              },
            });
          }
        }
      }
    }
  },
};
