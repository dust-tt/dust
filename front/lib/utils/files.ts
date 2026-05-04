import { hasProcessedVersion } from "@app/lib/api/files/processing";
import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";

async function copyVersion(
  auth: Authenticator,
  sourceFile: FileResource,
  targetFile: FileResource,
  version: "original" | "processed"
) {
  await sourceFile
    .getBucketForVersion(version)
    .copyFile(
      sourceFile.getCloudStoragePath(auth, version),
      targetFile.getCloudStoragePath(auth, version),
      targetFile.getBucketForVersion(version)
    );
}

export async function copyContent(
  auth: Authenticator,
  sourceFile: FileResource,
  targetFile: FileResource,
  {
    includeProcessedVersion = false,
  }: { includeProcessedVersion?: boolean } = {}
) {
  await copyVersion(auth, sourceFile, targetFile, "original");

  if (
    !includeProcessedVersion ||
    !hasProcessedVersion(sourceFile.contentType)
  ) {
    return;
  }

  await copyVersion(auth, sourceFile, targetFile, "processed");
}
