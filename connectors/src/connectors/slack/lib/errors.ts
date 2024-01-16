import type { WebAPIPlatformError } from "@slack/web-api";
import { ErrorCode } from "@slack/web-api";

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
