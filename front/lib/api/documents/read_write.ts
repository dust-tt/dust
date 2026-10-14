import type { AgentLoopRunContext } from "@app/lib/actions/types";
import type { CollabSourceError } from "@app/lib/api/collab/client";
import { readCollabSource } from "@app/lib/api/collab/client";
import type { CollabSessionWriteError } from "@app/lib/api/collab/write_through_session";
import {
  isCollabSessionWriteError,
  writeThroughCollabSession,
} from "@app/lib/api/collab/write_through_session";
import { readStoredText } from "@app/lib/api/documents/comment_signatures";
import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { writeCanonicalFileContent } from "@app/lib/api/files/file_system_ops";
import type { Authenticator } from "@app/lib/auth";
import type { DfmDocument } from "@app/lib/markdown/dfm";
import { parseDfm, serializeDfm } from "@app/lib/markdown/dfm";
import type { CollabAgent } from "@app/types/collab";
import { contentTypeFromFileName } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

const MAX_WRITE_ATTEMPTS = 3;

export type DfmStoredDocumentErrorCode =
  | "not_markdown"
  | "not_found"
  | "invalid_document"
  | "conflict"
  | "refused"
  | "storage_failed";

export class DfmStoredDocumentError extends Error {
  constructor(
    readonly code: DfmStoredDocumentErrorCode,
    message: string
  ) {
    super(message);
  }
}

function fileSystemError(error: {
  code: string;
  message: string;
}): DfmStoredDocumentError {
  return new DfmStoredDocumentError(
    error.code === "internal" ? "storage_failed" : "refused",
    error.message
  );
}

function collabSourceError({
  code,
  message,
}: CollabSourceError): DfmStoredDocumentError {
  return new DfmStoredDocumentError(
    code === "refused" ? "refused" : "storage_failed",
    message
  );
}

function collabSessionWriteError({
  code,
  message,
}: CollabSessionWriteError): DfmStoredDocumentError {
  switch (code) {
    case "read_only":
    case "refused":
      return new DfmStoredDocumentError("refused", message);
    case "conflict":
      return new DfmStoredDocumentError("conflict", message);
    case "unavailable":
      return new DfmStoredDocumentError("storage_failed", message);
    default:
      return assertNever(code);
  }
}

function resolveDocumentPath(
  scopedPath: string
): Result<string, DfmStoredDocumentError> {
  const resolvedPath = DustFileSystem.resolveScopedPath(scopedPath);
  if (resolvedPath.isErr()) {
    return new Err(fileSystemError(resolvedPath.error));
  }
  if (contentTypeFromFileName(resolvedPath.value) !== "text/markdown") {
    return new Err(
      new DfmStoredDocumentError(
        "not_markdown",
        "Only Markdown documents can be read or changed with this tool."
      )
    );
  }
  return new Ok(resolvedPath.value);
}

/** That `dustFs` can read the file and that it exists, without reading it. */
async function checkDocumentFound(
  dustFs: DustFileSystem,
  scopedPath: string
): Promise<Result<void, DfmStoredDocumentError>> {
  const found = await dustFs.stat(scopedPath);
  if (found.isErr()) {
    return new Err(fileSystemError(found.error));
  }
  if (found.value === null) {
    return new Err(
      new DfmStoredDocumentError("not_found", `File not found: ${scopedPath}`)
    );
  }
  return new Ok(undefined);
}

function parseDocument(
  text: string
): Result<DfmDocument, DfmStoredDocumentError> {
  const document = parseDfm(text);
  if (document.isErr()) {
    const { message, line } = document.error;
    return new Err(
      new DfmStoredDocumentError(
        "invalid_document",
        line === undefined ? message : `Line ${line}: ${message}`
      )
    );
  }
  return document;
}

/**
 * @cc [owner:tdraier,label:product] document-file-read
 * Reading MUST refuse a file whose name does not map to `text/markdown` with `not_markdown`, a
 * missing file with `not_found` and a file the codec cannot parse with `invalid_document`, and
 * MUST otherwise return the stored source unchanged with its parsed document, its revision when
 * storage has one, and its resolved file path.
 */
export async function readStoredDocument(
  dustFs: DustFileSystem,
  scopedPath: string
): Promise<
  Result<
    {
      text: string;
      revision: string | undefined;
      document: DfmDocument;
      filePath: string;
    },
    DfmStoredDocumentError
  >
> {
  const filePath = resolveDocumentPath(scopedPath);
  if (filePath.isErr()) {
    return filePath;
  }

  const read = await readStoredText(dustFs, scopedPath);
  if (read.isErr()) {
    return new Err(fileSystemError(read.error));
  }
  if (read.value === null) {
    return new Err(
      new DfmStoredDocumentError("not_found", `File not found: ${scopedPath}`)
    );
  }
  const { text, revision } = read.value;

  const document = parseDocument(text);
  if (document.isErr()) {
    return document;
  }

  return new Ok({
    text,
    revision,
    document: document.value,
    filePath: filePath.value,
  });
}

type DocumentChange<T, E extends Error> = (read: {
  text: string;
  document: DfmDocument;
  filePath: string;
}) => Promise<Result<{ document: DfmDocument; value: T }, E>>;

async function applyChange<T, E extends Error>(
  change: DocumentChange<T, E>,
  read: { text: string; document: DfmDocument; filePath: string }
): Promise<
  Result<{ serialized: string; value: T }, DfmStoredDocumentError | E>
> {
  const changed = await change(read);
  if (changed.isErr()) {
    return changed;
  }
  const serialized = serializeDfm(changed.value.document);
  if (serialized.isErr()) {
    return new Err(
      new DfmStoredDocumentError("invalid_document", serialized.error.message)
    );
  }
  return new Ok({ serialized: serialized.value, value: changed.value.value });
}

