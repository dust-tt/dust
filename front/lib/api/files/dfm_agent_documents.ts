import type { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import type { DfmStoredDocumentError } from "@app/lib/api/files/dfm_stored_documents";
import {
  readCurrentDocumentSource,
  writeDocumentChange,
} from "@app/lib/api/files/dfm_stored_documents";
import type { Authenticator } from "@app/lib/auth";
import { extractAnchors } from "@app/lib/markdown/dfm";
import type { LiveAgent } from "@app/types/collab";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export type DfmAgentDocumentErrorCode =
  | "string_not_found"
  | "outside_body"
  | "unexpected_count"
  | "anchors_changed";

export class DfmAgentDocumentError extends Error {
  constructor(
    readonly code: DfmAgentDocumentErrorCode,
    message: string
  ) {
    super(message);
  }
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
 * against, front matter, comment anchors and annotations block included, as
 * `readCurrentDocumentSource` returns it: the live session's while one holds the document.
 */
export async function readAgentDocument(
  auth: Authenticator,
  dustFs: DustFileSystem,
  scopedPath: string,
  agent?: LiveAgent
): Promise<Result<{ source: string }, DfmStoredDocumentError>> {
  return readCurrentDocumentSource(auth, dustFs, scopedPath, agent);
}

/**
 * @cc [owner:tdraier,label:product;concurrency] dfm-agent-document-edit
 * An edit MUST replace exactly `expectedReplacements` occurrences of `oldString` in the body of
 * the source `readAgentDocument` returns, or, with an empty `oldString`, write `newString` as
 * the body of a document whose body is empty or blank, and refuse an empty `oldString` otherwise
 * or with `expectedReplacements` other than 1.
 * Line breaks in the source and `oldString` MUST be matched normalized to `\n`, so a passage
 * quoted from a CRLF source still matches; they MAY be normalized to `\n` and trailing ones
 * dropped from the edited body. It MUST leave the front matter, the comment threads and the set
 * of comment anchors unchanged, refusing otherwise. It MUST be written through
 * `writeDocumentChange`.
 */
export async function editAgentDocument(
  auth: Authenticator,
  dustFs: DustFileSystem,
  {
    scopedPath,
    oldString,
    newString,
    expectedReplacements,
    agent,
  }: {
    scopedPath: string;
    oldString: string;
    newString: string;
    expectedReplacements: number;
    agent?: LiveAgent;
  }
): Promise<
  Result<
    { replacements: number },
    DfmAgentDocumentError | DfmStoredDocumentError
  >
> {
  // TODO(co-edition): pass an idempotency key so a retried tool call is applied once.
  return writeDocumentChange(
    auth,
    dustFs,
    scopedPath,
    async ({ text, document }) => {
      // The codec normalizes the body's line breaks to `\n`, so a passage quoted from a source
      // stored with CRLF line endings only matches once normalized the same way.
      const replaced = replaceInBody({
        text: text.replaceAll("\r\n", "\n"),
        body: document.body,
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

      const anchorsBefore = anchorIds(document.body);
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

      return new Ok({
        document: { ...document, body: editedBody },
        value: { replacements },
      });
    },
    agent
  );
}
