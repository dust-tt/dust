import path from "node:path";

import { DustFileSystem } from "@app/lib/api/file_system";
import type { ValidationWarning } from "@app/lib/api/files/content_validation";
import {
  buildAndPublishFramePublication,
  validateFramePublication,
} from "@app/lib/api/frames/build_and_publish";
import { withFrameSourceLock } from "@app/lib/api/frames/operation_lock";
import type { FramePublicationSourceFile } from "@app/lib/api/frames/publication_storage";
import { FramePublicationError } from "@app/lib/api/frames/publication_storage";
import type {
  EgressDomainRequestScope,
  EgressDomainRequestsSummary,
} from "@app/lib/api/sandbox/egress_domain_requests";
import { requestEgressDomainsForScope } from "@app/lib/api/sandbox/egress_domain_requests";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import { createMountFrameSourceReader } from "@app/lib/api/viz/build_frame_bundle";
import {
  parseSourceLocation,
  replaceJsxTextAtSourceLocation,
} from "@app/lib/api/viz/edit_source_text";
import type { PublishFrameError } from "@app/lib/api/viz/publish_frame";
import { publishFrame } from "@app/lib/api/viz/publish_frame";
import type { Authenticator } from "@app/lib/auth";
import { isLockAcquisitionTimeoutError } from "@app/lib/lock";
import { FileResource } from "@app/lib/resources/file_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { FrameManifest } from "@app/types/api/frame_manifest";
import {
  FRAME_MANIFEST_FILE,
  isSafeFrameRelativePath,
  parseFrameManifest,
} from "@app/types/api/frame_manifest";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { isPodConversation } from "@app/types/assistant/conversation";
import type { DustFileSystemError } from "@app/types/file_system";
import {
  contentTypeFromFileName,
  isAllSupportedFileContentType,
  normalizeMimeType,
} from "@app/types/files";
import { splitFrameEntryScopedPath } from "@app/types/mount_path";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

const FRAME_SOURCE_READ_CONCURRENCY = 8;
const MAX_FRAME_SOURCE_FILE_COUNT = 1024;
const MAX_FRAME_SOURCE_BYTES = 100 * 1024 * 1024;

function frameError(code: FramePublicationError["code"], message: string) {
  return new Err(new FramePublicationError(code, message));
}

function frameSourceConflictError() {
  return new SandboxFunctionError(
    "publish_conflict",
    "Another source operation is in progress for this Frame; retry shortly."
  );
}

export type PublishFrameFromSourceError =
  | DustFileSystemError
  | FramePublicationError
  | PublishFrameError
  | SandboxFunctionError;

export type PublishFrameFromSourceResult =
  | {
      kind: "legacy";
      frameId: string;
      sourcePath: string;
      warnings: ValidationWarning[];
    }
  | {
      kind: "v2";
      frameId: string;
      sourcePath: string;
      publicationId: string;
      // Null when the manifest declares no domains.
      egressDomains: EgressDomainRequestsSummary | null;
    };

export type ValidateFrameFromSourceResult = {
  frameId: string;
  sourcePath: string;
  warnings: ValidationWarning[];
};

async function resolveFrameFromSource(
  auth: Authenticator,
  {
    conversation,
    sourcePath,
  }: {
    conversation: ConversationWithoutContentType;
    sourcePath: string;
  }
): Promise<
  Result<
    { dustFs: DustFileSystem; frame: FileResource; normalizedPath: string },
    DustFileSystemError | FramePublicationError
  >
> {
  const normalizedPath = DustFileSystem.normalizeScopedPath(sourcePath);
  if (!normalizedPath) {
    return frameError(
      "invalid_source",
      `Invalid Frame source path: ${sourcePath}`
    );
  }

  const fsResult = await DustFileSystem.forConversation(auth, conversation);
  if (fsResult.isErr()) {
    return new Err(fsResult.error);
  }
  const dustFs = fsResult.value;

  const writeAccess = dustFs.checkWriteAccess(normalizedPath);
  if (writeAccess.isErr()) {
    return new Err(writeAccess.error);
  }

  const mountFilePath = dustFs.toMountFilePath(normalizedPath);
  if (!mountFilePath) {
    return frameError(
      "invalid_source",
      `Invalid Frame source path: ${sourcePath}`
    );
  }

  const [frame] = await FileResource.fetchByMountFilePaths(auth, [
    mountFilePath,
  ]);
  if (!frame || (!frame.isFrameV2 && !frame.isInteractiveContent)) {
    return frameError("invalid_source", `No Frame found at ${normalizedPath}.`);
  }

  return new Ok({ dustFs, frame, normalizedPath });
}

