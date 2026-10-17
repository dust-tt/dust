import path from "node:path";

import { DustFileSystem } from "@app/lib/api/file_system";
import type { ValidationWarning } from "@app/lib/api/files/content_validation";
import {
  buildAndPublishFramePublication,
  buildFramePublication,
} from "@app/lib/api/frames/build_and_publish";
import { reconcileFramePublicationDatabasesOnStagedSource } from "@app/lib/api/frames/database_reconciliation";
import { withFrameSourceLock } from "@app/lib/api/frames/operation_lock";
import type { FramePublicationSourceFile } from "@app/lib/api/frames/publication_storage";
import {
  buildFramePublicationContracts,
  FramePublicationError,
  publishFramePublication,
} from "@app/lib/api/frames/publication_storage";
import { registerFrameV2FromSourceUsingFileSystem } from "@app/lib/api/frames/register_from_source";
import { withStagedFrameSource } from "@app/lib/api/frames/source_staging";
import { ensureFrameSandboxReady } from "@app/lib/api/sandbox/lifecycle";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import { getFrameFunctionSharingConflict } from "@app/lib/api/share/frame_sharing";
import { createMountFrameSourceReader } from "@app/lib/api/viz/build_frame_bundle";
import {
  parseSourceLocation,
  replaceJsxTextAtSourceLocation,
} from "@app/lib/api/viz/edit_source_text";
import type { PublishFrameError } from "@app/lib/api/viz/publish_frame";
import { publishFrame } from "@app/lib/api/viz/publish_frame";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { isLockAcquisitionTimeoutError } from "@app/lib/lock";
import { FileResource } from "@app/lib/resources/file_resource";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { FrameManifest } from "@app/types/api/frame_manifest";
import {
  FRAME_MANIFEST_FILE,
  isSafeFrameRelativePath,
  parseFrameManifest,
} from "@app/types/api/frame_manifest";
import type {
  FramePublicationStatus,
  FramePublishMode,
} from "@app/types/api/frame_publication";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { DustFileSystemError } from "@app/types/file_system";
import {
  contentTypeFromFileName,
  isAllSupportedFileContentType,
  normalizeMimeType,
} from "@app/types/files";
import { splitFrameEntryScopedPath } from "@app/types/mount_path";
import {
  isFramesV2FunctionsEnabled,
  isFramesV2PublicFunctionsEnabled,
} from "@app/types/shared/feature_flags";
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

/**
 * @cc [owner:davidebbo,label:product] frame-functions-publish-gate
 * Publishing a manifest that declares functions or databases MUST fail with `invalid_manifest`,
 * before any build, unless Frame functions are enabled (see isFramesV2FunctionsEnabled). The
 * previous publication stays live.
 */
async function checkFrameFunctionsFeature(
  auth: Authenticator,
  manifest: FrameManifest
): Promise<Result<void, FramePublicationError>> {
  if (manifest.functions.length === 0 && manifest.databases.length === 0) {
    return new Ok(undefined);
  }
  const featureFlags = await getFeatureFlags(auth);
  if (isFramesV2FunctionsEnabled(featureFlags)) {
    return new Ok(undefined);
  }
  return frameError(
    "invalid_manifest",
    "Frame functions and databases are not enabled for this workspace. Remove `functions` and " +
      "`databases` from the manifest and keep the Frame client-only."
  );
}

type CheckFrameFunctionSharingParams = {
  frame: FileResource;
  manifest: FrameManifest;
};

/**
 * Refuses, before the build, a publication with functions that would lock out viewers the Frame is
 * already shared with. The previous publication stays live.
 */
