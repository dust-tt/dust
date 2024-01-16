import { ErrorCode, WebAPIPlatformError } from "@slack/web-api";

export function isSlackWebAPIPlatformError(
  err: unknown
): err is WebAPIPlatformError {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    err.code === ErrorCode.PlatformError
  );
}