export async function publishFrameFromSource(
  auth: Authenticator,
  {
    conversation,
    publishedByAgentConfigurationId,
    sourcePath,
  }: {
    conversation: ConversationWithoutContentType;
    publishedByAgentConfigurationId: string;
    sourcePath: string;
  }
): Promise<Result<PublishFrameFromSourceResult, PublishFrameFromSourceError>> {
  const resolved = await resolveFrameFromSource(auth, {
    conversation,
    sourcePath,
  });
  if (resolved.isErr()) {
    return resolved;
  }
  const { dustFs, frame, normalizedPath } = resolved.value;

  if (frame.isFrameV2) {
    const publication = await publishFrameV2FromSource(auth, {
      conversation,
      frame,
      manifestPath: normalizedPath,
    });
    if (publication.isErr()) {
      return new Err(publication.error);
    }

    // Never fails the publish: the publication is already active, and failed
    // domains can be retried with request_egress_domain.
    const { domains } = publication.value.manifest;
    const egressDomains =
      domains.length > 0
        ? await requestEgressDomainsForScope(auth, {
            scope: frameEgressRequestScope(frame, conversation),
            domains,
          })
        : null;

    return new Ok({
      kind: "v2",
      frameId: frame.sId,
      sourcePath: normalizedPath,
      publicationId: publication.value.publicationId,
      egressDomains,
    });
  }

  const splitResult = splitFrameEntryScopedPath(normalizedPath);
  if (splitResult.isErr()) {
    return frameError("invalid_source", splitResult.error.message);
  }
  const { root, entryRelPath } = splitResult.value;

  const publication = await publishFrame(auth, {
    file: frame,
    reader: createMountFrameSourceReader(dustFs, root),
    entryRelPath,
    rootScopedPath: root,
    publishedByAgentConfigurationId,
  });
  if (publication.isErr()) {
    return new Err(publication.error);
  }

  return new Ok({
    kind: "legacy",
    frameId: frame.sId,
    sourcePath: normalizedPath,
    warnings: publication.value.warnings,
  });
}

// Requests land where the Frame's functions run: the Pod whose policy the Frame
// sandbox inherits (same rule as FrameSandboxAdapter.resolveScope), else the
// workspace. Never the Frame's own owner file, which no admin surface lists.
function frameEgressRequestScope(
  frame: FileResource,
  conversation: ConversationWithoutContentType
): EgressDomainRequestScope {
  const podId =
    frame.useCaseMetadata?.spaceId ??
    (isPodConversation(conversation) ? conversation.spaceId : null);
  return podId ? { kind: "pod", podId } : { kind: "workspace" };
}

export async function validateFrameFromSource(
  auth: Authenticator,
  {
    conversation,
    sourcePath,
  }: {
    conversation: ConversationWithoutContentType;
    sourcePath: string;
  }
): Promise<Result<ValidateFrameFromSourceResult, PublishFrameFromSourceError>> {
  const resolved = await resolveFrameFromSource(auth, {
    conversation,
    sourcePath,
  });
  if (resolved.isErr()) {
    return resolved;
  }
  const { frame, normalizedPath } = resolved.value;
  if (!frame.isFrameV2) {
    return frameError(
      "invalid_frame",
      "Pre-publish validation is only available for Frames v2 manifests."
    );
  }

  const validation = await validateFrameV2FromSource(auth, {
    conversation,
    frame,
    manifestPath: normalizedPath,
  });
  if (validation.isErr()) {
    return validation;
  }

  return new Ok({
    frameId: frame.sId,
    sourcePath: normalizedPath,
    warnings: validation.value.warnings,
  });
}

