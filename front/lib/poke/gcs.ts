import config from "@app/lib/api/config";

export function makeGcsUri(bucket: string, prefix: string): string {
  return `gs://${bucket}/${prefix}`;
}

/**
 * Deep link into the Cloud Console object browser. Returns null when
 * `GOOGLE_CLOUD_PROJECT_ID` is unset: the console needs a project to scope the view, and the
 * copyable `gs://` URI is a complete fallback, so an operator missing the env var should see one
 * fewer link rather than a 500.
 */
export function makeGcsConsoleUrl(
  bucket: string,
  prefix: string
): string | null {
  const projectId = config.getOptionalGoogleCloudProjectId();
  if (!projectId) {
    return null;
  }

  return `https://console.cloud.google.com/storage/browser/${bucket}/${prefix}?project=${projectId}`;
}
