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
import { z } from "zod";
import { documentExtensions } from "./extensions";

const documentSchema = getSchema(documentExtensions);
const documentMarkdown = new MarkdownManager({
  extensions: documentExtensions,
});
const documentEnvelope = z.object({ type: z.literal("doc") }).passthrough();

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
): { ok: true; content: JSONContent } | { ok: false } => {
  if (contentType === "markdown") {
    if (!hasSupportedMarkdown(content)) {
      return { ok: false };
    }

    let parsed: JSONContent;
    let serialized: string;

    try {
      parsed = documentMarkdown.parse(content);
      serialized = documentMarkdown.serialize(parsed);
    } catch {
      return { ok: false };
    }

    if (!canRoundTripMarkdown(parsed, serialized)) {
      return { ok: false };
    }

    return { ok: true, content: parsed };
  }

  let json: unknown;

  try {
    json = JSON.parse(content);
  } catch {
    return { ok: false };
  }

  const parsed = documentEnvelope.safeParse(json);
  if (!parsed.success) {
    return { ok: false };
  }

  let node: Node;

  try {
    node = documentSchema.nodeFromJSON(parsed.data);
    node.check();
  } catch {
    return { ok: false };
  }

  return { ok: true, content: node.toJSON() };
};

/**
 * @cc [owner:flvndvd,label:product] document-markdown-save
 * Markdown output MUST reopen with the same content and formatting, ignoring empty trailing
 * paragraphs. A failed conversion MUST NOT reach persistence or acknowledge the draft.
 */
export const serializeDocumentMarkdown = (
  document: JSONContent
): string | null => {
  const content = withoutTrailingParagraphs(document);
  let markdown: string;

  try {
    markdown = documentMarkdown.serialize(content);
  } catch {
    return null;
  }

  return hasSupportedMarkdown(markdown) &&
    canRoundTripMarkdown(content, markdown)
    ? markdown
    : null;
};
