import { mergeAttributes, Node } from "@tiptap/core";

/**
 * Custom node to distinguish user-written content
 * This will be rendered with a special class in the HTML output
 */
export const UserContentNode = Node.create({
  name: "userContent",

  // Define the content rules for this node
  content: "block+",

  // Define the attributes for this node
  addAttributes() {
    return {
      userId: {
        default: "user",
        parseHTML: (element) => element.getAttribute("data-user-id"),
        renderHTML: (attributes) => {
          return {
            "data-user-id": attributes.userId,
          };
        },
      },
      timestamp: {
        default: () => new Date().toISOString(),
        parseHTML: (element) => element.getAttribute("data-timestamp"),
        renderHTML: (attributes) => {
          return {
            "data-timestamp": attributes.timestamp,
          };
        },
      },
    };
  },

  // Define how this node should be rendered in HTML
  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, any> }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { class: "user-content" }),
      0,
    ];
  },

  // Define how this node should be rendered in the editor
  renderNode({ HTMLAttributes }: { HTMLAttributes: Record<string, any> }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { class: "user-content" }),
      0,
    ];
  },
});
