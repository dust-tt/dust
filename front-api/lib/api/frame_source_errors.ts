import { isFramePublicationError } from "@app/lib/api/frames/publication_storage";
import type { PublishFrameFromSourceError } from "@app/lib/api/frames/publish_from_source";
import { isPublishFrameError } from "@app/lib/api/viz/publish_frame";
import { isDustFileSystemError } from "@app/types/file_system";
import { assertNever } from "@app/types/shared/utils/assert_never";

export function frameSourceErrorStatus(
  error: PublishFrameFromSourceError
): 400 | 403 | 500 {
  if (isDustFileSystemError(error)) {
    if (error.code === "unauthorized") {
      return 403;
    }
    return error.code === "internal" ? 500 : 400;
  }

  if (isFramePublicationError(error)) {
    return error.code === "unauthorized" ? 403 : 400;
  }

  if (isPublishFrameError(error)) {
    return error.code === "internal" ? 500 : 400;
  }

  const code = error.code;
  switch (code) {
    case "sandbox_unavailable":
    case "reconcile_failed":
    case "internal":
      return 500;
    case "build_failed":
    case "invalid_contract":
    case "invalid_path":
    case "not_found":
    case "publish_conflict":
    case "reconcile_blocked":
    case "schema_extraction_failed":
      return 400;
    default:
      return assertNever(code);
  }
}