async function resolveWritableFrameV2Source(
  auth: Authenticator,
  frame: FileResource
): Promise<
  Result<
    { canonicalManifestPath: string; dustFs: DustFileSystem },
    FramePublicationError
  >
> {
  const canonicalManifestPath = frame.toScopedPath(auth);
  if (
    !canonicalManifestPath ||
    path.posix.basename(canonicalManifestPath) !== FRAME_MANIFEST_FILE
  ) {
    return frameError(
      "invalid_source",
      `Frame '${frame.sId}' has no canonical ${FRAME_MANIFEST_FILE} path.`
    );
  }

  const fsResult = await DustFileSystem.fromScopedPath(
    auth,
    canonicalManifestPath
  );
  if (fsResult.isErr()) {
    return frameError("invalid_source", fsResult.error.message);
  }
  const dustFs = fsResult.value;

  const writeAccess = dustFs.checkWriteAccess(canonicalManifestPath);
  if (writeAccess.isErr()) {
    return frameError("unauthorized", writeAccess.error.message);
  }

  return new Ok({ canonicalManifestPath, dustFs });
}

/**
 * Capture the manifest and source tree addressed by a Frames v2 FileResource. The FileResource
 * path is authoritative: callers cannot point a Frame identity at a different source tree.
 */
async function readFrameV2SourceWithSourceLockHeld(
  auth: Authenticator,
  {
    frame,
    manifestPath,
  }: {
    frame: FileResource;
    manifestPath: string;
  }
): Promise<
  Result<
    { manifest: FrameManifest; sourceFiles: FramePublicationSourceFile[] },
    FramePublicationError
  >
> {
  const resolved = await resolveWritableFrameV2Source(auth, frame);
  if (resolved.isErr()) {
    return resolved;
  }
  const { canonicalManifestPath, dustFs } = resolved.value;

  if (
    DustFileSystem.normalizeScopedPath(manifestPath) !== canonicalManifestPath
  ) {
    return frameError(
      "invalid_source",
      `Frame '${frame.sId}' must be published from '${canonicalManifestPath}'.`
    );
  }

  const manifestBufferResult = await dustFs.readBuffer(canonicalManifestPath);
  if (manifestBufferResult.isErr()) {
    return frameError("invalid_source", manifestBufferResult.error.message);
  }
  if (manifestBufferResult.value === null) {
    return frameError(
      "invalid_source",
      `Frame manifest not found: ${canonicalManifestPath}`
    );
  }
  const manifestBuffer = manifestBufferResult.value;

  const manifestResult = parseFrameManifest(manifestBuffer);
  if (manifestResult.isErr()) {
    return frameError("invalid_manifest", manifestResult.error);
  }

  const sourceDirectoryPath = path.posix.dirname(canonicalManifestPath);
  const listResult = await dustFs.list(sourceDirectoryPath, {
    maxFiles: MAX_FRAME_SOURCE_FILE_COUNT + 1,
  });
  if (listResult.isErr()) {
    return frameError("invalid_source", listResult.error.message);
  }
  if (listResult.value.length > MAX_FRAME_SOURCE_FILE_COUNT) {
    return frameError(
      "invalid_source",
      "Frame source exceeds the publication file count limit."
    );
  }

  const sourceEntries: Array<{
    path: string;
    relativePath: string;
    contentType: FramePublicationSourceFile["contentType"];
  }> = [];
  for (const entry of listResult.value) {
    if (entry.isDirectory) {
      continue;
    }

    const relativePath = path.posix.relative(sourceDirectoryPath, entry.path);
    if (!isSafeFrameRelativePath(relativePath)) {
      return frameError(
        "invalid_source",
        `Invalid Frame source path: ${entry.path}`
      );
    }

    // FUSE/GCS metadata is not authoritative for source code. In particular, `.tsx` can be
    // reported as the unrelated `application/x-tiled-tsx`; the file extension is stable.
    const contentType =
      contentTypeFromFileName(relativePath) ??
      normalizeMimeType(entry.contentType);
    if (!isAllSupportedFileContentType(contentType)) {
      return frameError(
        "invalid_source",
        `Unsupported content type '${entry.contentType}' for Frame source '${relativePath}'.`
      );
    }

    sourceEntries.push({ path: entry.path, relativePath, contentType });
  }

  const totalSizeBytes = listResult.value.reduce(
    (total, entry) => total + entry.sizeBytes,
    0
  );
  if (
    sourceEntries.length > MAX_FRAME_SOURCE_FILE_COUNT ||
    totalSizeBytes > MAX_FRAME_SOURCE_BYTES
  ) {
    return frameError(
      "invalid_source",
      "Frame source exceeds the publication size limit."
    );
  }
  if (!sourceEntries.some((entry) => entry.path === canonicalManifestPath)) {
    return frameError(
      "invalid_source",
      `Frame manifest not found in source folder: ${canonicalManifestPath}`
    );
  }

  const sourceFileResults = await concurrentExecutor(
    sourceEntries,
    async (entry) => ({
      ...entry,
      content:
        entry.path === canonicalManifestPath
          ? manifestBuffer
          : await dustFs.readBuffer(entry.path),
    }),
    { concurrency: FRAME_SOURCE_READ_CONCURRENCY }
  );

  const sourceFiles: FramePublicationSourceFile[] = [];
  for (const sourceFileResult of sourceFileResults) {
    const { content, contentType, relativePath } = sourceFileResult;
    if (Buffer.isBuffer(content)) {
      sourceFiles.push({ content, contentType, relativePath });
      continue;
    }
    if (content.isErr()) {
      return frameError("invalid_source", content.error.message);
    }
    if (content.value === null) {
      return frameError(
        "invalid_source",
        `Frame source file not found: ${relativePath}`
      );
    }
    sourceFiles.push({ content: content.value, contentType, relativePath });
  }

  return new Ok({ manifest: manifestResult.value, sourceFiles });
}

