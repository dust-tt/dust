import {
  ANNOTATIONS_CLOSE,
  ANNOTATIONS_OPEN,
  DIRECTIVE_PREFIX,
  isValidId,
  LEAF_DIRECTIVE_PATTERN,
  parseAttributes,
  requiredString,
  validateAttributes,
} from "@app/lib/markdown/dfm/grammar";
import {
  checkInputBounds,
  codeLines,
  endsInsideFence,
} from "@app/lib/markdown/dfm/parser";
import type {
  DfmAuthor,
  DfmAuthorKind,
  DfmComment,
  DfmCommentStatus,
  DfmError,
  DfmMessage,
} from "@app/lib/markdown/dfm/types";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { z } from "zod";

/**
 * The `:::annotations` block at the end of a file: `::comment` and `::message` leaf
 * directives, each message followed by its Markdown body until the next directive. The
 * grammar of both directives lives here: value rules, one strict schema each, and the
 * builders that write them back, so a value is legal in one direction exactly when it is
 * legal in the other. Error messages are written for the person or agent who wrote the file.
 */

const AUTHOR_ID_PATTERN = /^[^\s"{}]+$/;
const INVALID_NAME_PATTERN = /["}\r\n]/;
const TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-](\d{2}):(\d{2}))$/;

const AUTHOR_KINDS = [
  "user",
  "agent",
] as const satisfies readonly DfmAuthorKind[];
const COMMENT_STATUSES = [
  "open",
  "resolved",
] as const satisfies readonly DfmCommentStatus[];

function isAuthorKind(value: string): value is DfmAuthorKind {
  return AUTHOR_KINDS.some((kind) => kind === value);
}

function isValidAuthorId(value: string): boolean {
  return AUTHOR_ID_PATTERN.test(value);
}

/** Display names go in a quoted attribute, so quotes, braces and line breaks are out. */
function isValidName(value: string): boolean {
  return value !== "" && !INVALID_NAME_PATTERN.test(value);
}

/** ISO 8601 with seconds and a zone, and a real calendar date. */
function isValidTimestamp(value: string): boolean {
  const match = TIMESTAMP_PATTERN.exec(value);
  if (!match) {
    return false;
  }
  const [year, month, day, hour, minute, second] = match
    .slice(1, 7)
    .map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const offsetValid =
    match[7] === undefined || (Number(match[7]) < 24 && Number(match[8]) < 60);
  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth &&
    hour < 24 &&
    minute < 60 &&
    second < 60 &&
    offsetValid
  );
}

const commentAttributesSchema = z
  .object({
    id: requiredString("Comment without a valid id.").refine(
      isValidId,
      "Comment without a valid id."
    ),
    status: z.enum(COMMENT_STATUSES, {
      errorMap: () => ({ message: "Comment without a valid status." }),
    }),
  })
  .strict();

