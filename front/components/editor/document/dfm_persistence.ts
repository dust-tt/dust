import {
  parseDocumentContent,
  serializeDocumentMarkdown,
} from "@app/components/editor/document/content";
import { getMarkedCommentIds } from "@app/components/editor/document/DocumentCommentAnchor";
import {
  getDocumentJSONComments,
  withDocumentJSONComments,
  withoutDocumentJSONComments,
} from "@app/components/editor/document/DocumentComments";
import type { DfmComment, DfmError } from "@app/lib/markdown/dfm";
import { extractAnchors, parseDfm, serializeDfm } from "@app/lib/markdown/dfm";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { JSONContent } from "@tiptap/core";

/**
 * The editor edits the body and the comment threads of a DFM file. Front matter rides along
 * unchanged until the editor learns it.
 */
export interface DfmEnvelope {
  frontMatter: string | null;
  /** The file's anchor directives in their order, so saves keep it where nothing changed. */
  anchorOrder: string[];
}

const CODEC_SAVE_ERROR_MESSAGE =
  "This document cannot be saved as written. Your changes are still here. Undo the last edit to try again.";

/** A codec error as shown in the read-only view, with its line when it has one. */
function describe(error: DfmError): string {
  return error.line === undefined
    ? error.message
    : `${error.message} (line ${error.line})`;
}

// The refusals the editor writes, which name only elements and comment ids. A codec error can
// quote the file, such as a malformed attribute.
const EDITOR_REFUSALS = [
  /^The Markdown uses formatting the editor cannot keep: [^\n]+\.$/,
  /^The Markdown could not be parsed\.$/,
  /^The Markdown does not fit the editor's document structure\.$/,
  /^The Markdown would not read back the same after editing\.$/,
  /^A comment is anchored where the editor cannot show it\.$/,
  /^Comment "[\w-]+" (starts or ends on text the editor cannot highlight|covers no text the editor can highlight)\.$/,
  /^Comment anchor "[\w-]+" is (not paired|never closed) where the editor reads it\.$/,
];

/**
 * @cc [owner:PopDaph,label:security;product] document-refusal-loggable
 * A refusal reason MUST reach logs only when it is one the editor writes, which never quotes the
 * file; any other reason MUST be logged as not valid DFM.
 */
export function loggableRefusal(reason: string): string {
  return EDITOR_REFUSALS.some((pattern) => pattern.test(reason))
    ? reason
    : "The file is not valid DFM.";
}

export interface LoadedDfm {
  envelope: DfmEnvelope;
  /** The body as a TipTap document, comment threads in its `comments` attribute. */
  content: JSONContent;
}

const sameIds = (a: Set<string>, b: Set<string>) =>
  a.size === b.size && [...a].every((id) => b.has(id));

/**
 * @cc [owner:PopDaph;tdraier,label:product] document-dfm-load
 * A file MUST open for editing only when it is valid DFM, its body is Markdown the editor can
 * reproduce, and every comment anchor the codec reads becomes a comment mark in the editor and
 * no other. The threads MUST open as they are in the file. Any other file MUST be refused with
 * a reason, so the editor shows it read-only instead of risking the content.
 */
export function loadDfm(source: string): Result<LoadedDfm, string> {
  const parsed = parseDfm(source);
  if (parsed.isErr()) {
    return new Err(describe(parsed.error));
  }
  const { frontMatter, body, comments } = parsed.value;

  const anchors = extractAnchors(body);
  if (anchors.isErr()) {
    return new Err(describe(anchors.error));
  }

  const content = parseDocumentContent(body);
  if (content.isErr()) {
    return content;
  }
  const { document, anchorOrder } = content.value;

  // An anchor the codec reads but the Markdown parser does not, such as one inside a link
  // destination, would be dropped on save.
  if (
    !sameIds(
      new Set(anchors.value.anchors.map((anchor) => anchor.id)),
      getMarkedCommentIds(document)
    )
  ) {
    return new Err("A comment is anchored where the editor cannot show it.");
  }

  return new Ok({
    envelope: { frontMatter, anchorOrder },
    content: withDocumentJSONComments(document, comments),
  });
}

/**
 * @cc [owner:PopDaph;tdraier,label:product] document-dfm-save
 * Saving MUST write the editor's body and its comment threads back into the file's envelope,
 * with front matter exactly as loaded and each comment mark written as one anchor pair, anchors
 * meeting at one place in the order the file had them. A body
 * the editor cannot express as Markdown, or a file the codec refuses to write, MUST fail
 * without reaching persistence.
 */
export function saveDfm(
  envelope: DfmEnvelope,
  content: JSONContent
): Result<string, string> {
  const markdown = serializeDocumentMarkdown(
    withoutDocumentJSONComments(content),
    envelope.anchorOrder
  );
  if (markdown.isErr()) {
    return new Err(
      "This formatting cannot be saved as Markdown yet. Your changes are still here. Undo the last edit to try again."
    );
  }

  const serialized = serializeDfm({
    frontMatter: envelope.frontMatter,
    body: markdown.value.replace(/\n+$/, ""),
    comments: getDocumentJSONComments(content),
  });
  if (serialized.isErr()) {
    // The codec's reason names file syntax; the user sees the draft is safe and how to recover.
    return new Err(CODEC_SAVE_ERROR_MESSAGE);
  }

  return new Ok(serialized.value);
}

/**
 * @cc [owner:tdraier,label:product] document-comment-writable
 * A thread MUST be accepted only when the codec can write it on its own and read it back
 * unchanged. The document's comments attribute throws on a thread the codec refuses, so a
 * thread MUST pass this check before any transaction carries it, even one only previewed.
 */
export function isWritableThread(comment: DfmComment): boolean {
  return serializeDfm({
    frontMatter: null,
    body: "",
    comments: [comment],
  }).isOk();
}
