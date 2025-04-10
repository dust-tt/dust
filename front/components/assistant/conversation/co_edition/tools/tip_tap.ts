import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Editor } from "@tiptap/react";
import { z } from "zod";

const ReplaceParagraphSchema = z.object({
  paragraphId: z
    .string()
    .describe(
      "The ID of the paragraph to replace (found in getEditorContentForModel response)"
    ),
  content: z.string().describe("The new HTML content for the paragraph"),
});

const InsertParagraphSchema = z.object({
  position: z
    .number()
    .describe("The position where to insert the new paragraph (0-based index)"),
  content: z.string().describe("The content of the new paragraph"),
});

const ReplaceTextRangeSchema = z.object({
  paragraphId: z
    .string()
    .describe("The ID of the paragraph containing the range to replace"),
  startOffset: z
    .number()
    .describe("The starting character offset within the paragraph"),
  endOffset: z
    .number()
    .describe("The ending character offset within the paragraph"),
  content: z.string().describe("The new content to insert"),
});

interface EditorContentForModel {
  type: "document";
  nodes: {
    id: string; // Unique identifier for each paragraph
    position: number; // 0-based index
    content: Array<{
      text: string;
      author: "llm" | "user";
      startOffset: number; // Character offset within paragraph
      endOffset: number; // Character offset within paragraph
    }>;
    fullText: string; // Complete text of the paragraph for easy reference
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

  console.log(editorJSON.content);

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

      const segments: Array<{
        text: string;
        author: "llm" | "user";
        startOffset: number;
        endOffset: number;
      }> = [];
      let currentOffset = 0;

      // Process each text segment in the node
      node.content.forEach((textNode) => {
        const isUserContent = textNode.marks?.some(
          (mark) => mark.type === "userContent"
        );

        segments.push({
          text: textNode.text ?? "",
          author: isUserContent ? "user" : "llm",
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

export function registerTipTapTools(server: McpServer, editor: Editor) {
  server.tool(
    "getEditorContentForModel",
    "Retrieve the current content of the editor in a structured format. This tool returns a document with paragraphs, where each paragraph has a unique ID, position, and content array. The content array contains text segments with author information (llm or user) and character offsets. This allows you to understand the structure of the document, identify which parts were written by the user versus the model, and make informed decisions about how to edit or respond to the content. Use this tool to analyze the current state of the document before making changes.",
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

  server.tool(
    "replaceParagraph",
    `Replace the entire content of a specified paragraph. IMPORTANT: Use this tool only after analyzing the current content with getEditorContentForModel.

    Best used when:
    - You need to completely rewrite a paragraph
    - The paragraph's content needs to be restructured entirely`,
    { params: ReplaceParagraphSchema },
    async ({ params }) => {
      editor
        .chain()
        .focus()
        .command(({ tr, commands }) => {
          // Find the paragraph node
          const doc = tr.doc;
          let found = false;

          doc.descendants((node, pos) => {
            if (node.attrs["data-id"] === params.paragraphId) {
              // Replace content using insertContentAt.
              commands.setMark("llmContent");
              commands.insertContentAt(
                { from: pos, to: pos + node.nodeSize },
                params.content
              );
              found = true;

              return false;
            }
          });

          return found;
        })
        .run();

      return {
        content: [
          {
            type: "text",
            text: `Successfully replaced content of paragraph ${params.paragraphId}`,
          },
        ],
      };
    }
  );

  // 2. Replace content within a paragraph using offsets
  server.tool(
    "replaceTextRange",
    `Replace specific text within a paragraph using character offsets. IMPORTANT: Use this tool only after analyzing the current content with getEditorContentForModel.

    CRITICAL: Only use the exact offset values provided by getEditorContentForModel. DO NOT attempt to infer or calculate positions yourself.

    Best used when:
    - You need to make precise edits within a paragraph
    - You want to modify only a portion of the text while preserving the rest
    - You have the exact character offsets from getEditorContentForModel`,
    { params: ReplaceTextRangeSchema },
    async ({ params }) => {
      editor
        .chain()
        .focus()
        .command(({ tr }) => {
          // Find the paragraph and replace the range
          const doc = tr.doc;
          let found = false;
          doc.descendants((node, pos) => {
            if (node.attrs["data-id"] === params.paragraphId) {
              const from = pos + 1 + params.startOffset; // +1 to account for paragraph start
              const to = pos + 1 + params.endOffset;
              tr.replaceWith(
                from,
                to,
                editor.schema.text(params.content, [
                  editor.schema.marks["llmContent"].create(),
                ])
              );
              found = true;
              return false;
            }
          });
          return found;
        })
        .run();

      return {
        content: [
          {
            type: "text",
            text: `Successfully replaced text range in paragraph ${params.paragraphId}`,
          },
        ],
      };
    }
  );

  // 3. Insert new paragraph
  server.tool(
    "insertParagraph",
    `Insert a new paragraph at a specific position. IMPORTANT: Use this tool only after analyzing the current content with getEditorContentForModel.

    Best used when:
    - You need to add new content between existing paragraphs
    - You want to expand the document with additional information`,
    { params: InsertParagraphSchema },
    async ({ params }) => {
      insertNodes(editor, params);

      return {
        content: [
          {
            type: "text",
            text: `Successfully inserted new paragraph at position ${params.position}`,
          },
        ],
      };
    }
  );
}

// Simple utility function that works with all nodes
function getDocumentPositions(doc: any) {
  // Just get all top-level nodes and their positions
  const positions: { node: any; pos: number; index: number }[] = [];
  let index = 0;

  doc.forEach((node: any, offset: number) => {
    positions.push({ node, pos: offset, index: index++ });
  });

  return positions;
}

export function insertNodes(
  editor: Editor,
  params: { position: number; content: string }
) {
  console.log("insertNodes", params);

  return editor
    .chain()
    .focus()
    .command(({ tr, commands }) => {
      const positions = getDocumentPositions(tr.doc);
      const targetPosition = positions[params.position];
      const insertPos = targetPosition
        ? targetPosition.pos
        : tr.doc.content.size;

      commands.setMark("llmContent");
      commands.insertContentAt(insertPos, params.content);

      return true;
    })
    .run();
}