async function checkFrameFunctionSharing(
  auth: Authenticator,
  { frame, manifest }: CheckFrameFunctionSharingParams
): Promise<Result<void, FramePublicationError>> {
  const conflict = await getFrameFunctionSharingConflict(auth, frame, {
    declaresFunctions: manifest.functions.length > 0,
  });
  return conflict
    ? frameError("sharing_conflict", conflict)
    : new Ok(undefined);
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
      status: FramePublicationStatus;
      created: boolean;
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
    {
      dustFs: DustFileSystem;
      frame: FileResource;
      normalizedPath: string;
      created: boolean;
    },
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

  const [existing] = await FileResource.fetchByMountFilePaths(auth, [
    mountFilePath,
  ]);
  if (existing?.isFrameV2 || existing?.isInteractiveContent) {
    return new Ok({
      dustFs,
      frame: existing,
      normalizedPath,
      created: false,
    });
  }
  if (existing) {
    return frameError(
      "invalid_source",
      "A non-Frame file is already registered at this path."
    );
  }

  // First publish of a v2 package: mint identity from the on-disk manifest, then publish.
  if (path.posix.basename(normalizedPath) !== FRAME_MANIFEST_FILE) {
    return frameError("invalid_source", `No Frame found at ${normalizedPath}.`);
  }

  const registered = await registerFrameV2FromSourceUsingFileSystem(auth, {
    dustFs,
    manifestPath: normalizedPath,
  });
  if (registered.isErr()) {
    return registered;
  }

  return new Ok({
    dustFs,
    frame: registered.value.frame,
    normalizedPath,
    created: registered.value.created,
  });
}

export type PublishFrameFromSourceParams = {
  conversation: ConversationWithoutContentType;
  publishedByAgentConfigurationId: string;
  sourcePath: string;
  /**
   * Entry file of a legacy Frame that the v2 manifest at `sourcePath` replaces. The legacy
   * Frame's identity is converted in place once the replacement builds.
   */
  replacesPath?: string;
  /**
   * `draft` publishes a Frames v2 change for editors only; a Frame with nothing live goes live
   * anyway.
   */
  mode: FramePublishMode;
};