async function publishFrameV2FromSourceWithSourceLockHeld(
  auth: Authenticator,
  {
    conversation,
    frame,
    manifestPath,
  }: {
    conversation: ConversationWithoutContentType;
    frame: FileResource;
    manifestPath: string;
  }
): Promise<
  Result<
    { publicationId: string; manifest: FrameManifest },
    FramePublicationError | SandboxFunctionError
  >
> {
  const source = await readFrameV2SourceWithSourceLockHeld(auth, {
    frame,
    manifestPath,
  });
  if (source.isErr()) {
    return source;
  }

  const publication = await buildAndPublishFramePublication(auth, {
    conversation,
    frame,
    ...source.value,
  });
  if (publication.isErr()) {
    return publication;
  }

  return new Ok({
    publicationId: publication.value.publicationId,
    manifest: source.value.manifest,
  });
}

export async function publishFrameV2FromSource(
  auth: Authenticator,
  {
    conversation,
    frame,
    manifestPath,
  }: {
    conversation: ConversationWithoutContentType;
    frame: FileResource;
    manifestPath: string;
  }
): Promise<
  Result<
    { publicationId: string; manifest: FrameManifest },
    FramePublicationError | SandboxFunctionError
  >
> {
  if (!frame.isFrameV2) {
    return frameError(
      "invalid_frame",
      `File '${frame.sId}' is not a Frames v2 manifest.`
    );
  }

  const publication = await withFrameSourceLock(frame.sId, async () => {
    const freshFrame = await frame.fetchFreshFrameV2(auth);
    if (!freshFrame) {
      return frameError(
        "invalid_frame",
        `Frame '${frame.sId}' no longer exists.`
      );
    }

    return publishFrameV2FromSourceWithSourceLockHeld(auth, {
      conversation,
      frame: freshFrame,
      manifestPath,
    });
  });
  if (publication.isErr()) {
    if (isLockAcquisitionTimeoutError(publication.error)) {
      return new Err(frameSourceConflictError());
    }
    return new Err(publication.error);
  }

  return publication;
}