/** The agent running a tool, as a live document's editors see it. */
export const collabAgentOf = ({
  agentConfiguration,
}: AgentLoopRunContext): CollabAgent => ({
  agentId: agentConfiguration.sId,
  name: agentConfiguration.name,
});

/**
 * @cc [owner:PopDaph,label:product;concurrency] document-open-session-source
 * For a Markdown document a live session holds, MUST return the session's source, the session
 * showing `agent` reading it; for a document no session holds, or a path that is not a Markdown
 * document, MUST return null without reading the file. A collab server that cannot answer MUST be
 * an error, as in `readCollabSource`.
 */
export async function readOpenDocumentSource(
  auth: Authenticator,
  scopedPath: string,
  agent?: CollabAgent
): Promise<Result<string | null, DfmStoredDocumentError>> {
  const filePath = resolveDocumentPath(scopedPath);
  if (filePath.isErr()) {
    return new Ok(null);
  }
  const live = await readCollabSource(auth, filePath.value, agent);
  if (live.isErr()) {
    return new Err(collabSourceError(live.error));
  }
  return new Ok(live.value.open ? live.value.source : null);
}

/**
 * @cc [owner:tdraier,label:product] document-source-read
 * While a live session holds the document, reading MUST return the session's source in place of
 * the file's, since the file lags the session until its next checkpoint, without reading the file:
 * after the name check of `readStoredDocument`, `dustFs` MUST be able to read the file and the file
 * MUST exist. Otherwise it MUST return what `readStoredDocument` reads, with its refusals. `agent`
 * is passed on to the session, which shows it reading.
 */
export async function readCurrentDocumentSource(
  auth: Authenticator,
  dustFs: DustFileSystem,
  scopedPath: string,
  agent?: CollabAgent
): Promise<Result<{ source: string }, DfmStoredDocumentError>> {
  const filePath = resolveDocumentPath(scopedPath);
  if (filePath.isErr()) {
    return filePath;
  }
  const live = await readCollabSource(auth, filePath.value, agent);
  if (live.isErr()) {
    return new Err(collabSourceError(live.error));
  }
  if (live.value.open) {
    const found = await checkDocumentFound(dustFs, filePath.value);
    if (found.isErr()) {
      return found;
    }
    return new Ok({ source: live.value.source });
  }

  const read = await readStoredDocument(dustFs, scopedPath);
  if (read.isErr()) {
    return read;
  }
  return new Ok({ source: read.value.text });
}

/**
 * @cc [owner:tdraier,label:concurrency] document-change-write
 * Without a live session, the document MUST be read through `readStoredDocument`, and `change` MUST
 * receive it as read.
 * Its result MUST be written conditional on the revision read; a file whose storage returns no
 * revision MUST be refused. On a conflict it MUST start over from a fresh read, and give up with
 * `conflict` after `MAX_WRITE_ATTEMPTS`, never overwriting a concurrent write.
 *
 * While a live session holds the document, the file MUST NOT be read or written: after the name
 * check of `readStoredDocument`, the change MUST go through `writeThroughCollabSession` with `agent`
 * (`collab-session-write`), and the file MUST exist before `change` receives the session's source,
 * parsed; the session refuses a storage without revisions itself (`collab-session-source-write`).
 */
export async function writeDocumentChange<T, E extends Error>(
  auth: Authenticator,
  dustFs: DustFileSystem,
  scopedPath: string,
  change: DocumentChange<T, E>,
  agent?: CollabAgent
): Promise<Result<T, DfmStoredDocumentError | E>> {
  const filePath = resolveDocumentPath(scopedPath);
  if (filePath.isErr()) {
    return filePath;
  }

  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    const live = await writeThroughCollabSession(auth, dustFs, {
      filePath: filePath.value,
      agent,
      change: async (source) => {
        const found = await checkDocumentFound(dustFs, filePath.value);
        if (found.isErr()) {
          return found;
        }
        const document = parseDocument(source);
        if (document.isErr()) {
          return document;
        }
        const changed = await applyChange(change, {
          text: source,
          document: document.value,
          filePath: filePath.value,
        });
        if (changed.isErr()) {
          return changed;
        }
        return new Ok({
          source: changed.value.serialized,
          value: changed.value.value,
        });
      },
    });
    if (live.isErr()) {
      return new Err(
        isCollabSessionWriteError(live.error)
          ? collabSessionWriteError(live.error)
          : live.error
      );
    }
    if (live.value.kind === "written") {
      return new Ok(live.value.value);
    }

    const read = await readStoredDocument(dustFs, scopedPath);
    if (read.isErr()) {
      return read;
    }
    const { text, revision, document } = read.value;

    // Without a revision the write cannot be conditional, and could replace a concurrent edit.
    if (revision === undefined) {
      return new Err(
        new DfmStoredDocumentError(
          "refused",
          "This document's storage does not support safe changes yet."
        )
      );
    }

    const changed = await applyChange(change, {
      text,
      document,
      filePath: filePath.value,
    });
    if (changed.isErr()) {
      return changed;
    }

    const written = await writeCanonicalFileContent(
      auth,
      dustFs,
      scopedPath,
      Buffer.from(changed.value.serialized, "utf8"),
      undefined,
      revision
    );
    if (written.isOk()) {
      return new Ok(changed.value.value);
    }
    if (written.error.code !== "revision_conflict") {
      return new Err(fileSystemError(written.error));
    }
  }

  return new Err(
    new DfmStoredDocumentError(
      "conflict",
      "The document kept changing while the change was being applied. Read it again and retry."
    )
  );
}
