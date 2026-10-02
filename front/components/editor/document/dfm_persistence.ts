import {
  parseDocumentContent,
  serializeDocumentMarkdown,
} from "@app/components/editor/document/content";
import type { DfmComment, DfmError } from "@app/lib/markdown/dfm";
import { extractAnchors, parseDfm, serializeDfm } from "@app/lib/markdown/dfm";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { JSONContent } from "@tiptap/core";

/**
 * The editor edits the body of a DFM file. Front matter and comment threads ride along
 * unchanged until the editor learns them.
 */
export interface DfmEnvelope {
  frontMatter: string | null;
  comments: DfmComment[];
}

const CODEC_SAVE_ERROR_MESSAGE =
  "This document cannot be saved as written. Your changes are still here. Undo the last edit to try again.";

/** A codec error as shown in the read-only view, with its line when it has one. */
function describe(error: DfmError): string {
  return error.line === undefined
    ? error.message
    : `${error.message} (line ${error.line})`;
}

export interface LoadedDfm {
  envelope: DfmEnvelope;
  /** The body as a TipTap document. */
  content: JSONContent;
}

/**
 * @cc [owner:PopDaph,label:product] document-dfm-load
 * A file MUST open for editing only when it is valid DFM, its body carries no comment anchor,
 * and its body is Markdown the editor can reproduce. Any other file MUST be refused with a
 * reason, so the editor shows it read-only with that reason instead of risking the content.
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
  if (anchors.value.anchors.length > 0) {
    return new Err("Comments are not supported in the editor yet.");
  }

  const content = parseDocumentContent(body);
  if (content.isErr()) {
    return content;
  }

  return new Ok({
    envelope: { frontMatter, comments },
    content: content.value,
  });
}

/**
 * @cc [owner:PopDaph,label:product] document-dfm-save
 * Saving MUST write the editor's body back into the file's envelope, with front matter and
 * comment threads exactly as loaded. A body the editor cannot express as Markdown, or a file
 * the codec refuses to write, MUST fail without reaching persistence.
 */
export function saveDfm(
  envelope: DfmEnvelope,
  content: JSONContent
): Result<string, string> {
  const markdown = serializeDocumentMarkdown(content);
  if (markdown.isErr()) {
    return new Err(
      "This formatting cannot be saved as Markdown yet. Your changes are still here. Undo the last edit to try again."
    );
  }

  const serialized = serializeDfm({
    frontMatter: envelope.frontMatter,
    body: markdown.value.replace(/\n+$/, ""),
    comments: envelope.comments,
  });
  if (serialized.isErr()) {
    // The codec's reason names file syntax; the user sees the draft is safe and how to recover.
    return new Err(CODEC_SAVE_ERROR_MESSAGE);
  }

  return new Ok(serialized.value);
}
