"use strict";

const INSTRUCTIONS_COMMENT_PREFIX = "MCP INSTRUCTIONS:";

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

function findInstructionsProperty(serverInfoNode) {
  return serverInfoNode.value.properties.find(
    (prop) =>
      prop.type === "Property" &&
      prop.key.type === "Identifier" &&
      prop.key.name === "instructions",
  );
}

function isServerInfoProperty(node) {
  return (
    node.key.type === "Identifier" &&
    node.key.name === "serverInfo" &&
    node.value.type === "ObjectExpression"
  );
}

module.exports = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Require explanatory comment when INTERNAL_MCP_SERVERS items have non-null instructions",
    },
    schema: [],
  },

  create: function (context) {
    let inInternalMcpServers = false;
    const sourceCode = context.sourceCode || context.getSourceCode();

    return {
      VariableDeclarator(node) {
        if (isInternalMcpServersDeclarator(node)) {
          inInternalMcpServers = true;
        }
      },

      "VariableDeclarator:exit"(node) {
        if (
          node.id.type === "Identifier" &&
          node.id.name === "INTERNAL_MCP_SERVERS"
        ) {
          inInternalMcpServers = false;
        }
      },

      Property(node) {
        if (!inInternalMcpServers || !isServerInfoProperty(node)) {
          return;
        }

        const instructionsProp = findInstructionsProperty(node);
        if (!instructionsProp || isNullLiteral(instructionsProp.value)) {
          return;
        }

        const comments = sourceCode.getCommentsBefore(instructionsProp);
        const hasExplanatoryComment = comments.some((comment) =>
          comment.value.trim().startsWith(INSTRUCTIONS_COMMENT_PREFIX),
        );

        if (!hasExplanatoryComment) {
          context.report({
            node: instructionsProp,
            message:
              "Instructions in INTERNAL_MCP_SERVERS need to be avoided. " +
              "Tools should be self-explanatory and straightforward to use: avoid coupling " +
              '(e.g., "always use tool A before B", should be bundled in tool B itself). ' +
              "Proper design eliminates the need for server-level instructions, preventing " +
              "context bloat and instruction clashes.",
          });
        }
      },
    };
  },
};
