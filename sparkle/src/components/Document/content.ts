import { getSchema, type JSONContent, type MarkdownToken } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { Fragment, type Node } from "@tiptap/pm/model";
import { z } from "zod";
import { documentExtensions } from "./extensions";

const documentSchema = getSchema(documentExtensions);
const documentMarkdown = new MarkdownManager({
  extensions: documentExtensions,
});
const documentEnvelope = z.object({ type: z.literal("doc") }).passthrough();
const SUPPORTED_MARKDOWN_TOKENS = new Set([
  "space",
  "paragraph",
  "heading",
  "blockquote",
  "list",
  "list_item",
  "code",
  "hr",
  "text",
  "strong",
  "em",
  "del",
  "codespan",
  "br",
  "link",
  "underline",
]);

const isSupportedMarkdownToken = (token: MarkdownToken) =>
  token.type !== undefined &&
  SUPPORTED_MARKDOWN_TOKENS.has(token.type) &&
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
): { ok: true; content: JSONContent } | { ok: false } => {
  try {
    if (contentType === "markdown") {
      if (!hasSupportedMarkdown(content)) {
        return { ok: false };
      }

      const parsed = documentMarkdown.parse(content);
      const serialized = documentMarkdown.serialize(parsed);

      if (!canRoundTripMarkdown(parsed, serialized)) {
        return { ok: false };
      }

      return { ok: true, content: parsed };
    }

    const parsed = documentEnvelope.safeParse(JSON.parse(content));
    if (!parsed.success) {
      return { ok: false };
    }

    const node = documentSchema.nodeFromJSON(parsed.data);
    node.check();
    return { ok: true, content: node.toJSON() };
  } catch {
    return { ok: false };
  }
};

/**
 * @cc [owner:flvndvd,label:product] document-markdown-save
 * Markdown output MUST reopen with the same content and formatting, ignoring empty trailing
 * paragraphs. A failed conversion MUST NOT reach persistence or acknowledge the draft.
 */
export const serializeDocumentMarkdown = (
  document: JSONContent
): string | null => {
  try {
    const content = withoutTrailingParagraphs(document);
    const markdown = documentMarkdown.serialize(content);

    return hasSupportedMarkdown(markdown) &&
      canRoundTripMarkdown(content, markdown)
      ? markdown
      : null;
  } catch {
    return null;
  }
};
