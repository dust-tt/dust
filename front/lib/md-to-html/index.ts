import { buildServerSafeExtensions } from "@app/lib/md-to-html/extensions";
import { preprocessMarkdownForEditor } from "@app/lib/md-to-html/preprocessMarkdown";
import { stripHtmlAttributes } from "@app/lib/md-to-html/stripHtmlAttributes";
import type { JSONContent } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { renderToHTMLString } from "@tiptap/static-renderer";

const INSTRUCTIONS_ROOT_BLOCK_ID = "instructions-root";

const BLOCK_ID_TYPES = new Set([
  "heading",
  "instructionBlock",
  "orderedList",
  "paragraph",
  "bulletList",
]);

function generateShortId(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Recursively adds block-id attributes to block-level nodes in the JSON,
 * matching the same node types as the frontend BlockIdExtension.
 *
 * This is needed because MarkdownManager.parse() produces raw JSON without
 * running ProseMirror attribute defaults — so the BlockIdGlobalExtension
 * in extensions.ts only handles rendering, while this function generates
 * the actual ID values.
 */
function addBlockIds(node: JSONContent): JSONContent {
  const result = { ...node };

  if (result.type && BLOCK_ID_TYPES.has(result.type)) {
    result.attrs = {
      ...result.attrs,
      "block-id": generateShortId(),
    };
  }

  if (result.content) {
    result.content = result.content.map(addBlockIds);
  }

  return result;
}

/**
 * Wraps rendered HTML in the instructions-root div, matching the
 * frontend editor's InstructionsRootExtension output.
 */
function wrapInInstructionsRoot(html: string): string {
  return `<div data-type="${INSTRUCTIONS_ROOT_BLOCK_ID}" data-block-id="${INSTRUCTIONS_ROOT_BLOCK_ID}">${html}</div>`;
}

/**
 * Converts markdown instructions to clean HTML using the same TipTap
 * parsing pipeline as the frontend agent builder editor.
 *
 * Uses MarkdownManager for markdown→JSON and the static renderer for
 * JSON→HTML. No DOM or browser environment required.
 */
export function convertMarkdownToHtml(markdown: string): string {
  const extensions = buildServerSafeExtensions();
  const preprocessed = preprocessMarkdownForEditor(markdown);

  const manager = new MarkdownManager({ extensions });
  const json = addBlockIds(manager.parse(preprocessed));

  const innerHtml = renderToHTMLString({ extensions, content: json });

  return stripHtmlAttributes(wrapInInstructionsRoot(innerHtml));
}
