import {
  anchorsToMarks,
  COMMENT_ANCHOR_NODE_NAME,
  marksToAnchors,
} from "@app/components/editor/document/DocumentCommentAnchor";
import { documentExtensions } from "@app/components/editor/document/extensions";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type {
  ExtendableConfig,
  JSONContent,
  MarkdownToken,
} from "@tiptap/core";
import { flattenExtensions, getExtensionField, getSchema } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import type { Node } from "@tiptap/pm/model";
import { Fragment } from "@tiptap/pm/model";

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

const hasSupportedMarkdown = (content: string) => {
  const tokens = documentMarkdown.instance.lexer(content);
  let supported = true;

  documentMarkdown.instance.walkTokens(tokens, (token) => {
    if (!isSupportedMarkdownToken(token)) {
      supported = false;
    }
  });

  return supported;
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
  const reopened = documentMarkdown.parse(markdown);
  return normalizeTextNodes(
    documentSchema.nodeFromJSON(withoutTrailingParagraphs(document))
  ).eq(
    normalizeTextNodes(
      documentSchema.nodeFromJSON(withoutTrailingParagraphs(reopened))
    )
  );
};

export const normalizeTextNodes = (node: Node): Node => {
  // The serializer writes anchors outside every mark, so a mark around one is not content.
  if (node.type.name === COMMENT_ANCHOR_NODE_NAME) {
    return node.mark([]);
  }
  const children: Node[] = [];
  node.forEach((child) => children.push(normalizeTextNodes(child)));
  return node.copy(Fragment.fromArray(children));
};

/**
 * @cc [owner:flvndvd,label:product] document-source-preservation
 * Markdown containing unsupported tokens or formatting that cannot survive serialization
 * MUST be rejected before editing. Callers MUST retain the original source for display.
 */
export const parseDocumentContent = (
  content: string
): Result<JSONContent, string> => {
  if (!hasSupportedMarkdown(content)) {
    return new Err("The Markdown uses formatting the editor cannot keep.");
  }

  let parsed: JSONContent;
  let serialized: string;

  try {
    parsed = documentMarkdown.parse(content);
    serialized = documentMarkdown.serialize(parsed);
  } catch {
    return new Err("The Markdown could not be parsed.");
  }

  if (!canRoundTripMarkdown(parsed, serialized)) {
    return new Err("The Markdown would not read back the same after editing.");
  }

  return anchorsToMarks(parsed, documentSchema);
};

/**
 * @cc [owner:flvndvd,label:product] document-markdown-save
 * Markdown output MUST reopen with the same content and formatting, ignoring empty trailing
 * paragraphs. A failed conversion MUST NOT reach persistence or acknowledge the draft.
 */
export const serializeDocumentMarkdown = (
  document: JSONContent
): Result<string, string> => {
  const content = withoutTrailingParagraphs(marksToAnchors(document));

  // Serializing or re-reading an unknown node throws; either way the document is not writable.
  try {
    const markdown = documentMarkdown.serialize(content);
    return hasSupportedMarkdown(markdown) &&
      canRoundTripMarkdown(content, markdown)
      ? new Ok(markdown)
      : new Err("The document would not read back the same as Markdown.");
  } catch {
    return new Err("The document could not be written as Markdown.");
  }
};
