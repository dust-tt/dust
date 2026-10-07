import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { readStoredText } from "@app/lib/api/files/dfm_comment_signatures";
import { writeCanonicalFileContent } from "@app/lib/api/files/file_system_ops";
import type { Authenticator } from "@app/lib/auth";
import type { DfmDocument } from "@app/lib/markdown/dfm";
import { parseDfm, serializeDfm } from "@app/lib/markdown/dfm";
import { contentTypeFromFileName } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

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

/**
 * @cc [owner:tdraier,label:product] dfm-stored-document-read
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

  return new Ok({
    text,
    revision,
    document: document.value,
    filePath: resolvedPath.value,
  });
}

/**
 * @cc [owner:tdraier,label:concurrency] dfm-stored-document-write
 * The document MUST be read through `readStoredDocument`, and `change` MUST receive it as read.
 * Its result MUST be written conditional on the revision read; a file whose storage returns no
 * revision MUST be refused. On a conflict it MUST start over from a fresh read, and give up with
 * `conflict` after `MAX_WRITE_ATTEMPTS`, never overwriting a concurrent write.
 */
export async function writeDocumentChange<T, E extends Error>(
  auth: Authenticator,
  dustFs: DustFileSystem,
  scopedPath: string,
  change: (read: {
    text: string;
    document: DfmDocument;
    filePath: string;
  }) => Promise<Result<{ document: DfmDocument; value: T }, E>>
): Promise<Result<T, DfmStoredDocumentError | E>> {
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    const read = await readStoredDocument(dustFs, scopedPath);
    if (read.isErr()) {
      return read;
    }
    const { text, revision, document, filePath } = read.value;
    // Without a revision the write cannot be conditional, and could replace a concurrent edit.
    if (revision === undefined) {
      return new Err(
        new DfmStoredDocumentError(
          "refused",
          "This document's storage does not support safe changes yet."
        )
      );
    }

    const changed = await change({ text, document, filePath });
    if (changed.isErr()) {
      return changed;
    }

    const serialized = serializeDfm(changed.value.document);
    if (serialized.isErr()) {
      return new Err(
        new DfmStoredDocumentError("invalid_document", serialized.error.message)
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
