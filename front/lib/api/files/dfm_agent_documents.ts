import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { readStoredText } from "@app/lib/api/files/dfm_comment_signatures";
import { writeCanonicalFileContent } from "@app/lib/api/files/file_system_ops";
import type { Authenticator } from "@app/lib/auth";
import type { DfmDocument } from "@app/lib/markdown/dfm";
import { extractAnchors, parseDfm, serializeDfm } from "@app/lib/markdown/dfm";
import { contentTypeFromFileName } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

const MAX_WRITE_ATTEMPTS = 3;

export type DfmAgentDocumentErrorCode =
  | "not_markdown"
  | "not_found"
  | "invalid_document"
  | "string_not_found"
  | "outside_body"
  | "unexpected_count"
  | "anchors_changed"
  | "conflict"
  | "refused"
  | "storage_failed";

export class DfmAgentDocumentError extends Error {
  constructor(
    readonly code: DfmAgentDocumentErrorCode,
    message: string
  ) {
    super(message);
  }
}

function fileSystemError(error: {
  code: string;
  message: string;
}): DfmAgentDocumentError {
  return new DfmAgentDocumentError(
    error.code === "internal" ? "storage_failed" : "refused",
    error.message
  );
}

function checkMarkdownPath(
  scopedPath: string
): Result<string, DfmAgentDocumentError> {
  const resolvedPath = DustFileSystem.resolveScopedPath(scopedPath);
  if (resolvedPath.isErr()) {
    return new Err(fileSystemError(resolvedPath.error));
  }
  if (contentTypeFromFileName(resolvedPath.value) !== "text/markdown") {
    return new Err(
      new DfmAgentDocumentError(
        "not_markdown",
        "Only Markdown documents can be read or edited with this tool."
      )
    );
  }
  return new Ok(resolvedPath.value);
}

function parseDocument(
  text: string
): Result<DfmDocument, DfmAgentDocumentError> {
  const document = parseDfm(text);
  if (document.isErr()) {
    const { message, line } = document.error;
    return new Err(
      new DfmAgentDocumentError(
        "invalid_document",
        line === undefined ? message : `Line ${line}: ${message}`
      )
    );
  }
  return document;
}

function countOccurrences(text: string, search: string): number {
  let count = 0;
  for (
    let index = text.indexOf(search);
    index !== -1;
    index = text.indexOf(search, index + search.length)
  ) {
    count++;
  }
  return count;
}

function replaceInBody({
  text,
  body,
  oldString,
  newString,
  expectedReplacements,
}: {
  text: string;
  body: string;
  oldString: string;
  newString: string;
  expectedReplacements: number;
}): Result<
  { editedBody: string; replacements: number },
  DfmAgentDocumentError
> {
  // An empty `oldString` matches nowhere and everywhere, so it only writes an empty body.
  if (oldString === "") {
    if (expectedReplacements !== 1) {
      return new Err(
        new DfmAgentDocumentError(
          "unexpected_count",
          `Expected ${expectedReplacements} replacements, but an empty text to replace makes exactly one.`
        )
      );
    }
    return body.trim() === ""
      ? new Ok({ editedBody: newString, replacements: 1 })
      : new Err(
          new DfmAgentDocumentError(
            "string_not_found",
            "The text to replace can only be empty when the document body is empty."
          )
        );
  }

  const occurrences = countOccurrences(body, oldString);
  if (occurrences === 0) {
    return new Err(
      countOccurrences(text, oldString) > 0
        ? new DfmAgentDocumentError(
            "outside_body",
            "The text to replace is outside the document body. Only the body can be edited; " +
              "use the comment tools for comment threads."
          )
        : new DfmAgentDocumentError(
            "string_not_found",
            "The text to replace was not found. The document may have changed: read it again " +
              "and retry with its exact current text."
          )
    );
  }
  if (occurrences !== expectedReplacements) {
    return new Err(
      new DfmAgentDocumentError(
        "unexpected_count",
        `Expected ${expectedReplacements} replacements, but found ${occurrences} occurrences.`
      )
    );
  }

  // `split`/`join` rather than `replaceAll`, which would expand `$&`-style patterns in newString.
  return new Ok({
    editedBody: body.split(oldString).join(newString),
    replacements: occurrences,
  });
}

function anchorIds(body: string): string[] | null {
  const anchors = extractAnchors(body);
  return anchors.isOk()
    ? anchors.value.anchors.map(({ id }) => id).sort()
    : null;
}

/**
 * @cc [owner:tdraier,label:product] dfm-agent-document-read
 * Reading MUST return the full DFM source of the document that `editAgentDocument` matches
 * against, front matter, comment anchors and annotations block included, and MUST refuse a file
 * whose name does not map to `text/markdown` or that the codec cannot parse.
 */
