import type { Authenticator } from "@app/lib/auth";
import {
  DEFAULT_SIGNED_URL_EXPIRATION_DELAY_MS,
  getPrivateUploadBucket,
} from "@app/lib/file_storage";

const GCS_CREATE_ONLY_HEADER = "x-goog-if-generation-match";
const GCS_CREATE_ONLY_VALUE = "0";

export const FILE_SYSTEM_CONTENT_URL_EXPIRATION_MS =
  2 * DEFAULT_SIGNED_URL_EXPIRATION_DELAY_MS;

function objectPath(
  auth: Authenticator,
  nodeId: number,
  blobId: string
): string {
  return `w/${auth.getNonNullableWorkspace().sId}/filesystem/blobs/${nodeId}/${blobId}`;
}

/** Sign a read for one immutable content version. */
export async function getFileSystemBlobDownloadUrl(
  auth: Authenticator,
  nodeId: number,
  blobId: string
): Promise<string> {
  return getPrivateUploadBucket().getSignedUrl(
    objectPath(auth, nodeId, blobId),
    { expirationDelayMs: FILE_SYSTEM_CONTENT_URL_EXPIRATION_MS }
  );
}

/**
 * Sign a create-only upload. The generation header prevents a delayed or
 * repeated PUT from changing bytes after this blob has been committed.
 */
export async function prepareFileSystemBlobUpload(
  auth: Authenticator,
  nodeId: number,
  blobId: string,
  contentType: string
): Promise<{ uploadUrl: string; headers: Record<string, string> }> {
  const headers = {
    "content-type": contentType,
    [GCS_CREATE_ONLY_HEADER]: GCS_CREATE_ONLY_VALUE,
  };
  const uploadUrl = await getPrivateUploadBucket().getSignedUploadUrl(
    objectPath(auth, nodeId, blobId),
    {
      contentType,
      expirationDelayMs: FILE_SYSTEM_CONTENT_URL_EXPIRATION_MS,
      extensionHeaders: {
        [GCS_CREATE_ONLY_HEADER]: GCS_CREATE_ONLY_VALUE,
      },
    }
  );

  return { uploadUrl, headers };
}

/** Read the metadata GCS recorded for a completed upload. */
export async function getFileSystemBlobMetadata(
  auth: Authenticator,
  nodeId: number,
  blobId: string
): Promise<{ size: number; contentType: string | undefined }> {
  const [metadata] = await getPrivateUploadBucket()
    .file(objectPath(auth, nodeId, blobId))
    .getMetadata();

  return {
    size: Number(metadata.size),
    contentType: metadata.contentType,
  };
}

export async function deleteFileSystemBlob(
  auth: Authenticator,
  nodeId: number,
  blobId: string
): Promise<void> {
  await getPrivateUploadBucket().delete(objectPath(auth, nodeId, blobId), {
    ignoreNotFound: true,
  });
}
