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

  // Percent-encode each path segment (not the whole prefix) so the `/` separators survive: some
  // prefixes derive from user-supplied file names (e.g. a Frame's authored-source directory) that
  // may contain spaces, `#`, or other characters that are not valid unescaped in a URL path.
  const encodedPrefix = prefix
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `https://console.cloud.google.com/storage/browser/${bucket}/${encodedPrefix}?project=${projectId}`;
}