const authorSchema = requiredString(
  'Message author must be "<kind>:<id>".'
).transform((value, context): Pick<DfmAuthor, "kind" | "id"> => {
  const separator = value.indexOf(":");
  if (separator <= 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Message author must be "<kind>:<id>".',
    });
    return z.NEVER;
  }
  const kind = value.slice(0, separator);
  const id = value.slice(separator + 1);
  if (!isAuthorKind(kind)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Unknown author kind "${kind}".`,
    });
    return z.NEVER;
  }
  if (!isValidAuthorId(id)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Invalid author id.",
    });
    return z.NEVER;
  }
  return { kind, id };
});

export const messageAttributesSchema = z
  .object({
    author: authorSchema,
    name: requiredString("Message without a valid author name.").refine(
      isValidName,
      "Message without a valid author name."
    ),
    at: requiredString("Message without a valid timestamp.").refine(
      isValidTimestamp,
      "Message without a valid timestamp."
    ),
  })
  .strict();

/** The attribute record a message writes, validated before serialization. */
function messageAttributes(
  author: DfmAuthor,
  createdAt: string
): Record<"author" | "name" | "at", string> {
  return {
    author: `${author.kind}:${author.id}`,
    name: author.name,
    at: createdAt,
  };
}

function commentDirective(comment: Pick<DfmComment, "id" | "status">): string {
  return `::comment{id=${comment.id} status=${comment.status}}`;
}

function messageDirective(
  message: Pick<DfmMessage, "author" | "createdAt">
): string {
  const { author, name, at } = messageAttributes(
    message.author,
    message.createdAt
  );
  return `::message{author=${author} name="${name}" at=${at}}`;
}

function trimBlankLines(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === "") {
    start++;
  }
  while (end > start && lines[end - 1].trim() === "") {
    end--;
  }
  return lines.slice(start, end);
}

type Directive =
  | { name: "comment"; attributes: z.infer<typeof commentAttributesSchema> }
  | { name: "message"; attributes: z.infer<typeof messageAttributesSchema> };

function parseDirectiveLine(
  line: string,
  lineNumber: number
): Result<Directive, DfmError> {
  const match = LEAF_DIRECTIVE_PATTERN.exec(line);
  if (!match) {
    return new Err({ message: "Malformed directive.", line: lineNumber });
  }
  const [, name, raw] = match;

  if (name === "comment") {
    const attributes = parseAttributes(raw, commentAttributesSchema);
    return attributes.isErr()
      ? new Err({ message: attributes.error, line: lineNumber })
      : new Ok({ name, attributes: attributes.value });
  }
  if (name === "message") {
    const attributes = parseAttributes(raw, messageAttributesSchema);
    return attributes.isErr()
      ? new Err({ message: attributes.error, line: lineNumber })
      : new Ok({ name, attributes: attributes.value });
  }
  return new Err({
    message: `Unknown directive "${name}" in annotations block.`,
    line: lineNumber,
  });
}

interface PendingMessage {
  author: DfmAuthor;
  createdAt: string;
  bodyLines: string[];
}

/**
 * Parses the lines between the block fences. `fenced` flags the lines inside code fences,
 * which are always message text. `firstLineNumber` is the source line of `lines[0]`.
 */
export function parseAnnotationsBlock(
  lines: string[],
  fenced: boolean[],
  firstLineNumber: number
): Result<DfmComment[], DfmError> {
  const comments: DfmComment[] = [];
  const ids = new Set<string>();
  let current: { comment: DfmComment; line: number } | null = null;
  let pending: PendingMessage | null = null;

  const flush = () => {
    if (current && pending) {
      current.comment.messages.push({
        author: pending.author,
        createdAt: pending.createdAt,
        body: trimBlankLines(pending.bodyLines).join("\n"),
      });
      pending = null;
    }
  };

  const emptyComment = (): DfmError | null =>
    current && current.comment.messages.length === 0
      ? {
          message: `Comment "${current.comment.id}" has no message.`,
          line: current.line,
        }
      : null;

  for (const [index, line] of lines.entries()) {
    const lineNumber = firstLineNumber + index;

    if (fenced[index] || !line.startsWith(DIRECTIVE_PREFIX)) {
      if (pending) {
        pending.bodyLines.push(line);
      } else if (line.trim() !== "") {
        return new Err({
          message: "Text outside a comment message.",
          line: lineNumber,
        });
      }
      continue;
    }

    const directive = parseDirectiveLine(line, lineNumber);
    if (directive.isErr()) {
      return directive;
    }

    if (directive.value.name === "comment") {
      flush();
      const empty = emptyComment();
      if (empty) {
        return new Err(empty);
      }
      const { id, status } = directive.value.attributes;
      if (ids.has(id)) {
        return new Err({
          message: `Duplicate comment "${id}".`,
          line: lineNumber,
        });
      }
      ids.add(id);
      current = { comment: { id, status, messages: [] }, line: lineNumber };
      comments.push(current.comment);
      continue;
    }

    if (!current) {
      return new Err({
        message: "Message outside a comment.",
        line: lineNumber,
      });
    }
    flush();
    const { author, name, at } = directive.value.attributes;
    pending = { author: { ...author, name }, createdAt: at, bodyLines: [] };
  }

  flush();
  const empty = emptyComment();
  if (empty) {
    return new Err(empty);
  }

  return new Ok(comments);
}

function serializeMessage(message: DfmMessage): string {
  const directive = messageDirective(message);
  return message.body === ""
    ? `\n${directive}\n`
    : `\n${directive}\n\n${message.body}\n`;
}

function serializeComment(comment: DfmComment): string {
  return (
    `${commentDirective(comment)}\n` +
    comment.messages.map(serializeMessage).join("")
  );
}

/** The whole block, fences included, without a trailing newline. Comments must be validated. */
export function serializeAnnotationsBlock(comments: DfmComment[]): string {
  return `${ANNOTATIONS_OPEN}\n${comments.map(serializeComment).join("\n")}${ANNOTATIONS_CLOSE}`;
}

/** The message's attributes go through the same schema as on parse; its body has its own rules. */
function validateMessage(
  commentId: string,
  message: DfmMessage
): DfmError | null {
  const { author, createdAt, body } = message;
  const attributes = validateAttributes(
    messageAttributes(author, createdAt),
    messageAttributesSchema
  );
  if (attributes.isErr()) {
    return { message: `Comment "${commentId}": ${attributes.error}` };
  }
  if (body.includes("\r")) {
    return {
      message: `Message body on comment "${commentId}" cannot contain a carriage return.`,
    };
  }
  const bounds = checkInputBounds(body);
  if (bounds) {
    return {
      message: `Message body on comment "${commentId}": ${bounds.message}`,
    };
  }
  const lines = body.split("\n");
  if (endsInsideFence(body)) {
    return {
      message: `Message body on comment "${commentId}" cannot end inside a code fence.`,
    };
  }
  const inCode = codeLines(lines);
  const directiveLine = lines.find(
    (line, index) => !inCode[index] && line.startsWith(DIRECTIVE_PREFIX)
  );
  if (directiveLine !== undefined) {
    return {
      message: `Message body on comment "${commentId}" cannot contain a directive line.`,
    };
  }
  if (trimBlankLines(lines).join("\n") !== body) {
    return {
      message: `Message body on comment "${commentId}" cannot start or end with blank lines.`,
    };
  }
  return null;
}

/** Checks that every comment can be written and read back unchanged. */
export function validateComments(comments: DfmComment[]): DfmError | null {
  const ids = new Set<string>();
  for (const comment of comments) {
    const attributes = validateAttributes(
      { id: comment.id, status: comment.status },
      commentAttributesSchema
    );
    if (attributes.isErr()) {
      return { message: `Comment "${comment.id}": ${attributes.error}` };
    }
    if (ids.has(comment.id)) {
      return { message: `Duplicate comment "${comment.id}".` };
    }
    ids.add(comment.id);
    if (comment.messages.length === 0) {
      return { message: `Comment "${comment.id}" has no message.` };
    }
    for (const message of comment.messages) {
      const error = validateMessage(comment.id, message);
      if (error) {
        return error;
      }
    }
  }
  return null;
}
