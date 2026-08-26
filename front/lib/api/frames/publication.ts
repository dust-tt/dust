import { randomUUID } from "node:crypto";
import path from "node:path";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { executeWithLock } from "@app/lib/lock";
import type { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import type { FrameManifest } from "@app/types/api/frame_manifest";
import {
  FRAME_MANIFEST_FILE,
  isSafeFrameRelativePath,
  parseFrameManifest,
} from "@app/types/api/frame_manifest";
import {
  getFramePublicationArtifactsBasePath,
  getFramePublicationBasePath,
  getFramePublicationManifestPath,
  getFramePublicationSourceBasePath,
  getFramePublicationSourcePath,
} from "@app/types/api/frame_storage";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

const MAX_FRAME_SOURCE_FILE_COUNT = 1000;

export type FramePublicationErrorCode =
  | "invalid_frame"
  | "invalid_manifest"
  | "invalid_source"
  | "not_published"
  | "storage_error";

export class FramePublicationError extends Error {
  constructor(
    readonly code: FramePublicationErrorCode,
    message: string
  ) {
    super(message);
    this.name = "FramePublicationError";
  }
}

export type ActiveFramePublication = {
  publicationId: string;
  manifest: FrameManifest;
  basePath: string;
  sourceBasePath: string;
  artifactsBasePath: string;
};

function validateSourcePrefix({
  workspaceId,
  sourcePrefix,
}: {
  workspaceId: string;
  sourcePrefix: string;
}): Result<string, FramePublicationError> {
  const workspacePrefix = `w/${workspaceId}/`;
  const normalized = path.posix.normalize(sourcePrefix);

  if (
    sourcePrefix.includes("\\") ||
    !sourcePrefix.endsWith("/") ||
    normalized !== sourcePrefix ||
    sourcePrefix === workspacePrefix ||
    !sourcePrefix.startsWith(workspacePrefix)
  ) {
    return new Err(
      new FramePublicationError(
        "invalid_source",
        "The Frame source prefix must be a normalized folder inside its workspace."
      )
    );
  }

  return new Ok(normalized);
}

function requiredManifestPaths(manifest: FrameManifest): string[] {
  return [
    manifest.uiEntryPoint,
    ...manifest.functions.map((fn) => fn.path),
    ...manifest.databases.map((db) => db.path),
  ];
}

async function cleanupIncompletePublication({
  publicationBasePath,
  frameId,
  publicationId,
}: {
  publicationBasePath: string;
  frameId: string;
  publicationId: string;
}): Promise<void> {
  try {
    await getPrivateUploadBucket().deleteByPrefix(publicationBasePath);
  } catch (err) {
    logger.error(
      {
        err: normalizeError(err),
        frameId,
        publicationId,
        publicationBasePath,
      },
      "Failed to clean up an incomplete Frame publication."
    );
  }
}

function activePublication({
  workspaceId,
  frameId,
  publicationId,
  manifest,
}: {
  workspaceId: string;
  frameId: string;
  publicationId: string;
  manifest: FrameManifest;
}): ActiveFramePublication {
  return {
    publicationId,
    manifest,
    basePath: getFramePublicationBasePath({
      workspaceId,
      frameId,
      publicationId,
    }),
    sourceBasePath: getFramePublicationSourceBasePath({
      workspaceId,
      frameId,
      publicationId,
    }),
    artifactsBasePath: getFramePublicationArtifactsBasePath({
      workspaceId,
      frameId,
      publicationId,
    }),
  };
}

/**
 * Snapshot a GCS-backed source folder into an immutable publication, then atomically activate it.
 * Every source object is copied at the generation returned by the initial listing. Old active
 * publications remain untouched, so readers either see the previous complete publication or the
 * new complete publication.
 */
export async function publishFrameFromGCS(
  auth: Authenticator,
  {
    frame,
    sourcePrefix,
  }: {
    frame: FileResource;
    sourcePrefix: string;
  }
): Promise<Result<ActiveFramePublication, FramePublicationError>> {
  const workspace = auth.getNonNullableWorkspace();
  if (frame.workspaceId !== workspace.id || !frame.isFrameV2) {
    return new Err(
      new FramePublicationError(
        "invalid_frame",
        "The FileResource is not a Frames v2 Frame in this workspace."
      )
    );
  }

  const sourcePrefixResult = validateSourcePrefix({
    workspaceId: workspace.sId,
    sourcePrefix,
  });
  if (sourcePrefixResult.isErr()) {
    return sourcePrefixResult;
  }

  try {
    return await executeWithLock(`frame:publish:${frame.sId}`, async () => {
      const publicationId = randomUUID();
      const publicationBasePath = getFramePublicationBasePath({
        workspaceId: workspace.sId,
        frameId: frame.sId,
        publicationId,
      });
      const bucket = getPrivateUploadBucket();

      try {
        const { files } = await bucket.getAllFilesByPrefix({
          prefix: sourcePrefixResult.value,
        });
        const sourceFiles = files.filter((file) => !file.name.endsWith("/"));
        if (sourceFiles.length === 0) {
          return new Err(
            new FramePublicationError(
              "invalid_source",
              "The Frame source folder is empty."
            )
          );
        }
        if (sourceFiles.length > MAX_FRAME_SOURCE_FILE_COUNT) {
          return new Err(
            new FramePublicationError(
              "invalid_source",
              `The Frame source folder has more than ${MAX_FRAME_SOURCE_FILE_COUNT} files.`
            )
          );
        }

        const relativePaths = new Set<string>();
        const sourceObjects: {
          sourcePath: string;
          destinationPath: string;
          generation: string;
        }[] = [];
        for (const sourceFile of sourceFiles) {
          if (!sourceFile.name.startsWith(sourcePrefixResult.value)) {
            return new Err(
              new FramePublicationError(
                "invalid_source",
                `Invalid source object '${sourceFile.name}'.`
              )
            );
          }
          const relativePath = sourceFile.name.slice(
            sourcePrefixResult.value.length
          );
          if (!isSafeFrameRelativePath(relativePath)) {
            return new Err(
              new FramePublicationError(
                "invalid_source",
                `Invalid source path '${relativePath}'.`
              )
            );
          }
          const destinationPath = getFramePublicationSourcePath({
            workspaceId: workspace.sId,
            frameId: frame.sId,
            publicationId,
            relativePath,
          });

          relativePaths.add(relativePath);
          const generation = sourceFile.metadata.generation;
          if (generation === undefined) {
            return new Err(
              new FramePublicationError(
                "invalid_source",
                `Source object '${sourceFile.name}' has no GCS generation.`
              )
            );
          }
          sourceObjects.push({
            sourcePath: sourceFile.name,
            destinationPath,
            generation: String(generation),
          });
        }

        if (!relativePaths.has(FRAME_MANIFEST_FILE)) {
          return new Err(
            new FramePublicationError(
              "invalid_manifest",
              `The Frame source folder has no ${FRAME_MANIFEST_FILE}.`
            )
          );
        }

        for (const sourceObject of sourceObjects) {
          await bucket.copyFile(
            sourceObject.sourcePath,
            sourceObject.destinationPath,
            bucket,
            { sourceGeneration: sourceObject.generation }
          );
        }

        const sourceManifestPath = getFramePublicationSourcePath({
          workspaceId: workspace.sId,
          frameId: frame.sId,
          publicationId,
          relativePath: FRAME_MANIFEST_FILE,
        });
        const manifestContent =
          await bucket.fetchFileContent(sourceManifestPath);
        const manifestResult = parseFrameManifest(
          Buffer.from(manifestContent, "utf-8")
        );
        if (manifestResult.isErr()) {
          await cleanupIncompletePublication({
            publicationBasePath,
            frameId: frame.sId,
            publicationId,
          });
          return new Err(
            new FramePublicationError("invalid_manifest", manifestResult.error)
          );
        }

        const missingPaths = requiredManifestPaths(manifestResult.value).filter(
          (requiredPath) => !relativePaths.has(requiredPath)
        );
        if (missingPaths.length > 0) {
          await cleanupIncompletePublication({
            publicationBasePath,
            frameId: frame.sId,
            publicationId,
          });
          return new Err(
            new FramePublicationError(
              "invalid_manifest",
              `Manifest paths not found in the source folder: ${missingPaths.join(", ")}.`
            )
          );
        }

        await bucket.uploadRawContentToBucket({
          content: `${JSON.stringify(manifestResult.value, null, 2)}\n`,
          contentType: "application/json",
          filePath: getFramePublicationManifestPath({
            workspaceId: workspace.sId,
            frameId: frame.sId,
            publicationId,
          }),
        });
        await frame.activateFramePublication(auth, publicationId);

        return new Ok(
          activePublication({
            workspaceId: workspace.sId,
            frameId: frame.sId,
            publicationId,
            manifest: manifestResult.value,
          })
        );
      } catch (err) {
        await cleanupIncompletePublication({
          publicationBasePath,
          frameId: frame.sId,
          publicationId,
        });
        return new Err(
          new FramePublicationError(
            "storage_error",
            normalizeError(err).message
          )
        );
      }
    });
  } catch (err) {
    return new Err(
      new FramePublicationError("storage_error", normalizeError(err).message)
    );
  }
}

export async function loadActiveFramePublication(
  auth: Authenticator,
  frame: FileResource
): Promise<Result<ActiveFramePublication, FramePublicationError>> {
  const workspace = auth.getNonNullableWorkspace();
  if (frame.workspaceId !== workspace.id || !frame.isFrameV2) {
    return new Err(
      new FramePublicationError(
        "invalid_frame",
        "The FileResource is not a Frames v2 Frame in this workspace."
      )
    );
  }

  const publicationId = frame.getActiveFramePublicationId();
  if (!publicationId) {
    return new Err(
      new FramePublicationError(
        "not_published",
        "The Frame has no active publication."
      )
    );
  }

  try {
    const manifestContent = await getPrivateUploadBucket().fetchFileContent(
      getFramePublicationManifestPath({
        workspaceId: workspace.sId,
        frameId: frame.sId,
        publicationId,
      })
    );
    const manifestResult = parseFrameManifest(
      Buffer.from(manifestContent, "utf-8")
    );
    if (manifestResult.isErr()) {
      return new Err(
        new FramePublicationError("storage_error", manifestResult.error)
      );
    }

    return new Ok(
      activePublication({
        workspaceId: workspace.sId,
        frameId: frame.sId,
        publicationId,
        manifest: manifestResult.value,
      })
    );
  } catch (err) {
    return new Err(
      new FramePublicationError("storage_error", normalizeError(err).message)
    );
  }
}
