import type { MarkedDocument } from "@app/components/editor/document/DocumentCommentAnchor";
import {
  anchorsToMarks,
  marksToAnchors,
  substituteAnchorDirectives,
} from "@app/components/editor/document/DocumentCommentAnchor";
import { documentExtensions } from "@app/components/editor/document/extensions";
import type { Result } from "@app/types/shared/result";
import { Err } from "@app/types/shared/result";
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

/** Markdown for an editor document, comment marks written as anchor directives. */
const serializeWithAnchors = (
  document: JSONContent,
  anchorOrder: string[]
): Result<string, string> => {
  const { document: anchored, directives } = marksToAnchors(
    document,
    anchorOrder
  );
  return substituteAnchorDirectives(
    documentMarkdown.serialize(anchored),
    directives
  );
};

/** Compares in the editor's form, comment marks included, as the user would reopen it. */
const canRoundTripMarkdown = (document: JSONContent, markdown: string) => {
  const reopened = anchorsToMarks(
    documentMarkdown.parse(markdown),
    documentSchema
  );
  return (
    reopened.isOk() &&
    normalizeTextNodes(
      documentSchema.nodeFromJSON(withoutTrailingParagraphs(document))
    ).eq(
      normalizeTextNodes(
        documentSchema.nodeFromJSON(
          withoutTrailingParagraphs(reopened.value.document)
        )
      )
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
 */
export const parseDocumentContent = (
  content: string
): Result<MarkedDocument, string> => {
  if (!hasSupportedMarkdown(content)) {
    return new Err("The Markdown uses formatting the editor cannot keep.");
  }

  let parsed: JSONContent;
  try {
    parsed = documentMarkdown.parse(content);
  } catch {
    return new Err("The Markdown could not be parsed.");
  }

  const marked = anchorsToMarks(parsed, documentSchema);
  if (marked.isErr()) {
    return marked;
  }

  // Opening is only safe when saving the untouched document goes through.
  if (
    serializeDocumentMarkdown(
      marked.value.document,
      marked.value.anchorOrder
    ).isErr()
  ) {
    return new Err("The Markdown would not read back the same after editing.");
  }

  return marked;
};

/**
 * @cc [owner:flvndvd,label:product] document-markdown-save
 * Markdown output MUST reopen with the same content and formatting, ignoring empty trailing
 * paragraphs. A failed conversion MUST NOT reach persistence or acknowledge the draft.
 */
export const serializeDocumentMarkdown = (
  document: JSONContent,
  anchorOrder: string[] = []
): Result<string, string> => {
  const content = withoutTrailingParagraphs(document);

  // Serializing or re-reading an unknown node throws; either way the document is not writable.
  try {
    const markdown = serializeWithAnchors(content, anchorOrder);
    if (markdown.isErr()) {
      return markdown;
    }
    return hasSupportedMarkdown(markdown.value) &&
      canRoundTripMarkdown(content, markdown.value)
      ? markdown
      : new Err("The document would not read back the same as Markdown.");
  } catch {
    return new Err("The document could not be written as Markdown.");
  }
};
