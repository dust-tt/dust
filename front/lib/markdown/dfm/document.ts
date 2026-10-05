import { scanAnchors } from "@app/lib/markdown/dfm/anchors";
import {
  parseAnnotationsBlock,
  serializeAnnotationsBlock,
  validateComments,
} from "@app/lib/markdown/dfm/annotations";
import {
  ANNOTATIONS_CLOSE,
  ANNOTATIONS_OPEN_PATTERN,
  FRONT_MATTER_FENCE,
} from "@app/lib/markdown/dfm/grammar";
import { codeLines, endsInsideFence } from "@app/lib/markdown/dfm/parser";
import type { DfmDocument, DfmError } from "@app/lib/markdown/dfm/types";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import isEqual from "lodash/isEqual";

/**
 * Whole-file layout: optional front matter, then the body, then the optional annotations
 * block. Parsing splits the file; serializing joins the blocks back with one blank line
 * between them. Every rule the parser applies has its mirror in validateForSerialization.
 */

function isLine(line: string | undefined, token: string): boolean {
  return line !== undefined && line.trimEnd() === token;
}

/** Index of the first line equal to `token` from `from`, skipping lines inside code. */
function findLine(
  lines: string[],
  inCode: boolean[],
  token: string,
  from: number
): number {
  for (let i = from; i < lines.length; i++) {
    if (!inCode[i] && isLine(lines[i], token)) {
      return i;
    }
  }
  return -1;
}

/** Lines opening an annotations block, with whatever follows the name, outside code. */
function annotationOpeners(
  lines: string[],
  inCode: boolean[]
): { index: number; rest: string }[] {
  const openers: { index: number; rest: string }[] = [];
  lines.forEach((line, index) => {
    const match = inCode[index]
      ? null
      : ANNOTATIONS_OPEN_PATTERN.exec(line.trimEnd());
    if (match) {
      openers.push({ index, rest: match[1] });
    }
  });
  return openers;
}

/** Front matter closes on the first later `---` line, fenced or not, since YAML has no fences. */
function frontMatterClose(lines: string[]): number {
  return lines.findIndex(
    (line, index) => index > 0 && isLine(line, FRONT_MATTER_FENCE)
  );
}

/**
 * @cc [owner:PopDaph,label:product] dfm-body-opaque
 * Parsing MUST return the body verbatim, except for the front matter block and the single blank
 * line after it, the trailing annotations block and the blank lines before it, trailing
 * newlines, a leading UTF-8 byte order mark, and CRLF line endings normalized to LF. Markdown and directives the codec does not
 * define MUST pass through untouched. Fence lines, directive lines and anchors inside fenced
 * code or inline code MUST be treated as text. A leading `---` line with no closing fence MUST
 * be body, not front matter.
 */
/**
 * @cc [owner:PopDaph,label:product] dfm-strict-parse
 * Malformed anchors, a malformed annotations block, unknown directives or attributes inside
 * that block or on an anchor, a carriage return outside a line ending, and an annotations block
 * that is not the last block MUST fail with an error locating the offending line when known. Parsing MUST NOT return a partial document. A
 * comment thread without an anchor is valid. An anchor without a comment thread is not.
 */