export async function editFrameV2TextAtSource(
  auth: Authenticator,
  {
    conversation,
    frame,
    source,
    oldText,
    newText,
  }: {
    conversation: ConversationWithoutContentType;
    frame: FileResource;
    source: string;
    oldText: string;
    newText: string;
  }
): Promise<Result<{ publicationId: string }, PublishFrameFromSourceError>> {
  if (!frame.isFrameV2) {
    return frameError(
      "invalid_frame",
      `File '${frame.sId}' is not a Frames v2 manifest.`
    );
  }

  const location = parseSourceLocation(source);
  if (!location || !isSafeFrameRelativePath(location.relPath)) {
    return frameError("invalid_source", `Invalid source location: ${source}.`);
  }

  const publication = await withFrameSourceLock<
    { publicationId: string },
    PublishFrameFromSourceError
  >(frame.sId, async () => {
    const freshFrame = await frame.fetchFreshFrameV2(auth);
    if (!freshFrame) {
      return frameError(
        "invalid_frame",
        `Frame '${frame.sId}' no longer exists.`
      );
    }

    const resolved = await resolveWritableFrameV2Source(auth, freshFrame);
    if (resolved.isErr()) {
      return resolved;
    }
    const { canonicalManifestPath: manifestPath, dustFs } = resolved.value;

    const sourcePath = path.posix.join(
      path.posix.dirname(manifestPath),
      location.relPath
    );
    const sourceBuffer = await dustFs.readBuffer(sourcePath);
    if (sourceBuffer.isErr()) {
      return new Err(sourceBuffer.error);
    }
    if (sourceBuffer.value === null) {
      return frameError(
        "invalid_source",
        `Frame source file not found: ${location.relPath}`
      );
    }
    const originalSource = sourceBuffer.value;

    const edited = replaceJsxTextAtSourceLocation(
      originalSource.toString("utf8"),
      {
        line: location.line,
        col: location.col,
        oldText,
        newText,
      }
    );
    if (edited.isErr()) {
      return frameError("invalid_source", edited.error.message);
    }

    const stat = await dustFs.stat(sourcePath);
    if (stat.isErr()) {
      return new Err(stat.error);
    }
    const contentType =
      stat.value?.contentType ??
      contentTypeFromFileName(location.relPath) ??
      "text/plain";
    const writeResult = await dustFs.write(
      sourcePath,
      edited.value,
      contentType
    );
    if (writeResult.isErr()) {
      return new Err(writeResult.error);
    }
    const rollbackSource = () =>
      dustFs.write(sourcePath, originalSource, contentType);

    try {
      const publishResult = await publishFrameV2FromSourceWithSourceLockHeld(
        auth,
        {
          conversation,
          frame: freshFrame,
          manifestPath,
        }
      );
      if (publishResult.isErr()) {
        const rollbackResult = await rollbackSource();
        if (rollbackResult.isErr()) {
          return new Err(rollbackResult.error);
        }
      }

      return publishResult;
    } catch (error) {
      const rollbackResult = await rollbackSource();
      if (rollbackResult.isErr()) {
        throw rollbackResult.error;
      }
      throw error;
    }
  });
  if (publication.isErr()) {
    if (isLockAcquisitionTimeoutError(publication.error)) {
      return new Err(frameSourceConflictError());
    }
    return new Err(publication.error);
  }

  return publication;
}

export async function validateFrameV2FromSource(
  auth: Authenticator,
  {
    conversation,
    frame,
    manifestPath,
  }: {
    conversation: ConversationWithoutContentType;
    frame: FileResource;
    manifestPath: string;
  }
): Promise<
  Result<
    { warnings: ValidationWarning[] },
    FramePublicationError | SandboxFunctionError
  >
> {
  if (!frame.isFrameV2) {
    return frameError(
      "invalid_frame",
      `File '${frame.sId}' is not a Frames v2 manifest.`
    );
  }

  const validation = await withFrameSourceLock(frame.sId, async () => {
    const freshFrame = await frame.fetchFreshFrameV2(auth);
    if (!freshFrame) {
      return frameError(
        "invalid_frame",
        `Frame '${frame.sId}' no longer exists.`
      );
    }

    const source = await readFrameV2SourceWithSourceLockHeld(auth, {
      frame: freshFrame,
      manifestPath,
    });
    if (source.isErr()) {
      return source;
    }

    return validateFramePublication(auth, {
      conversation,
      ...source.value,
    });
  });
  if (validation.isErr()) {
    if (isLockAcquisitionTimeoutError(validation.error)) {
      return new Err(frameSourceConflictError());
    }
    return new Err(validation.error);
  }

  return validation;
}
