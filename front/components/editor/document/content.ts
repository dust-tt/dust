import type {
  AnchorFormatting,
  MarkedDocument,
} from "@app/components/editor/document/DocumentCommentAnchor";
import {
  anchorsToMarks,
  marksToAnchors,
  substituteAnchorDirectives,
} from "@app/components/editor/document/DocumentCommentAnchor";
import { COMMENT_MARK_NAME } from "@app/components/editor/document/DocumentComments";
import { DOCUMENT_IMAGE_NODE_NAME } from "@app/components/editor/document/DocumentImage";
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
import type { Mark, Node } from "@tiptap/pm/model";
import { Fragment } from "@tiptap/pm/model";

export const documentSchema = getSchema(documentExtensions);
const documentMarkdown = new MarkdownManager({
  extensions: documentExtensions,
});

/**
 * @cc [owner:flvndvd,label:architecture] document-markdown-capabilities
 * Supported token names MUST derive from the editor extensions' parse and render handlers, plus
 * `TEXT_ONLY_TOKENS`, which carry only text and need no extension.
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

// Whitespace separates blocks, and an escape (`\*`, `\_`, `\~`) is a character the serializer
// escapes in plain text: neither has an editor extension.
const TEXT_ONLY_TOKENS = new Set(["space", "escape"]);

const isSupportedMarkdownToken = (token: MarkdownToken) =>
  token.type !== undefined &&
  (TEXT_ONLY_TOKENS.has(token.type) ||
    supportedMarkdownTokens.has(token.type)) &&
  // Registered list and code handlers still discard task markers and tilde fences.
  !(token.type === "list_item" && token.task) &&
  (token.type !== "code" ||
    token.raw?.startsWith("```") ||
    token.codeBlockStyle === "indented");

/** A Markdown element the editor cannot keep, and the line where its block starts. */
interface UnsupportedMarkdown {
  element: string;
  line: number;
}

const describeUnsupportedToken = (token: MarkdownToken): string => {
  if (token.type === "list_item" && token.task) {
    return "a task list";
  }
  switch (token.type) {
    case "code":
      return token.raw?.trimStart().startsWith("~")
        ? "a code block fenced with ~~~"
        : "an indented code fence";
    case "table":
      return "a table";
    case "html":
      return "HTML";
    case "def":
      return "a reference link definition";
    default:
      return `"${token.type}" Markdown`;
  }
};

/** The line each top-level block of `content` starts on, `firstLine` being its first line. */
const blockLines = <T extends { raw?: string }>(
  blocks: T[],
  firstLine: number
) => {
  let line = firstLine;
  return blocks.map((block) => {
    const start = line;
    line += (block.raw ?? "").split("\n").length - 1;
    return { block, line: start };
  });
};

const findUnsupportedMarkdown = (
  content: string,
  firstLine = 1
): UnsupportedMarkdown | null => {
  for (const { block, line } of blockLines(
    documentMarkdown.instance.lexer(content),
    firstLine
  )) {
    const unsupported: MarkdownToken[] = [];
    documentMarkdown.instance.walkTokens([block], (token) => {
      if (!isSupportedMarkdownToken(token)) {
        unsupported.push(token);
      }
    });
    if (unsupported.length > 0) {
      return { element: describeUnsupportedToken(unsupported[0]), line };
    }
  }
  return null;
};

const hasSupportedMarkdown = (content: string) =>
  findUnsupportedMarkdown(content) === null;

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
  anchorOrder: string[],
  formatting: AnchorFormatting
): Result<string, string> => {
  const { document: anchored, directives } = marksToAnchors(
    document,
    anchorOrder,
    formatting
  );
  return substituteAnchorDirectives(
    documentMarkdown.serialize(anchored),
    directives
  );
};

// TipTap's paragraph parser returns an image alone in its paragraph without the paragraph, as
// for its block image; this editor's image is inline, so it goes back in one.
const imagesInParagraphs = (node: JSONContent): JSONContent => {
  if (!node.content) {
    return node;
  }
  const holdsInline = documentSchema.nodes[node.type ?? ""]?.inlineContent;
  return {
    ...node,
    content: node.content.map((child) =>
      child.type === DOCUMENT_IMAGE_NODE_NAME && !holdsInline
        ? { type: "paragraph", content: [child] }
        : imagesInParagraphs(child)
    ),
  };
};

const parseMarkdown = (markdown: string): JSONContent =>
  imagesInParagraphs(documentMarkdown.parse(markdown));

