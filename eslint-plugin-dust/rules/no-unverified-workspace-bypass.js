module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Enforce WORKSPACE_ISOLATION_BYPASS comment when using dangerouslyBypassWorkspaceIsolationSecurity",
      recommended: true,
    },
    schema: [], // no options
  },
  create(context) {
    return {
      Property(node) {
        if (
          node.key.name === "dangerouslyBypassWorkspaceIsolationSecurity" &&
          node.value.value === true
        ) {
          const sourceCode = context.getSourceCode();
          const comments = sourceCode.getCommentsBefore(node);

          const hasWorkspaceBypassComment = comments.some((comment) =>
            comment.value.trim().startsWith("WORKSPACE_ISOLATION_BYPASS"),
          );

          if (!hasWorkspaceBypassComment) {
            context.report({
              node,
              message:
                'Usage of dangerouslyBypassWorkspaceIsolationSecurity requires a comment starting with "WORKSPACE_ISOLATION_BYPASS:" explaining the security bypass',
            });
          }
        }
      },
    };
  },
};
