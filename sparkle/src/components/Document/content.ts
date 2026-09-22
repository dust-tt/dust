import {
  type ExtendableConfig,
  flattenExtensions,
  getExtensionField,
  getSchema,
  type JSONContent,
  type MarkdownToken,
} from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { Fragment, type Node } from "@tiptap/pm/model";
import { documentExtensions } from "./extensions";
import {
  isDocumentSourceWithinLimit,
  validateDocumentJSON,
} from "./validation";

export type { DocumentFrameReference } from "./DocumentFrame";
export {
  DOCUMENT_MAX_FRAMES,
  DocumentFrameReferenceSchema,
} from "./DocumentFrame";
export { DOCUMENT_MAX_BYTES } from "./validation";

export type DocumentContentResult =
  | { ok: true; content: JSONContent }
  | { ok: false; error: string };

const documentSchema = getSchema(documentExtensions);
const documentMarkdown = new MarkdownManager({
  extensions: documentExtensions,
});

/**
 * @cc [owner:flvndvd,label:architecture] document-markdown-capabilities
 * Supported token names MUST derive from the editor extensions' parse and render handlers.
 */
const supportedMarkdownTokens = new Set(
  flattenExtensions(documentExtensions)
    .filter(
      (extension) =>
        getExtensionField<ExtendableConfig["parseMarkdown"]>(
          extension,
          "parseMarkdown"
        ) &&
        getExtensionField<ExtendableConfig["renderMarkdown"]>(
          extension,
          "renderMarkdown"
        )
    )
    .map(
      (extension) =>
        getExtensionField<ExtendableConfig["markdownTokenName"]>(
          extension,
          "markdownTokenName"
        ) || extension.name
    )
);

const isSupportedMarkdownToken = (token: MarkdownToken) =>
  token.type !== undefined &&
  // Whitespace separates blocks without an editor extension.
  (token.type === "space" || supportedMarkdownTokens.has(token.type)) &&
  // Registered list and code handlers still discard task markers and tilde fences.
  !(token.type === "list_item" && token.task) &&
  (token.type !== "code" ||
    token.raw?.startsWith("```") ||
    token.codeBlockStyle === "indented");

const getUnsupportedMarkdown = (content: string): string[] | null => {
  const unsupported = new Set<string>();

  try {
    const tokens = documentMarkdown.instance.lexer(content);
    documentMarkdown.instance.walkTokens(tokens, (token) => {
      if (!isSupportedMarkdownToken(token)) {
        unsupported.add(token.type ?? "unknown");
      }
    });
  } catch {
    return null;
  }

  return [...unsupported];
};

const parseMarkdownContent = (content: string): DocumentContentResult => {
  let parsed: JSONContent;
  try {
    parsed = documentMarkdown.parse(content);
  } catch {
    return { ok: false, error: "This Markdown could not be parsed." };
  }

  const normalized = parsed.content?.length
    ? parsed
    : { ...parsed, content: [{ type: "paragraph" }] };
  const validated = validateDocumentJSON(normalized, documentSchema);
  return validated.ok
    ? { ok: true, content: validated.node.toJSON() }
    : validated;
};

const withoutTrailingParagraphs = (document: JSONContent): JSONContent => {
  const content = document.content ?? [];
  let end = content.length;

  while (
    end > 0 &&
    content[end - 1].type === "paragraph" &&
    !content[end - 1].content?.length
  ) {
    end -= 1;
  }

  return { ...document, content: content.slice(0, end) };
};

const canRoundTripMarkdown = (document: JSONContent, markdown: string) => {
  const reopened = parseMarkdownContent(markdown);
  if (!reopened.ok) {
    return false;
  }

  return normalizeTextNodes(
    documentSchema.nodeFromJSON(withoutTrailingParagraphs(document))
  ).eq(
    normalizeTextNodes(
      documentSchema.nodeFromJSON(withoutTrailingParagraphs(reopened.content))
    )
  );
};

const normalizeTextNodes = (node: Node): Node => {
  const children: Node[] = [];
  node.forEach((child) => children.push(normalizeTextNodes(child)));
  return node.copy(Fragment.fromArray(children));
};

/**
 * @cc [owner:flvndvd,label:product] document-source-preservation
 * Markdown containing unsupported tokens or formatting that cannot survive serialization
 * MUST be rejected before editing. Callers MUST retain the original source for display.
 * JSON content MUST satisfy the document schema before editing.
 */
export const parseDocumentContent = (
  content: string,
  contentType: "markdown" | "json"
): DocumentContentResult => {
  if (!isDocumentSourceWithinLimit(content)) {
    return {
      ok: false,
      error: "This document exceeds the 512 KiB size limit.",
    };
  }

  if (contentType === "markdown") {
    const unsupported = getUnsupportedMarkdown(content);
    if (unsupported === null) {
      return { ok: false, error: "This Markdown could not be parsed." };
    }
    if (unsupported.length > 0) {
      return {
        ok: false,
        error: `Unsupported Markdown: ${unsupported.join(", ")}.`,
      };
    }

    const parsed = parseMarkdownContent(content);
    if (!parsed.ok) {
      return parsed;
    }

    let serialized: string;
    try {
      serialized = documentMarkdown.serialize(parsed.content);
    } catch {
      return {
        ok: false,
        error: "This formatting cannot be saved as Markdown.",
      };
    }

    return canRoundTripMarkdown(parsed.content, serialized)
      ? parsed
      : {
          ok: false,
          error: "This formatting cannot be preserved as Markdown.",
        };
  }

  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    return { ok: false, error: "This document is not valid JSON." };
  }

  const validated = validateDocumentJSON(json, documentSchema);
  return validated.ok
    ? { ok: true, content: validated.node.toJSON() }
    : validated;
};

/**
 * @cc [owner:flvndvd,label:product] document-markdown-save
 * Markdown output MUST reopen with the same content and formatting, ignoring empty trailing
 * paragraphs. A failed conversion MUST NOT reach persistence or acknowledge the draft.
 */
export const serializeDocumentMarkdown = (
  document: JSONContent
): string | null => {
  const validated = validateDocumentJSON(document, documentSchema);
  if (!validated.ok) {
    return null;
  }
  const content = withoutTrailingParagraphs(validated.node.toJSON());
  let markdown: string;

  try {
    markdown = documentMarkdown.serialize(content);
  } catch {
    return null;
  }

  const unsupported = getUnsupportedMarkdown(markdown);
  if (unsupported === null) {
    return null;
  }

  return unsupported.length === 0 && canRoundTripMarkdown(content, markdown)
    ? markdown
    : null;
};