export async function publishFrameFromSource(
  auth: Authenticator,
  {
    conversation,
    publishedByAgentConfigurationId,
    sourcePath,
    replacesPath,
    mode,
  }: PublishFrameFromSourceParams
): Promise<Result<PublishFrameFromSourceResult, PublishFrameFromSourceError>> {
  if (replacesPath) {
    return replaceLegacyFrameFromSource(auth, {
      conversation,
      legacyEntryPath: replacesPath,
      manifestPath: sourcePath,
      publishedByAgentConfigurationId,
    });
  }

  const resolved = await resolveFrameFromSource(auth, {
    conversation,
    sourcePath,
  });
  if (resolved.isErr()) {
    return resolved;
  }
  const { dustFs, frame, normalizedPath, created } = resolved.value;

  if (frame.isFrameV2) {
    const publication = await publishFrameV2FromSource(auth, {
      conversation,
      frame,
      manifestPath: normalizedPath,
      publishedByAgentConfigurationId,
      mode,
    });
    if (publication.isErr()) {
      return new Err(publication.error);
    }

    return new Ok({
      kind: "v2",
      frameId: frame.sId,
      sourcePath: normalizedPath,
      publicationId: publication.value.publicationId,
      status: publication.value.status,
      created,
    });
  }

  if (mode === "draft") {
    return frameError(
      "invalid_source",
      "Drafts are only supported for Frames v2."
    );
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

type ReplaceLegacyFrameFromSourceParams = {
  conversation: ConversationWithoutContentType;
  legacyEntryPath: string;
  manifestPath: string;
  publishedByAgentConfigurationId: string;
};

type LegacyFrameReplacementTarget = {
  dustFs: DustFileSystem;
  legacyEntryPath: string;
  legacyFrameId: string;
  legacyMountFilePath: string;
  manifestMountFilePath: string;
  manifestPath: string;
  mount: { kind: "conversation" | "pod"; id: string };
};

/**
 * Check that a legacy Frame and the v2 manifest replacing it share one writable conversation or
 * Pod mount, that a legacy Frame is registered at the entry path, and that the manifest has no
 * identity of its own yet.
 */
async function resolveLegacyFrameReplacement(
  auth: Authenticator,
  {
    conversation,
    legacyEntryPath,
    manifestPath,
  }: ReplaceLegacyFrameFromSourceParams
): Promise<
  Result<
    LegacyFrameReplacementTarget,
    DustFileSystemError | FramePublicationError
  >
> {
  const normalizedManifestPath =
    DustFileSystem.normalizeScopedPath(manifestPath);
  const normalizedLegacyPath =
    DustFileSystem.normalizeScopedPath(legacyEntryPath);
  if (
    !normalizedManifestPath ||
    !normalizedLegacyPath ||
    path.posix.basename(normalizedManifestPath) !== FRAME_MANIFEST_FILE
  ) {
    return frameError(
      "invalid_source",
      `Replacing a legacy Frame requires a ${FRAME_MANIFEST_FILE} source and the legacy entry file.`
    );
  }

  const fsResult = await DustFileSystem.forConversation(auth, conversation);
  if (fsResult.isErr()) {
    return new Err(fsResult.error);
  }
  const dustFs = fsResult.value;

  const manifestWriteAccess = dustFs.checkWriteAccess(normalizedManifestPath);
  if (manifestWriteAccess.isErr()) {
    return new Err(manifestWriteAccess.error);
  }
  const legacyWriteAccess = dustFs.checkWriteAccess(normalizedLegacyPath);
  if (legacyWriteAccess.isErr()) {
    return new Err(legacyWriteAccess.error);
  }

  const mount = dustFs
    .getMounts()
    .find(
      (candidate) =>
        normalizedManifestPath.startsWith(`${candidate.scopedPrefix}/`) &&
        candidate.permissions.canWrite
    );
  const isAuthoringMount =
    mount?.kind === "conversation" || mount?.kind === "pod";
  const isSameMount =
    mount !== undefined &&
    normalizedLegacyPath.startsWith(`${mount.scopedPrefix}/`);
  if (!mount || !isAuthoringMount || !isSameMount) {
    return frameError(
      "invalid_source",
      "A Frame and the legacy Frame it replaces must live in the same conversation or Pod."
    );
  }

  const manifestMountFilePath = dustFs.toMountFilePath(normalizedManifestPath);
  const legacyMountFilePath = dustFs.toMountFilePath(normalizedLegacyPath);
  if (!manifestMountFilePath || !legacyMountFilePath) {
    return frameError("invalid_source", "Invalid Frame source path.");
  }

  const registered = await FileResource.fetchByMountFilePaths(auth, [
    legacyMountFilePath,
    manifestMountFilePath,
  ]);
  const legacyFrame = registered.find(
    (file) => file.mountFilePath === legacyMountFilePath
  );
  const manifestFile = registered.find(
    (file) => file.mountFilePath === manifestMountFilePath
  );
  if (!legacyFrame?.isInteractiveContent) {
    return frameError(
      "invalid_source",
      `No legacy Frame found at ${normalizedLegacyPath}.`
    );
  }
  if (manifestFile) {
    return frameError(
      "invalid_source",
      `A separate Frame already exists at ${normalizedManifestPath}, so it cannot replace the legacy Frame. Stop and ask the user whether to delete it from the Dust UI or keep both Frames.`
    );
  }

  return new Ok({
    dustFs,
    legacyEntryPath: normalizedLegacyPath,
    legacyFrameId: legacyFrame.sId,
    legacyMountFilePath,
    manifestMountFilePath,
    manifestPath: normalizedManifestPath,
    mount: {
      kind: mount.kind === "pod" ? "pod" : "conversation",
      id: mount.id,
    },
  });
}

/**
 * Reconcile declared databases on the Frame sandbox after legacy→v2 conversion.
 * Staging + reconcile only; callers own convert/restore. No-op when no databases.
 */
async function reconcileConvertedLegacyFrameDatabases(
  auth: Authenticator,
  {
    frame,
    manifest,
    sourceFiles,
  }: {
    frame: FileResource;
    manifest: FrameManifest;
    sourceFiles: FramePublicationSourceFile[];
  }
): Promise<Result<void, SandboxFunctionError>> {
  if (manifest.databases.length === 0) {
    return new Ok(undefined);
  }

  const ensureResult = await ensureFrameSandboxReady(auth, frame);
  if (ensureResult.isErr()) {
    return new Err(
      new SandboxFunctionError(
        "sandbox_unavailable",
        ensureResult.error.message
      )
    );
  }
  const { sandbox } = ensureResult.value;
  return withStagedFrameSource(
    auth,
    { sandbox, sourceFiles },
    async (stagingDirectory) =>
      reconcileFramePublicationDatabasesOnStagedSource(auth, {
        frame,
        sandbox,
        stagingDirectory,
        manifest,
      })
  );
}

/**
 * @cc [owner:pierremilliotte,label:product;backend] legacy-frame-replacement-is-atomic
 * Replacing a legacy Frame MUST leave it untouched unless the v2 replacement builds, passes its
 * publication contracts, and activates. A build or contract failure MUST NOT convert the legacy
 * FileResource; a failure after conversion MUST restore it. The legacy entry file MUST only be
 * deleted once the replacement is active.
 */
async function replaceLegacyFrameFromSource(
  auth: Authenticator,
  params: ReplaceLegacyFrameFromSourceParams
): Promise<Result<PublishFrameFromSourceResult, PublishFrameFromSourceError>> {
  const resolved = await resolveLegacyFrameReplacement(auth, params);
  if (resolved.isErr()) {
    return resolved;
  }
  const target = resolved.value;

  const publication = await withFrameSourceLock<
    { publicationId: string; status: FramePublicationStatus },
    PublishFrameFromSourceError
  >(target.legacyFrameId, async () => {
    const legacyFrame = await FileResource.fetchById(
      auth,
      target.legacyFrameId
    );
    const isStillLegacy =
      legacyFrame?.isInteractiveContent === true &&
      legacyFrame.mountFilePath === target.legacyMountFilePath;
    if (!legacyFrame || !isStillLegacy) {
      return frameError(
        "invalid_frame",
        `Legacy Frame '${target.legacyFrameId}' changed during the replacement; retry.`
      );
    }

    const source = await readFrameV2SourceTree(
      target.dustFs,
      target.manifestPath
    );
    if (source.isErr()) {
      return source;
    }
    const { manifest, sourceFiles } = source.value;

    const featureCheck = await checkFrameFunctionsFeature(auth, manifest);
    if (featureCheck.isErr()) {
      return featureCheck;
    }

    const sharingCheck = await checkFrameFunctionSharing(auth, {
      frame: legacyFrame,
      manifest,
    });
    if (sharingCheck.isErr()) {
      return sharingCheck;
    }

    // Build on the conversation sandbox: ensureFrameSandboxReady requires Frames v2, and
    // conversion must wait until build + contracts succeed (legacy-frame-replacement-is-atomic).
    // DB reconcile runs after conversion on the Frame sandbox.
    const build = await buildFramePublication(auth, {
      frame: legacyFrame,
      manifest,
      sourceFiles,
      reconcileDatabases: false,
      functionSandbox: {
        kind: "conversation",
        conversation: params.conversation,
      },
    });
    if (build.isErr()) {
      return build;
    }
    const { functionArtifacts, uiBundleCode } = build.value;

    const publicFunctionsEnabled = isFramesV2PublicFunctionsEnabled(
      await getFeatureFlags(auth)
    );

    const contracts = buildFramePublicationContracts({
      functionArtifacts,
      manifest,
      publicFunctionsEnabled,
      sourceFiles,
    });
    if (contracts.isErr()) {
      return contracts;
    }

    const manifestSource = sourceFiles.find(
      (sourceFile) => sourceFile.relativePath === FRAME_MANIFEST_FILE
    );
    const legacyFields = await legacyFrame.convertLegacyFrameToFrameV2(auth, {
      fileSize: manifestSource?.content.length ?? 0,
      mountFilePath: target.manifestMountFilePath,
      useCase: target.mount.kind === "pod" ? "project_context" : "conversation",
      useCaseMetadata:
        target.mount.kind === "pod"
          ? { spaceId: target.mount.id }
          : { conversationId: target.mount.id },
    });

    const logContext = {
      workspaceId: auth.getNonNullableWorkspace().sId,
      frameId: target.legacyFrameId,
      legacyMountFilePath: target.legacyMountFilePath,
      manifestMountFilePath: target.manifestMountFilePath,
    };
    try {
      const reconciliation = await reconcileConvertedLegacyFrameDatabases(
        auth,
        {
          frame: legacyFrame,
          manifest,
          sourceFiles,
        }
      );
      if (reconciliation.isErr()) {
        logger.warn(
          { ...logContext, error: reconciliation.error },
          "Legacy Frame v2 database reconcile failed, restoring legacy Frame"
        );
        await legacyFrame.restoreLegacyFrame(legacyFields);
        return reconciliation;
      }

      const published = await publishFramePublication(auth, {
        frame: legacyFrame,
        functionArtifacts,
        manifest,
        sourceFiles,
        uiBundleCode,
        publishedByAgentConfigurationId: params.publishedByAgentConfigurationId,
        mode: "live",
      });
      if (published.isErr()) {
        logger.warn(
          { ...logContext, error: published.error },
          "Legacy Frame v2 publication failed, restoring legacy Frame"
        );
        await legacyFrame.restoreLegacyFrame(legacyFields);
      }
      return published;
    } catch (error) {
      logger.error(
        { ...logContext, error },
        "Legacy Frame v2 publication threw, restoring legacy Frame"
      );
      await legacyFrame.restoreLegacyFrame(legacyFields);
      throw error;
    }
  });
  if (publication.isErr()) {
    if (isLockAcquisitionTimeoutError(publication.error)) {
      return new Err(frameSourceConflictError());
    }
    return new Err(publication.error);
  }

  if (target.mount.kind === "pod") {
    await repointPodFrameReferences(auth, {
      podId: target.mount.id,
      oldFramePath: target.legacyEntryPath,
      newManifestPath: target.manifestPath,
    });
  }

  // The Frame is already live on its manifest: a leftover entry is stray source, not a reason to
  // fail the publish.
  const legacyEntryDeletion = await target.dustFs.delete(
    target.legacyEntryPath,
    { ignoreNotFound: true }
  );
  if (legacyEntryDeletion.isErr()) {
    logger.warn(
      {
        workspaceId: auth.getNonNullableWorkspace().sId,
        frameId: target.legacyFrameId,
        legacyEntryPath: target.legacyEntryPath,
        error: legacyEntryDeletion.error,
      },
      "Failed to delete the legacy Frame entry after its v2 replacement"
    );
  }

  return new Ok({
    kind: "v2",
    frameId: target.legacyFrameId,
    sourcePath: target.manifestPath,
    publicationId: publication.value.publicationId,
    status: publication.value.status,
    created: false,
  });
}

type PodFrameReferencesRepoint = {
  podId: string;
  oldFramePath: string;
  newManifestPath: string;
};

// The replacement is already active. A dangling tab renders as a missing tab in the Pod UI,
// which is a better outcome than failing a publish whose Frame is already live.
async function repointPodFrameReferences(
  auth: Authenticator,
  { podId, oldFramePath, newManifestPath }: PodFrameReferencesRepoint
): Promise<void> {
  try {
    const [metadata] = await ProjectMetadataResource.fetchBySpaceIds(auth, [
      podId,
    ]);
    await metadata?.renameFramePath(oldFramePath, newManifestPath);
  } catch (error) {
    logger.warn(
      { error, podId, oldFramePath, newManifestPath },
      "Legacy Frame replaced but its Pod references could not be repointed"
    );
  }
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
): Promise<Result<FrameV2SourceTree, FramePublicationError>> {
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

  return readFrameV2SourceTree(dustFs, canonicalManifestPath);
}

type FrameV2SourceTree = {
  manifest: FrameManifest;
  sourceFiles: FramePublicationSourceFile[];
};

/** Capture the manifest and source tree of the Frames v2 folder holding `canonicalManifestPath`. */
async function readFrameV2SourceTree(
  dustFs: DustFileSystem,
  canonicalManifestPath: string
): Promise<Result<FrameV2SourceTree, FramePublicationError>> {
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

  return new Ok({
    manifest: manifestResult.value,
    sourceFiles,
  });
}

/**
 * Publish from an already-captured source tree. Callers that hold the source lock and have the
 * package bytes in memory (e.g. after applying live edits) skip a second mount download.
 */
async function publishFrameV2FromCapturedSourceWithSourceLockHeld(
  auth: Authenticator,
  {
    frame,
    manifest,
    sourceFiles,
    publishedByAgentConfigurationId,
    mode,
  }: {
    frame: FileResource;
    manifest: FrameManifest;
    sourceFiles: FramePublicationSourceFile[];
    publishedByAgentConfigurationId?: string;
    mode: FramePublishMode;
  }
): Promise<
  Result<
    { publicationId: string; status: FramePublicationStatus },
    FramePublicationError | SandboxFunctionError
  >
> {
  const featureCheck = await checkFrameFunctionsFeature(auth, manifest);
  if (featureCheck.isErr()) {
    return featureCheck;
  }

  const sharingCheck = await checkFrameFunctionSharing(auth, {
    frame,
    manifest,
  });
  if (sharingCheck.isErr()) {
    return sharingCheck;
  }

  return buildAndPublishFramePublication(auth, {
    frame,
    manifest,
    sourceFiles,
    publishedByAgentConfigurationId,
    mode,
  });
}

async function publishFrameV2FromSourceWithSourceLockHeld(
  auth: Authenticator,
  {
    frame,
    manifestPath,
    publishedByAgentConfigurationId,
    mode,
  }: {
    conversation: ConversationWithoutContentType;
    frame: FileResource;
    manifestPath: string;
    publishedByAgentConfigurationId?: string;
    mode: FramePublishMode;
  }
): Promise<
  Result<
    { publicationId: string; status: FramePublicationStatus },
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

  return publishFrameV2FromCapturedSourceWithSourceLockHeld(auth, {
    frame,
    manifest: source.value.manifest,
    sourceFiles: source.value.sourceFiles,
    publishedByAgentConfigurationId,
    mode,
  });
}

export async function publishFrameV2FromSource(
  auth: Authenticator,
  {
    conversation,
    frame,
    manifestPath,
    publishedByAgentConfigurationId,
    mode,
  }: {
    conversation: ConversationWithoutContentType;
    frame: FileResource;
    manifestPath: string;
    publishedByAgentConfigurationId?: string;
    mode: FramePublishMode;
  }
): Promise<
  Result<
    { publicationId: string; status: FramePublicationStatus },
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
      publishedByAgentConfigurationId,
      mode,
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

export type FrameV2TextEdit = {
  source: string;
  oldText: string;
  newText: string;
};

// Human-staged edits from one Save. Applying them re-parses the file per edit, so the batch
// must stay small (avoid-quadratic-loops).
export const MAX_FRAME_TEXT_EDITS = 50;

/**
 * @cc [owner:davidebbo,label:product;security] panel-save-keeps-pending-draft
 * A user text edit MUST publish as a draft whenever the Frame has a pending draft. The source
 * folder holds the draft's changes, so a live publish would ship them unreviewed.
 */
/**
 * Apply one or more location-based text edits to a Frames v2 package, then publish once.
 *
 * Each edit is a small diff (`oldText` → `newText`) anchored at `data-source`. Edits are applied
 * against the **current** source on disk (not a client snapshot), so concurrent agent edits to
 * other spans still succeed as long as each `oldText` remains findable. The package is captured
 * once, patched in memory, written, then published from those bytes (no second mount download).
 * All writes and the publish run under the Frame source lock; on publish failure every touched
 * file is rolled back.
 */
export async function editFrameV2TextsAtSource(
  auth: Authenticator,
  {
    frame,
    edits,
  }: {
    frame: FileResource;
    edits: FrameV2TextEdit[];
  }
): Promise<
  Result<
    { publicationId: string; status: FramePublicationStatus },
    PublishFrameFromSourceError
  >
> {
  if (edits.length === 0) {
    return frameError("invalid_source", "No edits provided.");
  }

  if (!frame.isFrameV2) {
    return frameError(
      "invalid_frame",
      `File '${frame.sId}' is not a Frames v2 manifest.`
    );
  }

  const parsedEdits: Array<{
    relPath: string;
    line: number;
    col: number;
    oldText: string;
    newText: string;
  }> = [];
  for (const edit of edits) {
    const location = parseSourceLocation(edit.source);
    if (!location || !isSafeFrameRelativePath(location.relPath)) {
      return frameError(
        "invalid_source",
        `Invalid source location: ${edit.source}.`
      );
    }
    parsedEdits.push({
      relPath: location.relPath,
      line: location.line,
      col: location.col,
      oldText: edit.oldText,
      newText: edit.newText,
    });
  }

  const editTimingContext = {
    workspaceId: auth.getNonNullableWorkspace().sId,
    frameId: frame.sId,
  };
  const logEditStep = (
    step: string,
    startedAt: number,
    extra?: { fileCount?: number }
  ) => {
    logger.info(
      {
        ...editTimingContext,
        step,
        durationMs: Date.now() - startedAt,
        ...extra,
      },
      "Frame edit-text step timing"
    );
  };

  const editTotalStartedAt = Date.now();
  const publication = await withFrameSourceLock<
    { publicationId: string; status: FramePublicationStatus },
    PublishFrameFromSourceError
  >(frame.sId, async () => {
    let stepStartedAt = Date.now();

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
    const packageDir = path.posix.dirname(manifestPath);
    logEditStep("resolve", stepStartedAt);

    stepStartedAt = Date.now();
    const source = await readFrameV2SourceTree(dustFs, manifestPath);
    if (source.isErr()) {
      return source;
    }
    logEditStep("source_capture", stepStartedAt, {
      fileCount: source.value.sourceFiles.length,
    });

    stepStartedAt = Date.now();
    const editsByRelPath = new Map<
      string,
      Array<{ line: number; col: number; oldText: string; newText: string }>
    >();
    for (const edit of parsedEdits) {
      const list = editsByRelPath.get(edit.relPath) ?? [];
      list.push({
        line: edit.line,
        col: edit.col,
        oldText: edit.oldText,
        newText: edit.newText,
      });
      editsByRelPath.set(edit.relPath, list);
    }

    for (const relPath of editsByRelPath.keys()) {
      if (
        !source.value.sourceFiles.some(
          (sourceFile) => sourceFile.relativePath === relPath
        )
      ) {
        return frameError(
          "invalid_source",
          `Frame source file not found: ${relPath}`
        );
      }
    }

    // Patch every target in memory before writing, so a failed later edit cannot leave earlier
    // files written but unpublished.
    const plannedWrites: Array<{
      sourcePath: string;
      originalSource: Buffer;
      content: Buffer;
      contentType: FramePublicationSourceFile["contentType"];
    }> = [];
    const patchedSourceFiles: FramePublicationSourceFile[] = [];
    for (const sourceFile of source.value.sourceFiles) {
      const fileEdits = editsByRelPath.get(sourceFile.relativePath);
      if (!fileEdits) {
        patchedSourceFiles.push(sourceFile);
        continue;
      }

      // Each edit re-parses the file: O(edits × file size), bounded by MAX_FRAME_TEXT_EDITS.
      let content = sourceFile.content.toString("utf8");
      for (const fileEdit of fileEdits) {
        const edited = replaceJsxTextAtSourceLocation(content, fileEdit);
        if (edited.isErr()) {
          return frameError("invalid_source", edited.error.message);
        }
        content = edited.value;
      }

      const patchedContent = Buffer.from(content, "utf8");
      plannedWrites.push({
        sourcePath: path.posix.join(packageDir, sourceFile.relativePath),
        originalSource: sourceFile.content,
        content: patchedContent,
        contentType: sourceFile.contentType,
      });
      patchedSourceFiles.push({
        ...sourceFile,
        content: patchedContent,
      });
    }

    const manifestFile = patchedSourceFiles.find(
      (sourceFile) => sourceFile.relativePath === FRAME_MANIFEST_FILE
    );
    if (!manifestFile) {
      return frameError(
        "invalid_source",
        `Frame manifest not found: ${manifestPath}`
      );
    }
    const manifestResult = parseFrameManifest(manifestFile.content);
    if (manifestResult.isErr()) {
      return frameError("invalid_manifest", manifestResult.error);
    }
    logEditStep("apply_edits", stepStartedAt, {
      fileCount: plannedWrites.length,
    });

    const rollbacks: Array<
      () => Promise<Result<unknown, DustFileSystemError>>
    > = [];
    const rollbackAll = async () => {
      for (const rollback of [...rollbacks].reverse()) {
        const rollbackResult = await rollback();
        if (rollbackResult.isErr()) {
          return rollbackResult;
        }
      }
      return new Ok(undefined);
    };

    stepStartedAt = Date.now();
    for (const {
      sourcePath,
      originalSource,
      content,
      contentType,
    } of plannedWrites) {
      const writeResult = await dustFs.write(sourcePath, content, contentType);
      if (writeResult.isErr()) {
        const rollbackResult = await rollbackAll();
        return new Err(
          rollbackResult.isErr() ? rollbackResult.error : writeResult.error
        );
      }
      rollbacks.push(() =>
        dustFs.write(sourcePath, originalSource, contentType)
      );
    }
    logEditStep("source_write", stepStartedAt);

    try {
      stepStartedAt = Date.now();
      const publishResult =
        await publishFrameV2FromCapturedSourceWithSourceLockHeld(auth, {
          frame: freshFrame,
          manifest: manifestResult.value,
          sourceFiles: patchedSourceFiles,
          // A Save while a draft is pending must not push the draft's unreviewed changes live: the
          // source folder already holds them.
          mode: freshFrame.pendingDraftPublicationId ? "draft" : "live",
        });
      logEditStep("publish", stepStartedAt);
      if (publishResult.isErr()) {
        const rollbackResult = await rollbackAll();
        if (rollbackResult.isErr()) {
          return new Err(rollbackResult.error);
        }
      }

      return publishResult;
    } catch (error) {
      const rollbackResult = await rollbackAll();
      if (rollbackResult.isErr()) {
        throw rollbackResult.error;
      }
      throw error;
    }
  });
  logEditStep("total", editTotalStartedAt);
  if (publication.isErr()) {
    if (isLockAcquisitionTimeoutError(publication.error)) {
      return new Err(frameSourceConflictError());
    }
    return new Err(publication.error);
  }

  return publication;
}
