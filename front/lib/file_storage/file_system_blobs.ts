import type { Authenticator } from "@app/lib/auth";
import {
  DEFAULT_SIGNED_URL_EXPIRATION_DELAY_MS,
  getPrivateUploadBucket,
} from "@app/lib/file_storage";

const GCS_CREATE_ONLY_HEADER = "x-goog-if-generation-match";
const GCS_CREATE_ONLY_VALUE = "0";
const CONTENT_ENCODING_HEADER = "content-encoding";
const CONTENT_LENGTH_HEADER = "content-length";
const IDENTITY_CONTENT_ENCODING = "identity";

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
 * repeated PUT from changing bytes after this blob has been committed. The
 * signed content length also makes GCS reject a different byte count.
 */
export async function prepareFileSystemBlobUpload(
  auth: Authenticator,
  nodeId: number,
  blobId: string,
  contentType: string,
  expectedSizeBytes: number
): Promise<{ uploadUrl: string; headers: Record<string, string> }> {
  const headers = {
    "content-type": contentType,
    [CONTENT_ENCODING_HEADER]: IDENTITY_CONTENT_ENCODING,
    [CONTENT_LENGTH_HEADER]: String(expectedSizeBytes),
    [GCS_CREATE_ONLY_HEADER]: GCS_CREATE_ONLY_VALUE,
  };
  const uploadUrl = await getPrivateUploadBucket().getSignedUploadUrl(
    objectPath(auth, nodeId, blobId),
    {
      contentType,
      expirationDelayMs: FILE_SYSTEM_CONTENT_URL_EXPIRATION_MS,
      extensionHeaders: {
        [CONTENT_ENCODING_HEADER]: IDENTITY_CONTENT_ENCODING,
        [CONTENT_LENGTH_HEADER]: String(expectedSizeBytes),
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
): Promise<{
  size: number;
  contentType: string | undefined;
  contentEncoding: string | undefined;
  contentDisposition: string | undefined;
}> {
  const [metadata] = await getPrivateUploadBucket()
    .file(objectPath(auth, nodeId, blobId))
    .getMetadata();

  return {
    size: Number(metadata.size),
    contentType: metadata.contentType,
    contentEncoding: metadata.contentEncoding,
    contentDisposition: metadata.contentDisposition,
  };
}
