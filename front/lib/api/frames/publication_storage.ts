import { randomUUID } from "node:crypto";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import type { FileResource } from "@app/lib/resources/file_resource";
import type { FrameManifest } from "@app/types/api/frame_manifest";
import { isSafeFrameRelativePath } from "@app/types/api/frame_manifest";
import {
  getFramePublicationManifestPath,
  getFramePublicationSourcePath,
} from "@app/types/api/frame_storage";
import type { AllSupportedFileContentType } from "@app/types/files";
import { frameV2ContentType } from "@app/types/files";

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
  const workspace = auth.getNonNullableWorkspace();
  if (!frame.isFrameV2 || frame.workspaceId !== workspace.id) {
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
    workspaceId: workspace.sId,
    frameId: frame.sId,
    publicationId: randomUUID(),
  };
  const storage = getPrivateUploadBucket();

  for (const sourceFile of sourceFiles) {
    await storage.uploadBufferToBucketAsNewFile({
      buffer: sourceFile.content,
      contentType: sourceFile.contentType,
      filePath: getFramePublicationSourcePath({
        ...identity,
        relativePath: sourceFile.relativePath,
      }),
    });
  }

  // The manifest is the publication commit marker. Readers never observe a partial source write.
  await storage.uploadBufferToBucketAsNewFile({
    buffer: Buffer.from(JSON.stringify(manifest), "utf8"),
    contentType: frameV2ContentType,
    filePath: getFramePublicationManifestPath(identity),
  });

  return { publicationId: identity.publicationId };
}
