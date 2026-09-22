import { validateNativeDocument } from "@app/lib/api/documents/content";
import {
  DocumentError,
  readDocumentFile,
  writeDocumentContent,
} from "@app/lib/api/documents/storage";
import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import type { Authenticator } from "@app/lib/auth";
import type { CanonicalDocumentSnapshot } from "@app/types/documents";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * @cc [owner:flvndvd,label:security] canonical-document-access
 * Document file access MUST use the current Files mount permissions and normalized path.
 * Files without a FileResource MUST work. Unsupported storage MUST fail closed.
 */
const resolveDocumentPath = async (
  auth: Authenticator,
  path: string
): Promise<
  Result<
    { canonicalPath: string; mountFilePath: string; canEdit: boolean },
    DocumentError
  >
> => {
  const canonicalPath = DustFileSystem.normalizeScopedPath(path);
  if (!canonicalPath || !canonicalPath.toLowerCase().endsWith(".dustdoc")) {
    return new Err(new DocumentError("not_found", "Document not found."));
  }

  const resolved = await DustFileSystem.fromScopedPath(auth, canonicalPath);
  if (resolved.isErr()) {
    return new Err(new DocumentError("not_found", "Document not found."));
  }
  const fs = resolved.value;
  const readablePath = fs.toSandboxPath(canonicalPath);
  if (readablePath.isErr()) {
    return new Err(new DocumentError("not_found", "Document not found."));
  }
  if (!fs.isGCSBacked()) {
    return new Err(
      new DocumentError(
        "invalid_document",
        "Document editing is unavailable for this storage. You can still download the file."
      )
    );
  }
  const mountFilePath = fs.toMountFilePath(canonicalPath);
  if (!mountFilePath) {
    return new Err(new DocumentError("not_found", "Document not found."));
  }
  return new Ok({
    canonicalPath,
    mountFilePath,
    canEdit: fs.checkWriteAccess(canonicalPath).isOk(),
  });
};

export const loadDocumentByPath = async (
  auth: Authenticator,
  path: string
): Promise<Result<CanonicalDocumentSnapshot, DocumentError>> => {
  const resolved = await resolveDocumentPath(auth, path);
  if (resolved.isErr()) {
    return resolved;
  }
  const result = await readDocumentFile(resolved.value);
  if (result.isErr()) {
    return result;
  }
  return new Ok({
    canonicalPath: resolved.value.canonicalPath,
    canEdit: resolved.value.canEdit,
    ...result.value,
  });
};

/**
 * @cc [owner:flvndvd,label:concurrency;product] canonical-document-save
 * Browser saves MUST match the loaded revision at the current path and validate the complete file.
 * Conflicts or invalid input MUST leave the stored file unchanged.
 */
export const saveDocumentByPath = async (
  auth: Authenticator,
  path: string,
  { source, revision }: { source: string; revision: string }
): Promise<Result<{ revision: string }, DocumentError>> => {
  const resolved = await resolveDocumentPath(auth, path);
  if (resolved.isErr()) {
    return resolved;
  }
  if (!resolved.value.canEdit) {
    return new Err(
      new DocumentError(
        "forbidden",
        "You do not have permission to edit this document."
      )
    );
  }
  if (!/^[0-9]+$/.test(revision)) {
    return new Err(
      new DocumentError(
        "invalid_document",
        "The document revision is invalid. Its saved content has not been changed."
      )
    );
  }
  const validated = validateNativeDocument(source);
  if (validated.isErr()) {
    return new Err(
      new DocumentError(
        "invalid_document",
        `${validated.error.message} Its saved content has not been changed.`
      )
    );
  }
  return writeDocumentContent(resolved.value.mountFilePath, {
    document: validated.value,
    revision,
  });
};
