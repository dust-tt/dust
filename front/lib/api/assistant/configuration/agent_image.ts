import { getPublicUploadBucket } from "@app/lib/file_storage";

// Whether a picture URL is a Dust-hosted image: a static avatar or an uploaded image with a valid
// image content type. Kept in its own module so `AgentResource` can validate an agent's picture at
// save time without importing the config-layer `helpers.ts` (which imports `AgentResource`).
export async function isSelfHostedImageWithValidContentType(
  pictureUrl: string
): Promise<boolean> {
  // Accept static Dust avatars.
  if (pictureUrl.startsWith("https://dust.tt/static/")) {
    return true;
  }

  const filename = pictureUrl.split("/").at(-1);
  if (!filename) {
    return false;
  }

  // Attempt to decode the URL, since Google Cloud Storage URL encodes the filename.
  const contentTypeResult = await getPublicUploadBucket().getFileContentType(
    decodeURIComponent(filename)
  );
  if (contentTypeResult.isErr() || !contentTypeResult.value) {
    return false;
  }

  return contentTypeResult.value.includes("image");
}