export async function readAgentDocument(
  dustFs: DustFileSystem,
  scopedPath: string
): Promise<Result<{ source: string }, DfmAgentDocumentError>> {
  const markdownPath = checkMarkdownPath(scopedPath);
  if (markdownPath.isErr()) {
    return markdownPath;
  }

  // TODO(YJS): when a live session holds this document, read it from the collab service
  // (`GET /internal/documents/read`) instead: the file lags the session until its next
  // checkpoint, and `editAgentDocument` would then match against the session's text.
  const read = await readStoredText(dustFs, scopedPath);
  if (read.isErr()) {
    return new Err(fileSystemError(read.error));
  }
  if (read.value === null) {
    return new Err(
      new DfmAgentDocumentError("not_found", `File not found: ${scopedPath}`)
    );
  }

  const document = parseDocument(read.value.text);
  if (document.isErr()) {
    return document;
  }
  return new Ok({ source: read.value.text });
}

/**
 * @cc [owner:tdraier,label:product;concurrency] dfm-agent-document-edit
 * An edit MUST replace exactly `expectedReplacements` occurrences of `oldString` in the body of
 * the source `readAgentDocument` returns, or, with an empty `oldString`, write `newString` as
 * the body of a document whose body is empty or blank, and refuse an empty `oldString` otherwise
 * or with `expectedReplacements` other than 1.
 * Line breaks in the source and `oldString` MUST be matched normalized to `\n`, so a passage
 * quoted from a CRLF source still matches; they MAY be normalized to `\n` and trailing ones
 * dropped from the edited body. It MUST
 * leave the front matter, the comment threads and the set of comment anchors unchanged,
 * refusing otherwise. The write MUST be conditional on the revision read, and a file whose
 * storage returns no revision MUST be refused; on a conflict it MUST start over from a fresh
 * read, and give up with `conflict` after `MAX_WRITE_ATTEMPTS`, never overwriting a concurrent
 * write.
 */
export async function editAgentDocument(
  auth: Authenticator,
  dustFs: DustFileSystem,
  {
    scopedPath,
    oldString,
    newString,
    expectedReplacements,
  }: {
    scopedPath: string;
    oldString: string;
    newString: string;
    expectedReplacements: number;
  }
): Promise<Result<{ replacements: number }, DfmAgentDocumentError>> {
  const markdownPath = checkMarkdownPath(scopedPath);
  if (markdownPath.isErr()) {
    return markdownPath;
  }

  // TODO(YJS): when a live session holds this document, send the edit to the collab service
  // (`POST /internal/documents/edit`) instead of writing the file, so it reaches open editors as
  // one Yjs transaction with the agent's cursor. Decide under the per-file lock, so a session
  // opening while this write is in flight cannot miss it, and pass an idempotency key so a
  // retried tool call is applied once.
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    const read = await readStoredText(dustFs, scopedPath);
    if (read.isErr()) {
      return new Err(fileSystemError(read.error));
    }
    if (read.value === null) {
      return new Err(
        new DfmAgentDocumentError("not_found", `File not found: ${scopedPath}`)
      );
    }
    const { text, revision } = read.value;
    // Without a revision the write cannot be conditional, and could replace a concurrent edit.
    if (revision === undefined) {
      return new Err(
        new DfmAgentDocumentError(
          "refused",
          "This document's storage does not support safe edits yet."
        )
      );
    }

    const document = parseDocument(text);
    if (document.isErr()) {
      return document;
    }
    const { body } = document.value;

    // The codec normalizes the body's line breaks to `\n`, so a passage quoted from a source
    // stored with CRLF line endings only matches once normalized the same way.
    const replaced = replaceInBody({
      text: text.replaceAll("\r\n", "\n"),
      body,
      oldString: oldString.replaceAll("\r\n", "\n"),
      newString,
      expectedReplacements,
    });
    if (replaced.isErr()) {
      return replaced;
    }
    const { replacements } = replaced.value;
    // The codec refuses carriage returns and a body ending with a line break, which agents
    // often write; neither changes the rendered document.
    const editedBody = replaced.value.editedBody
      .replaceAll("\r\n", "\n")
      .replace(/\n+$/, "");

    const anchorsBefore = anchorIds(body);
    const anchorsAfter = anchorIds(editedBody);
    if (
      anchorsAfter === null ||
      anchorsBefore === null ||
      anchorsAfter.join("\n") !== anchorsBefore.join("\n")
    ) {
      return new Err(
        new DfmAgentDocumentError(
          "anchors_changed",
          "The edit would add, remove or break `:comment-start{…}` / `:comment-end{…}` anchors. " +
            "Keep every existing anchor pair intact and do not write new ones."
        )
      );
    }

    const serialized = serializeDfm({ ...document.value, body: editedBody });
    if (serialized.isErr()) {
      return new Err(
        new DfmAgentDocumentError("invalid_document", serialized.error.message)
      );
    }

    const written = await writeCanonicalFileContent(
      auth,
      dustFs,
      scopedPath,
      Buffer.from(serialized.value, "utf8"),
      undefined,
      revision
    );
    if (written.isOk()) {
      return new Ok({ replacements });
    }
    if (written.error.code !== "revision_conflict") {
      return new Err(fileSystemError(written.error));
    }
  }

  return new Err(
    new DfmAgentDocumentError(
      "conflict",
      "The document kept changing while the edit was being applied. Read it again and retry."
    )
  );
}
