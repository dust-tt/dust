import { FrameMakeLiveError } from "@app/lib/api/frames/make_live";
import type { FramePublicationError } from "@app/lib/api/frames/publication_storage";
import type { APIErrorWithContentfulStatusCode } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";

/**
 * Maps a make-live failure to the API error it is served as, so the user and sandbox make-live
 * routes answer alike. The publication checks make-live re-runs use the types and statuses the
 * share route serves for the same checks.
 */
export function frameMakeLiveApiError(
  error: FrameMakeLiveError | FramePublicationError
): APIErrorWithContentfulStatusCode {
  const { message } = error;

  if (error instanceof FrameMakeLiveError) {
    const code = error.code;
    switch (code) {
      case "unauthorized":
        return {
          status_code: 403,
          api_error: { type: "file_read_only", message },
        };
      case "frame_not_found":
        return {
          status_code: 404,
          api_error: { type: "file_not_found", message },
        };
      case "draft_conflict":
        return {
          status_code: 409,
          api_error: { type: "frame_draft_conflict", message },
        };
      default:
        return assertNever(code);
    }
  }

  const publicationCode = error.code;
  switch (publicationCode) {
    case "sharing_conflict":
      return {
        status_code: 403,
        api_error: { type: "frame_sharing_not_allowed", message },
      };
    case "allowlist_failed":
      return {
        status_code: 400,
        api_error: { type: "frame_files_unverifiable", message },
      };
    case "unauthorized":
      return {
        status_code: 403,
        api_error: { type: "file_read_only", message },
      };
    // The draft was stored and checked when it was published: a missing or corrupt publication
    // is an integrity fault, not something the caller can fix.
    case "publication_not_found":
    case "invalid_publication":
      return {
        status_code: 500,
        api_error: { type: "internal_server_error", message },
      };
    case "invalid_frame":
    case "invalid_function_artifact":
    case "invalid_function_reference":
    case "invalid_manifest":
    case "invalid_source":
    case "invalid_tailwind":
    case "ui_build_failed":
      return {
        status_code: 400,
        api_error: { type: "frame_make_live_failed", message },
      };
    default:
      return assertNever(publicationCode);
  }
}
