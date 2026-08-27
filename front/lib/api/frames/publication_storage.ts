import { randomUUID } from "node:crypto";
import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import type { Authenticator } from "@app/lib/auth";
import {
  GCS_OBJECT_DOES_NOT_EXIST_GENERATION_MATCH,
  getPrivateUploadBucket,
} from "@app/lib/file_storage";
import { isGCSNotFoundError } from "@app/lib/file_storage/types";
import type { FileResource } from "@app/lib/resources/file_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { FrameManifest } from "@app/types/api/frame_manifest";
import {
  isSafeFrameRelativePath,
  parseFrameManifest,
} from "@app/types/api/frame_manifest";
import {
  getFramePublicationManifestPath,
  getFramePublicationSourcePath,
} from "@app/types/api/frame_storage";
import type { AllSupportedFileContentType } from "@app/types/files";
import { frameV2ContentType } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

const FRAME_PUBLICATION_UPLOAD_CONCURRENCY = 4;

export type FramePublicationSourceFile = {
  relativePath: string;
  content: Buffer;
  contentType: AllSupportedFileContentType;
};

export class FramePublicationError extends Error {
  constructor(
    readonly code:
      | "invalid_frame"
      | "invalid_manifest"
      | "invalid_source"
      | "publication_not_found"
      | "source_not_found",
    message: string
  ) {
    super(message);
    this.name = "FramePublicationError";
  }
}

function getFrameIdentity(
  auth: Authenticator,
  frame: FileResource
): Result<{ workspaceId: string; frameId: string }, FramePublicationError> {
  const owner = auth.getNonNullableWorkspace();
  if (!frame.isFrameV2 || frame.workspaceId !== owner.id) {
    return new Err(
      new FramePublicationError(
        "invalid_frame",
        "Frame publication access requires a Frames v2 FileResource from the current workspace."
      )
    );
  }

  return new Ok({ workspaceId: owner.sId, frameId: frame.sId });
}

export async function storeFramePublication(
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
): Promise<Result<{ publicationId: string }, FramePublicationError>> {
  const frameIdentity = getFrameIdentity(auth, frame);
  if (frameIdentity.isErr()) {
    return frameIdentity;
  }

  const sourcePaths = new Set<string>();
  for (const sourceFile of sourceFiles) {
    if (!isSafeFrameRelativePath(sourceFile.relativePath)) {
      return new Err(
        new FramePublicationError(
          "invalid_source",
          `Invalid Frame source path: ${sourceFile.relativePath}`
        )
      );
    }
    if (sourcePaths.has(sourceFile.relativePath)) {
      return new Err(
        new FramePublicationError(
          "invalid_source",
          `Duplicate Frame source path: ${sourceFile.relativePath}`
        )
      );
    }
    sourcePaths.add(sourceFile.relativePath);
  }
  if (!sourcePaths.has(manifest.uiEntryPoint)) {
    return new Err(
      new FramePublicationError(
        "invalid_source",
        `Frame UI entry point not found: ${manifest.uiEntryPoint}`
      )
    );
  }
  for (const fn of manifest.functions) {
    if (!sourcePaths.has(fn.entryPoint)) {
      return new Err(
        new FramePublicationError(
          "invalid_source",
          `Frame function entry point not found: ${fn.name} (${fn.entryPoint})`
        )
      );
    }
  }

  const identity = {
    ...frameIdentity.value,
    publicationId: randomUUID(),
  };
  const storage = getPrivateUploadBucket();

  await concurrentExecutor(
    sourceFiles,
    (sourceFile) => {
      const filePath = getFramePublicationSourcePath({
        ...identity,
        relativePath: sourceFile.relativePath,
      });
      return storage.file(filePath).save(sourceFile.content, {
        contentType: sourceFile.contentType,
        preconditionOpts: {
          ifGenerationMatch: GCS_OBJECT_DOES_NOT_EXIST_GENERATION_MATCH,
        },
      });
    },
    { concurrency: FRAME_PUBLICATION_UPLOAD_CONCURRENCY }
  );

  // The manifest is the publication commit marker. Readers never observe a partial source write.
  const manifestPath = getFramePublicationManifestPath(identity);
  await storage.file(manifestPath).save(Buffer.from(JSON.stringify(manifest)), {
    contentType: frameV2ContentType,
    preconditionOpts: {
      ifGenerationMatch: GCS_OBJECT_DOES_NOT_EXIST_GENERATION_MATCH,
    },
  });

  return new Ok({ publicationId: identity.publicationId });
}

