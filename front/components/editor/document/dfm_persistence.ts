import {
  parseDocumentContent,
  serializeDocumentMarkdown,
} from "@app/components/editor/document/content";
import type { DfmComment } from "@app/lib/markdown/dfm";
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

export interface LoadedDfm {
  envelope: DfmEnvelope;
  /** The body as a TipTap document. */
  content: JSONContent;
}

/**
 * @cc [owner:PopDaph,label:product] document-dfm-load
 * A file MUST open for editing only when it is valid DFM, its body carries no comment anchor,
 * and its body is Markdown the editor can reproduce. Any other file MUST be refused with a
 * reason, so the host can fall back to a plain editor instead of risking the content.
 */
export function loadDfm(source: string): Result<LoadedDfm, string> {
  const parsed = parseDfm(source);
  if (parsed.isErr()) {
    return new Err(parsed.error.message);
  }
  const { frontMatter, body, comments } = parsed.value;

  const anchors = extractAnchors(body);
  if (anchors.isErr()) {
    return new Err(anchors.error.message);
  }
  if (anchors.value.anchors.length > 0) {
    return new Err("Comments are not supported in the editor yet.");
  }

  const content = parseDocumentContent(body, "markdown");
  if (!content.ok) {
    return new Err(
      "This document includes formatting that isn't supported yet."
    );
  }

  return new Ok({
    envelope: { frontMatter, comments },
    content: content.content,
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
  if (markdown === null) {
    return new Err(
      "This formatting cannot be saved as Markdown yet. Your changes are still here. Undo the last edit to try again."
    );
  }

  const serialized = serializeDfm({
    frontMatter: envelope.frontMatter,
    body: markdown.replace(/\n+$/, ""),
    comments: envelope.comments,
  });
  if (serialized.isErr()) {
    return new Err(serialized.error.message);
  }

  return new Ok(serialized.value);
}
