import { getSchema, type JSONContent } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { Fragment, type Node } from "@tiptap/pm/model";
import { z } from "zod";
import { documentExtensions, documentMarked } from "./extensions";

const documentSchema = getSchema(documentExtensions);
const documentMarkdown = new MarkdownManager({
  extensions: documentExtensions,
  marked: documentMarked,
});
const documentEnvelope = z.object({ type: z.literal("doc") }).passthrough();

/**
 * @cc [owner:flvndvd,label:product] document-source-preservation
 * Every top-level Markdown block MUST either load into the editor or be kept as a source
 * block. Markdown that would still change when reopened MUST be rejected before editing,
 * and callers MUST retain the original source for display.
 * JSON content MUST satisfy the document schema before editing.
 */
const parseMarkdown = (markdown: string): JSONContent | null => {
  try {
    return documentMarkdown.parse(markdown);
  } catch {
    return null;
  }
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
  const reopened = parseMarkdown(markdown);
  return (
    reopened !== null &&
    normalizeTextNodes(
      documentSchema.nodeFromJSON(withoutTrailingParagraphs(document))
    ).eq(
      normalizeTextNodes(
        documentSchema.nodeFromJSON(withoutTrailingParagraphs(reopened))
      )
    )
  );
};

const normalizeTextNodes = (node: Node): Node => {
  const children: Node[] = [];
  node.forEach((child) => children.push(normalizeTextNodes(child)));
  return node.copy(Fragment.fromArray(children));
};

export const parseDocumentContent = (
  content: string,
  contentType: "markdown" | "json"
): { ok: true; content: JSONContent } | { ok: false } => {
  if (contentType === "markdown") {
    const parsed = parseMarkdown(content);
    if (parsed === null) {
      return { ok: false };
    }

    let serialized: string;

    try {
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

  return canRoundTripMarkdown(content, markdown) ? markdown : null;
};
