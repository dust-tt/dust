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
 * Removes auto-linked email addresses from the JSON tree. The markdown
 * parser (marked) auto-links bare emails like user@example.com into link
 * nodes with mailto: hrefs, but the frontend editor doesn't — so we
 * unwrap them back to plain text to match.
 */
function removeAutoLinkedEmails(node: JSONContent): JSONContent {
  if (node.content) {
    return {
      ...node,
      content: node.content.flatMap((child) => {
        if (
          child.type === "text" &&
          child.marks?.length === 1 &&
          child.marks[0].type === "link" &&
          child.marks[0].attrs?.href?.startsWith("mailto:")
        ) {
          const { marks: _, ...rest } = child;
          return [rest];
        }
        return [removeAutoLinkedEmails(child)];
      }),
    };
  }

  return node;
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
  const json = addBlockIds(removeAutoLinkedEmails(manager.parse(preprocessed)));

  const innerHtml = renderToHTMLString({ extensions, content: json });

  return stripHtmlAttributes(wrapInInstructionsRoot(innerHtml));
}