/** Compares in the editor's form, comment marks included, as the user would reopen it. */
const canRoundTripMarkdown = (document: JSONContent, markdown: string) => {
  const reopened = anchorsToMarks(parseMarkdown(markdown), documentSchema);
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

// Comment marks share one rank, so their order on a text node only records which was added
// first: a comment added around an existing one comes after it, but reopens before it.
const sortCommentMarks = (marks: readonly Mark[]): readonly Mark[] => {
  const comments = marks
    .filter((mark) => mark.type.name === COMMENT_MARK_NAME)
    .sort((a, b) => (String(a.attrs.id) < String(b.attrs.id) ? -1 : 1));
  let next = 0;
  return marks.map((mark) =>
    mark.type.name === COMMENT_MARK_NAME ? comments[next++] : mark
  );
};

/**
 * @cc [owner:tdraier,label:product] document-comment-mark-order
 * Documents that differ only in the order of comment marks on a text MUST compare equal, so a
 * comment added around or over an existing one saves.
 */
export const normalizeTextNodes = (node: Node): Node => {
  if (node.isText) {
    return node.mark(sortCommentMarks(node.marks));
  }
  const children: Node[] = [];
  node.forEach((child) => children.push(normalizeTextNodes(child)));
  return node.copy(Fragment.fromArray(children));
};

const isValidDocument = (document: JSONContent) => {
  try {
    // TipTap opens an empty body as one empty paragraph.
    documentSchema
      .nodeFromJSON(
        document.content?.length
          ? document
          : { ...document, content: [{ type: "paragraph" }] }
      )
      .check();
    return true;
  } catch {
    return false;
  }
};

/**
 * The line of the first block of `content` that saving `document` would not give back the same,
 * or null when it cannot tell.
 */
const firstChangedBlockLine = (
  content: string,
  parsed: JSONContent,
  document: JSONContent,
  anchorOrder: string[],
  firstLine: number
): number | null => {
  try {
    const original = withoutTrailingParagraphs(document);
    const markdown = serializeWithAnchors(original, anchorOrder, "commented");
    if (markdown.isErr()) {
      return null;
    }
    const reopened = anchorsToMarks(
      parseMarkdown(markdown.value),
      documentSchema
    );
    if (reopened.isErr()) {
      return null;
    }
    const before = normalizeTextNodes(documentSchema.nodeFromJSON(original));
    const after = normalizeTextNodes(
      documentSchema.nodeFromJSON(
        withoutTrailingParagraphs(reopened.value.document)
      )
    );
    let changed = -1;
    for (let i = 0; i < before.childCount && changed === -1; i++) {
      if (i >= after.childCount || !before.child(i).eq(after.child(i))) {
        changed = i;
      }
    }
    // Extra blank lines open empty paragraphs, which have no block in the source. Read before the
    // anchors become marks, where a paragraph holding only an anchor is not empty yet.
    const sourceBlocks = parsed.content ?? [];
    const isSourceBlock = (index: number) =>
      sourceBlocks[index]?.type !== "paragraph" ||
      (sourceBlocks[index]?.content?.length ?? 0) > 0;
    if (
      changed === -1 ||
      sourceBlocks.length !== before.childCount ||
      !isSourceBlock(changed)
    ) {
      return null;
    }
    let sourceBlock = 0;
    for (let i = 0; i < changed; i++) {
      if (isSourceBlock(i)) {
        sourceBlock++;
      }
    }
    const blocks = blockLines(
      documentMarkdown.instance.lexer(content),
      firstLine
    ).filter(({ block }) => block.type !== "space");
    return blocks[sourceBlock]?.line ?? null;
  } catch {
    // The serializer or the parser threw on an unknown node: no line to point at.
    return null;
  }
};

/**
 * @cc [owner:flvndvd,label:product] document-source-preservation
 * Markdown containing unsupported tokens or formatting that cannot survive serialization
 * MUST be rejected before editing. Callers MUST retain the original source for display.
 */
/**
 * @cc [owner:tdraier,label:product] document-schema-valid
 * Parsed Markdown that does not satisfy the editor schema MUST be rejected, never handed to the
 * editor, so a file the editor misreads still shows as source.
 */
/**
 * @cc [owner:PopDaph,label:product] document-refusal-reason
 * A refusal MUST name the first element the editor cannot keep and the line its block starts on,
 * or, for Markdown that would not read back the same, the line of the first block that changes
 * when one can be found, counting lines from `firstLine`. A reason MUST NOT quote the content.
 */
export const parseDocumentContent = (
  content: string,
  firstLine = 1
): Result<MarkedDocument, string> => {
  const unsupported = findUnsupportedMarkdown(content, firstLine);
  if (unsupported) {
    return new Err(
      `The Markdown uses formatting the editor cannot keep: ${unsupported.element} at line ${unsupported.line}.`
    );
  }

  let parsed: JSONContent;
  try {
    parsed = parseMarkdown(content);
  } catch {
    return new Err("The Markdown could not be parsed.");
  }

  const marked = anchorsToMarks(parsed, documentSchema);
  if (marked.isErr()) {
    return marked;
  }
  if (!isValidDocument(marked.value.document)) {
    return new Err(
      "The Markdown does not fit the editor's document structure."
    );
  }

  // Opening is only safe when saving the untouched document goes through.
  if (
    serializeDocumentMarkdown(
      marked.value.document,
      marked.value.anchorOrder
    ).isErr()
  ) {
    const line = firstChangedBlockLine(
      content,
      parsed,
      marked.value.document,
      marked.value.anchorOrder,
      firstLine
    );
    return new Err(
      line === null
        ? "The Markdown would not read back the same after editing."
        : `The Markdown would not read back the same after editing, from line ${line}.`
    );
  }

  return marked;
};

const serializeReadingBack = (
  content: JSONContent,
  anchorOrder: string[],
  formatting: AnchorFormatting
): Result<string, string> => {
  // Serializing or re-reading an unknown node throws; either way the document is not writable.
  try {
    const markdown = serializeWithAnchors(content, anchorOrder, formatting);
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

/**
 * @cc [owner:flvndvd,label:product] document-markdown-save
 * Markdown output MUST reopen with the same content and formatting, ignoring empty trailing
 * paragraphs. A failed conversion MUST NOT reach persistence or acknowledge the draft.
 */
/**
 * @cc [owner:tdraier,label:product] document-anchors-in-formatting
 * Comment anchors MUST be written inside the formatting of the text they comment, as agents
 * anchoring a quote write them, whenever that Markdown reads back the same, and with the
 * formatting shared by both sides otherwise.
 */
export const serializeDocumentMarkdown = (
  document: JSONContent,
  anchorOrder: string[] = []
): Result<string, string> => {
  const content = withoutTrailingParagraphs(document);
  const commented = serializeReadingBack(content, anchorOrder, "commented");
  return commented.isOk()
    ? commented
    : serializeReadingBack(content, anchorOrder, "shared");
};

const INLINE_NODE_TYPES = new Set(["text", "hardBreak"]);

const SINGLE_PARAGRAPH_MESSAGE =
  "This suggestion is not text for a single paragraph.";

/**
 * @cc [owner:tdraier,label:product] document-inline-markdown
 * Inline content MUST be read only from Markdown that is one paragraph of text and hard
 * breaks, empty Markdown reading as no content, and refused otherwise. Markdown written for
 * inline content MUST read back as the same content, or be refused.
 */
export const parseInlineMarkdown = (
  markdown: string
): Result<JSONContent[], string> => {
  if (markdown.trim() === "") {
    return new Ok([]);
  }
  if (!hasSupportedMarkdown(markdown)) {
    return new Err("The suggestion uses formatting the editor cannot keep.");
  }
  let parsed: JSONContent;
  try {
    parsed = parseMarkdown(markdown);
  } catch {
    return new Err("The suggestion could not be read.");
  }
  const blocks = withoutTrailingParagraphs(parsed).content ?? [];
  if (blocks.length !== 1 || blocks[0].type !== "paragraph") {
    return new Err(SINGLE_PARAGRAPH_MESSAGE);
  }
  const content = blocks[0].content ?? [];
  if (content.some((node) => !INLINE_NODE_TYPES.has(node.type ?? ""))) {
    return new Err(SINGLE_PARAGRAPH_MESSAGE);
  }
  return new Ok(content);
};

const paragraphOf = (content: JSONContent[]): Node =>
  normalizeTextNodes(
    documentSchema.nodeFromJSON({ type: "paragraph", content })
  );

export const serializeInlineMarkdown = (
  content: JSONContent[]
): Result<string, string> => {
  let markdown: string;
  try {
    markdown = documentMarkdown
      .serialize({ type: "doc", content: [{ type: "paragraph", content }] })
      .replace(/\n+$/, "");
  } catch {
    return new Err("This text cannot be written as Markdown.");
  }
  const reread = parseInlineMarkdown(markdown);
  return reread.isOk() && paragraphOf(reread.value).eq(paragraphOf(content))
    ? new Ok(markdown)
    : new Err("This text would not read back the same as Markdown.");
};