export async function loadFramePublicationManifest(
  auth: Authenticator,
  {
    frame,
    publicationId,
  }: {
    frame: FileResource;
    publicationId: string;
  }
): Promise<Result<FrameManifest, FramePublicationError>> {
  const frameIdentity = getFrameIdentity(auth, frame);
  if (frameIdentity.isErr()) {
    return frameIdentity;
  }

  const manifestPath = getFramePublicationManifestPath({
    ...frameIdentity.value,
    publicationId,
  });
  let manifestBuffer: Uint8Array<ArrayBuffer>;
  try {
    manifestBuffer =
      await getPrivateUploadBucket().fetchFileBuffer(manifestPath);
  } catch (error) {
    if (isGCSNotFoundError(error)) {
      return new Err(
        new FramePublicationError(
          "publication_not_found",
          `Frame publication not found: ${publicationId}`
        )
      );
    }
    throw error;
  }

  const manifest = parseFrameManifest(Buffer.from(manifestBuffer));
  if (manifest.isErr()) {
    return new Err(
      new FramePublicationError("invalid_manifest", manifest.error)
    );
  }

  return manifest;
}

export async function activateFramePublication(
  auth: Authenticator,
  {
    frame,
    publicationId,
  }: {
    frame: FileResource;
    publicationId: string;
  }
): Promise<Result<void, FramePublicationError>> {
  const manifest = await loadFramePublicationManifest(auth, {
    frame,
    publicationId,
  });
  if (manifest.isErr()) {
    return manifest;
  }

  await frame.setActiveFramePublication(publicationId);

  void emitAuditLogEvent({
    auth,
    action: "frame.publication_activated",
    targets: [
      buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
      buildAuditLogTarget("frame", {
        sId: frame.sId,
        name: frame.fileName,
      }),
    ],
    context: getAuditLogContext(auth),
    metadata: {
      frame_id: frame.sId,
      publication_id: publicationId,
    },
  });

  return new Ok(undefined);
}

export async function publishFramePublication(
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
): Promise<Result<{ publicationId: string }, FramePublicationError>> {
  const publication = await storeFramePublication(auth, {
    frame,
    manifest,
    sourceFiles,
  });
  if (publication.isErr()) {
    return publication;
  }

  const activation = await activateFramePublication(auth, {
    frame,
    publicationId: publication.value.publicationId,
  });
  if (activation.isErr()) {
    return activation;
  }

  return publication;
}

export async function loadFramePublicationSourceFile(
  auth: Authenticator,
  {
    frame,
    publicationId,
    relativePath,
  }: {
    frame: FileResource;
    publicationId: string;
    relativePath: string;
  }
): Promise<Result<Buffer, FramePublicationError>> {
  if (!isSafeFrameRelativePath(relativePath)) {
    return new Err(
      new FramePublicationError(
        "invalid_source",
        `Invalid Frame source path: ${relativePath}`
      )
    );
  }

  const manifest = await loadFramePublicationManifest(auth, {
    frame,
    publicationId,
  });
  if (manifest.isErr()) {
    return manifest;
  }

  const owner = auth.getNonNullableWorkspace();
  const sourcePath = getFramePublicationSourcePath({
    workspaceId: owner.sId,
    frameId: frame.sId,
    publicationId,
    relativePath,
  });
  try {
    const sourceBuffer =
      await getPrivateUploadBucket().fetchFileBuffer(sourcePath);
    return new Ok(Buffer.from(sourceBuffer));
  } catch (error) {
    if (isGCSNotFoundError(error)) {
      return new Err(
        new FramePublicationError(
          "source_not_found",
          `Frame publication source file not found: ${relativePath}`
        )
      );
    }
    throw error;
  }
}
