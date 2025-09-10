"use strict";

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "enforce correct usage of @dust-tt/client types in public API endpoints",
    },
    schema: [],
    messages: {
      missingClientImport:
        "Files in /api/v1/ must import types from '@dust-tt/client' (see https://www.notion.so/dust-tt/Design-Doc-Splitting-types-for-the-public-API-26a28599d94180f59956dd8ab408ba78)",
      invalidClientImport:
        "Files outside /api/v1/ or lib/actions/mcp_internal_actions/ cannot import from '@dust-tt/client' (see https://www.notion.so/dust-tt/Design-Doc-Splitting-types-for-the-public-API-26a28599d94180f59956dd8ab408ba78)",
      handlerMissingClientType:
        "Handler 'res' parameter must use a type imported from '@dust-tt/client' (see https://www.notion.so/dust-tt/Design-Doc-Splitting-types-for-the-public-API-26a28599d94180f59956dd8ab408ba78)",
      handlerInvalidType:
        "Handler 'res' parameter type must be 'NextApiResponse<WithAPIErrorResponse<XXXType>>' where XXXType is the response type from '@dust-tt/client' (see https://www.notion.so/dust-tt/Design-Doc-Splitting-types-for-the-public-API-26a28599d94180f59956dd8ab408ba78)",
    },
  },

  create: function (context) {
    const filename = context.getFilename();
    const sourceCode = context.getSourceCode();

    // Check if file is in v1 API directory or is an internal MCP server
    const isV1ApiFile =
      (filename.includes("/pages/api/v1/") ||
        filename.includes("\\pages\\api\\v1\\")) &&
      !filename.includes(".test.");

    const isInternalMcpServer =
      filename.includes("/lib/actions/mcp_internal_actions/") ||
      filename.includes("\\lib\\actions\\mcp_internal_actions\\");

    // Track imports from @dust-tt/client
    const clientImports = new Set();
    let hasClientImport = false;

    return {
      ImportDeclaration(node) {
        if (node.source.value === "@dust-tt/client") {
          hasClientImport = true;

          // Track what's being imported from @dust-tt/client
          node.specifiers.forEach((specifier) => {
            if (specifier.type === "ImportSpecifier") {
              clientImports.add(specifier.imported.name);
            } else if (specifier.type === "ImportDefaultSpecifier") {
              clientImports.add("default");
            }
          });

          // Rule 3: Files outside v1 cannot import from @dust-tt/client
          if (!isV1ApiFile && !isInternalMcpServer) {
            context.report({
              node,
              messageId: "invalidClientImport",
            });
          }
        }
      },

      FunctionDeclaration(node) {
        // Look for handler functions (async functions with specific signature)
        if (node.id && node.id.name === "handler" && node.async) {
          checkHandlerFunction(node);
        }
      },

      VariableDeclarator(node) {
        // Look for arrow function handlers
        if (
          node.id &&
          node.id.name === "handler" &&
          node.init &&
          node.init.type === "ArrowFunctionExpression"
        ) {
          checkHandlerFunction(node.init);
        }
      },

      "Program:exit"() {
        // Rule 1: V1 files must have client import
        if (isV1ApiFile && !hasClientImport) {
          context.report({
            loc: { line: 1, column: 0 },
            messageId: "missingClientImport",
          });
        }
      },
    };

    function checkHandlerFunction(node) {
      // Only check handlers in v1 API files
      if (!isV1ApiFile) return;

      const params = node.params;
      if (params.length < 2) return;

      // Find the 'res' parameter (should be second parameter)
      const resParam = params[1];
      if (!resParam || !resParam.name || resParam.name !== "res") return;

      // Check if res parameter has type annotation
      if (!resParam.typeAnnotation || !resParam.typeAnnotation.typeAnnotation) {
        context.report({
          node: resParam,
          messageId: "handlerMissingClientType",
        });
        return;
      }

      const typeAnnotation = resParam.typeAnnotation.typeAnnotation;

      // Check if it's NextApiResponse<WithAPIErrorResponse<...>>
      if (!isValidResType(typeAnnotation)) {
        context.report({
          node: resParam,
          messageId: "handlerInvalidType",
        });
      }
    }

    function isValidResType(typeAnnotation) {
      // Should be TSTypeReference to NextApiResponse
      if (typeAnnotation.type !== "TSTypeReference") return false;

      const typeName = getTypeReferenceName(typeAnnotation.typeName);
      if (typeName !== "NextApiResponse") return false;

      // Should have type parameters
      if (
        !typeAnnotation.typeParameters ||
        !typeAnnotation.typeParameters.params.length
      ) {
        return false;
      }

      const firstParam = typeAnnotation.typeParameters.params[0];

      // Should be WithAPIErrorResponse<...>
      if (firstParam.type !== "TSTypeReference") return false;

      const wrapperTypeName = getTypeReferenceName(firstParam.typeName);
      if (wrapperTypeName !== "WithAPIErrorResponse") return false;

      // Should have type parameters for the client type
      if (
        !firstParam.typeParameters ||
        !firstParam.typeParameters.params.length
      ) {
        return false;
      }

      const clientType = firstParam.typeParameters.params[0];

      // Check if the client type uses imported types from @dust-tt/client
      return containsClientType(clientType);
    }

    function getTypeReferenceName(typeName) {
      if (typeName.type === "Identifier") {
        return typeName.name;
      }
      if (typeName.type === "TSQualifiedName") {
        return getTypeReferenceName(typeName.right);
      }
      return null;
    }

    function containsClientType(typeNode) {
      if (!typeNode) return false;

      if (typeNode.type === "TSTypeReference") {
        const typeName = getTypeReferenceName(typeNode.typeName);
        if (typeName && clientImports.has(typeName)) {
          return true;
        }

        // Check type parameters recursively
        if (typeNode.typeParameters && typeNode.typeParameters.params) {
          return typeNode.typeParameters.params.some((param) =>
            containsClientType(param)
          );
        }
      }

      if (
        typeNode.type === "TSUnionType" ||
        typeNode.type === "TSIntersectionType"
      ) {
        return typeNode.types.some((type) => containsClientType(type));
      }

      if (typeNode.type === "TSArrayType") {
        return containsClientType(typeNode.elementType);
      }

      if (typeNode.type === "TSTypeLiteral") {
        return typeNode.members.some((member) => {
          if (member.typeAnnotation) {
            return containsClientType(member.typeAnnotation.typeAnnotation);
          }
          return false;
        });
      }

      return false;
    }
  },
};
