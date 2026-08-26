import { randomUUID } from "node:crypto";
import type { Authenticator } from "@app/lib/auth";
import {
  GCS_OBJECT_DOES_NOT_EXIST_GENERATION_MATCH,
  getPrivateUploadBucket,
} from "@app/lib/file_storage";
import type { FileResource } from "@app/lib/resources/file_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { FrameManifest } from "@app/types/api/frame_manifest";
import { isSafeFrameRelativePath } from "@app/types/api/frame_manifest";
import {
  getFramePublicationManifestPath,
  getFramePublicationSourcePath,
} from "@app/types/api/frame_storage";
import type { AllSupportedFileContentType } from "@app/types/files";
import { frameV2ContentType } from "@app/types/files";

const FRAME_PUBLICATION_UPLOAD_CONCURRENCY = 4;

export type FramePublicationSourceFile = {
  relativePath: string;
  content: Buffer;
  contentType: AllSupportedFileContentType;
};

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
): Promise<{ publicationId: string }> {
  const owner = auth.getNonNullableWorkspace();
  if (!frame.isFrameV2 || frame.workspaceId !== owner.id) {
    throw new Error(
      "Frame publication storage requires a Frames v2 FileResource from the current workspace."
    );
  }

  const sourcePaths = new Set<string>();
  for (const sourceFile of sourceFiles) {
    if (!isSafeFrameRelativePath(sourceFile.relativePath)) {
      throw new Error(`Invalid Frame source path: ${sourceFile.relativePath}`);
    }
    if (sourcePaths.has(sourceFile.relativePath)) {
      throw new Error(
        `Duplicate Frame source path: ${sourceFile.relativePath}`
      );
    }
    sourcePaths.add(sourceFile.relativePath);
  }
  if (!sourcePaths.has(manifest.uiEntryPoint)) {
    throw new Error(`Frame UI entry point not found: ${manifest.uiEntryPoint}`);
  }

  const identity = {
    workspaceId: owner.sId,
    frameId: frame.sId,
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

  return { publicationId: identity.publicationId };
}
