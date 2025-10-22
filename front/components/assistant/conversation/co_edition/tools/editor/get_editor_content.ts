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

export function getEditorContentForModel(
  editor: Editor
): EditorContentForModel {
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
