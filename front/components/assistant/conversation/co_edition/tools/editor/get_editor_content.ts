import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Editor } from "@tiptap/react";

interface EditorContentForModelNodeContent {
  text: string;
  author: "agent" | "user";
  startOffset: number; // Character offset within node.
  endOffset: number; // Character offset within node.
}

export interface EditorContentForModel {
  type: "document";
  nodes: {
    id: string; // Unique identifier for each node.
    position: number; // 0-based index.
    content: Array<EditorContentForModelNodeContent>;
    fullText: string; // Complete text of the node for easy reference.
    html?: string; // HTML representation of the node.
  }[];
}

function getEditorContentFromDom(editor: Editor): EditorContentForModel {
  const nodes: EditorContentForModel["nodes"] = [];

  let currentNodeIndex = 0;

  editor.state.doc.descendants((node, pos, parent) => {
    // Only process top-level nodes.
    if (parent === editor.state.doc) {
      const id = node.attrs["data-id"];
      const segments: Array<EditorContentForModelNodeContent> = [];

      // Get the DOM node and clean its HTML.
      const domNode = editor.view.nodeDOM(pos);
      let html = "";

      if (domNode instanceof HTMLElement) {
        // Create a temporary container to manipulate the HTML.
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = domNode.outerHTML;

        // Remove the specified attributes from all elements in the temporary container.
        const elements = tempDiv.getElementsByTagName("*");
        for (let i = 0; i < elements.length; i++) {
          elements[i].removeAttribute("data-id");
          elements[i].removeAttribute("data-author");
          elements[i].removeAttribute("class");
        }

        html = tempDiv.innerHTML;
      }

      // Use ProseMirror's native position mapping.
      node.descendants((textNode, textPos) => {
        if (textNode.isText) {
          const isUserContent = textNode.marks.some(
            (mark) => mark.type.name === "userContent"
          );

          // Get absolute positions from ProseMirror.
          const start = pos + textPos;
          const end = start + textNode.nodeSize;

          // These are now real document positions.
          segments.push({
            text: textNode.text ?? "",
            author: isUserContent ? "user" : "agent",
            startOffset: start,
            endOffset: end,
          });
        }
      });

      nodes.push({
        id,
        position: currentNodeIndex++,
        content: segments,
        fullText: node.textContent,
        html,
      });
    }
  });

  return {
    type: "document",
    nodes,
  };
}

function getEditorContentForModel(editor: Editor): EditorContentForModel {
  const editorJSON = editor.getJSON();

  if (!editorJSON.content) {
    return {
      type: "document",
      nodes: [],
    };
  }

  return {
    type: "document",
    nodes: editorJSON.content.map((node, index) => {
      // First get the node's ID from its attributes.
      const id = node.attrs?.["data-id"];

      if (!node.content) {
        return {
          id,
          position: index,
          content: [],
          fullText: "",
        };
      }

      const segments: Array<EditorContentForModelNodeContent> = [];
      let currentOffset = 0;

      // Process each text segment in the node
      node.content.forEach((textNode) => {
        const isUserContent = textNode.marks?.some(
          (mark) => mark.type === "userContent"
        );

        segments.push({
          text: textNode.text ?? "",
          author: isUserContent ? "user" : "agent",
          startOffset: currentOffset,
          endOffset: currentOffset + (textNode.text?.length ?? 0),
        });

        currentOffset += textNode.text?.length ?? 0;
      });

      return {
        id,
        position: index,
        content: segments,
        fullText: segments.map((s) => s.text).join(""),
      };
    }),
  };
}

export function registerGetEditorContentTool(
  server: McpServer,
  editor: Editor
) {
  server.tool(
    "get_editor_content",
    "Retrieve the current content of the editor in a structured format. This tool returns a " +
      "document with nodes, where each node has a unique ID, position, and content " +
      "array. The content array contains text segments with author information (agent or user) " +
      "and character offsets. This allows you to understand the structure of the document, " +
      "identify which parts were written by the user versus the agent, and make informed " +
      "decisions about how to edit or respond to the content. Use this tool to analyze the " +
      "current state of the document before making changes.",
    {},
    async () => {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(getEditorContentForModel(editor), null, 2),
          },
        ],
      };
    }
  );
}
