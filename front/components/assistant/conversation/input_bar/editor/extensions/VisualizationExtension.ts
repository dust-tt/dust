import { Node } from "@tiptap/core";

/**
 * TipTap extension for rendering visualization blocks.
 * Handles the :visualization directive from markdown.
 */
export const VisualizationExtension = Node.create({
  name: "visualization",

  group: "block",

  atom: true,

  addAttributes() {
    return {
      code: {
        default: "",
      },
      complete: {
        default: false,
      },
      lineStart: {
        default: 0,
      },
      agentConfigurationId: {
        default: "",
      },
      conversationId: {
        default: "",
      },
      messageId: {
        default: "",
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "visualization",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["visualization", HTMLAttributes];
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("visualization");
      dom.setAttribute("data-code", node.attrs.code);
      dom.setAttribute("data-complete", node.attrs.complete);
      dom.setAttribute("data-line-start", node.attrs.lineStart);
      dom.setAttribute(
        "data-agent-configuration-id",
        node.attrs.agentConfigurationId
      );
      dom.setAttribute("data-conversation-id", node.attrs.conversationId);
      dom.setAttribute("data-message-id", node.attrs.messageId);
      return { dom };
    };
  },
});
