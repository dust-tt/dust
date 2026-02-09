"use strict";

const ERROR_MESSAGE =
  "MCP server instructions need to be avoided. " +
  "Tools should be self-explanatory and straightforward to use: avoid coupling " +
  '(e.g., "always use tool A before B", should be bundled in tool B itself). ' +
  "Proper design eliminates the need for server-level instructions, preventing " +
  "context bloat and instruction clashes.";

function isNullLiteral(node) {
  return node.type === "Literal" && node.value === null;
}

function isInternalMcpServersDeclarator(node) {
  if (
    node.id.type !== "Identifier" ||
    node.id.name !== "INTERNAL_MCP_SERVERS"
  ) {
    return false;
  }
  const init = node.init;
  return (
    init?.type === "ObjectExpression" ||
    (init?.type === "TSSatisfiesExpression" &&
      init.expression?.type === "ObjectExpression")
  );
}

function findInstructionsProperty(objectNode) {
  return objectNode.properties.find(
    (prop) =>
      prop.type === "Property" &&
      prop.key.type === "Identifier" &&
      prop.key.name === "instructions"
  );
}

function isServerInfoProperty(node) {
  return (
    node.key.type === "Identifier" &&
    node.key.name === "serverInfo" &&
    node.value.type === "ObjectExpression"
  );
}

function isSatisfiesServerMetadata(node) {
  const init = node.init;
  return (
    init?.type === "TSSatisfiesExpression" &&
    init.typeAnnotation?.type === "TSTypeReference" &&
    init.typeAnnotation.typeName?.type === "Identifier" &&
    init.typeAnnotation.typeName.name === "ServerMetadata"
  );
}

function findServerInfoInObject(objectNode) {
  return objectNode.properties.find(
    (prop) =>
      prop.type === "Property" &&
      prop.key.type === "Identifier" &&
      prop.key.name === "serverInfo" &&
      prop.value.type === "ObjectExpression"
  );
}

module.exports = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow non-null instructions in MCP server metadata definitions",
    },
    schema: [],
  },

  create: function (context) {
    const filename = context.filename || context.getFilename();
    const isConstants = filename.endsWith("constants.ts");
    const isMetadata = filename.endsWith("metadata.ts");

    if (!isConstants && !isMetadata) {
      return {};
    }

    let inInternalMcpServers = false;

    return {
      VariableDeclarator(node) {
        // In constants.ts: track when we're inside INTERNAL_MCP_SERVERS.
        // This is the pre-metadata migration path.
        if (isConstants && isInternalMcpServersDeclarator(node)) {
          inInternalMcpServers = true;
        }

        // In metadata.ts: check variables with `satisfies ServerMetadata`.
        if (isMetadata && isSatisfiesServerMetadata(node)) {
          // `{ ... } as const satisfies ServerMetadata` is parsed as:
          //   TSSatisfiesExpression > TSAsExpression > ObjectExpression.
          // `{ ... } satisfies ServerMetadata` is parsed as:
          //   TSSatisfiesExpression > ObjectExpression.
          let objectExpr = node.init.expression;
          if (objectExpr?.type === "TSAsExpression") {
            objectExpr = objectExpr.expression;
          }
          if (objectExpr?.type !== "ObjectExpression") {
            return;
          }
          const serverInfoProp = findServerInfoInObject(objectExpr);
          if (!serverInfoProp) {
            return;
          }
          const instructionsProp = findInstructionsProperty(
            serverInfoProp.value
          );
          if (!instructionsProp || isNullLiteral(instructionsProp.value)) {
            return;
          }
          context.report({
            node: instructionsProp,
            message: ERROR_MESSAGE,
          });
        }
      },

      "VariableDeclarator:exit"(node) {
        if (
          isConstants &&
          node.id.type === "Identifier" &&
          node.id.name === "INTERNAL_MCP_SERVERS"
        ) {
          inInternalMcpServers = false;
        }
      },

      Property(node) {
        if (
          !isConstants ||
          !inInternalMcpServers ||
          !isServerInfoProperty(node)
        ) {
          return;
        }

        const instructionsProp = findInstructionsProperty(node.value);
        if (!instructionsProp || isNullLiteral(instructionsProp.value)) {
          return;
        }

        context.report({
          node: instructionsProp,
          message: ERROR_MESSAGE,
        });
      },
    };
  },
};