export function parseDfm(source: string): Result<DfmDocument, DfmError> {
  const lines = source
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .split("\n");
  const carriageReturn = lines.findIndex((line) => line.includes("\r"));
  if (carriageReturn !== -1) {
    return new Err({
      message: "Carriage return outside a line ending.",
      line: carriageReturn + 1,
    });
  }
  let frontMatter: string | null = null;
  let bodyStart = 0;

  if (isLine(lines[0], FRONT_MATTER_FENCE)) {
    const close = frontMatterClose(lines);
    if (close !== -1) {
      frontMatter = lines.slice(1, close).join("\n");
      bodyStart = close + 1;
      if (lines[bodyStart] === "") {
        bodyStart++;
      }
    }
  }

  // Front matter is YAML, so code is only tracked from the body on.
  const inCode = [
    ...new Array<boolean>(bodyStart).fill(false),
    ...codeLines(lines.slice(bodyStart)),
  ];

  let bodyEnd = lines.length;
  let annotationLines: string[] = [];
  let annotationInCode: boolean[] = [];
  let annotationsLineNumber = 0;
  const openers = annotationOpeners(lines, inCode).filter(
    (opener) => opener.index >= bodyStart
  );
  const opener = openers[openers.length - 1];
  if (opener !== undefined) {
    const open = opener.index;
    if (opener.rest.trim() !== "") {
      return new Err({
        message: "The annotations block opener takes no attributes.",
        line: open + 1,
      });
    }
    const close = findLine(lines, inCode, ANNOTATIONS_CLOSE, open + 1);
    if (close === -1) {
      return new Err({
        message: "Unterminated annotations block.",
        line: open + 1,
      });
    }
    const trailing = lines.findIndex(
      (line, index) => index > close && line.trim() !== ""
    );
    if (trailing !== -1) {
      return new Err({
        message: "Content after the annotations block.",
        line: trailing + 1,
      });
    }
    bodyEnd = open;
    annotationLines = lines.slice(open + 1, close);
    annotationInCode = inCode.slice(open + 1, close);
    annotationsLineNumber = open + 2;
  }

  const bodyLines = lines.slice(bodyStart, bodyEnd);
  const earlierOpen = openers.find((candidate) => candidate.index < bodyEnd);
  if (earlierOpen !== undefined) {
    return new Err({
      message: "Annotations block must be the last block of the file.",
      line: earlierOpen.index + 1,
    });
  }
  while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1] === "") {
    bodyLines.pop();
  }
  const body = bodyLines.join("\n");

  const anchors = scanAnchors(body, bodyStart);
  if (anchors.isErr()) {
    return anchors;
  }

  const comments = parseAnnotationsBlock(
    annotationLines,
    annotationInCode,
    annotationsLineNumber
  );
  if (comments.isErr()) {
    return comments;
  }

  const threadIds = new Set(comments.value.map((comment) => comment.id));
  const orphan = anchors.value.anchors.find(
    (anchor) => !threadIds.has(anchor.id)
  );
  if (orphan) {
    return new Err({
      message: `Comment anchor "${orphan.id}" has no comment thread.`,
      line: orphan.line,
    });
  }

  return new Ok({ frontMatter, body, comments: comments.value });
}

function validateForSerialization(document: DfmDocument): DfmError | null {
  const { frontMatter, body, comments } = document;

  if (frontMatter !== null && frontMatter.includes("\r")) {
    return { message: "Front matter cannot contain a carriage return." };
  }
  if (
    frontMatter !== null &&
    frontMatter.split("\n").some((line) => isLine(line, FRONT_MATTER_FENCE))
  ) {
    return { message: "Front matter cannot contain a fence line." };
  }
  if (body.includes("\r")) {
    return { message: "Body cannot contain a carriage return." };
  }
  const bodyLines = body.split("\n");
  if (annotationOpeners(bodyLines, codeLines(bodyLines)).length > 0) {
    return { message: "Body cannot contain an annotations block opener." };
  }
  if (body.endsWith("\n")) {
    return { message: "Body cannot end with a newline." };
  }
  if (comments.length > 0 && endsInsideFence(body)) {
    return { message: "Body cannot end inside a code fence." };
  }

  const anchors = scanAnchors(body, 0);
  if (anchors.isErr()) {
    return anchors.error;
  }

  const commentsError = validateComments(comments);
  if (commentsError) {
    return commentsError;
  }

  const ids = new Set(comments.map((comment) => comment.id));
  const orphan = anchors.value.anchors.find((anchor) => !ids.has(anchor.id));
  if (orphan) {
    return { message: `Comment anchor "${orphan.id}" has no comment thread.` };
  }

  return null;
}

/**
 * @cc [owner:PopDaph,label:product] dfm-round-trip
 * Serializing a document and parsing the result MUST yield an equal document, and parsing a
 * serialized source then serializing it again MUST yield the identical source. A document that
 * cannot satisfy this, such as a message body containing a directive line or an unclosed code
 * fence, MUST be rejected instead of written.
 */
export function serializeDfm(document: DfmDocument): Result<string, DfmError> {
  const error = validateForSerialization(document);
  if (error) {
    return new Err(error);
  }

  const { frontMatter, body, comments } = document;
  const blocks: string[] = [];
  if (frontMatter !== null) {
    blocks.push(`${FRONT_MATTER_FENCE}\n${frontMatter}\n${FRONT_MATTER_FENCE}`);
  }
  if (body !== "") {
    blocks.push(body);
  }
  if (comments.length > 0) {
    blocks.push(serializeAnnotationsBlock(comments));
  }
  const source = blocks.length === 0 ? "" : `${blocks.join("\n\n")}\n`;

  // Front matter closes on any later fence line, wherever it stands in the file.
  const lines = source.split("\n");
  if (
    frontMatter === null &&
    isLine(lines[0], FRONT_MATTER_FENCE) &&
    frontMatterClose(lines) !== -1
  ) {
    return new Err({
      message:
        "Body cannot start with a front matter fence when a later line is one.",
    });
  }

  // The guards above give precise messages; this is the contract itself, checked last.
  const reparsed = parseDfm(source);
  if (reparsed.isErr() || !isEqual(reparsed.value, document)) {
    return new Err({
      message: "Document cannot be written so that it reads back unchanged.",
    });
  }

  return new Ok(source);
}
