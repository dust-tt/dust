import type { ContentFragmentError } from "@app/lib/api/assistant/conversation/content_fragment";
import type { APIErrorWithContentfulStatusCode } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";

/**
 * Maps a `ContentFragmentError` from `postNewContentFragment` to the API error returned by the
 * private conversation routes. Every failure is a 400, except a locked conversation (409).
 */
export function contentFragmentErrorToApiError(
  error: ContentFragmentError
): APIErrorWithContentfulStatusCode {
  const { message } = error;
  switch (error.code) {
    case "conversation_locked":
      return {
        status_code: 409,
        api_error: { type: "conversation_locked", message },
      };
    case "conversation_access_restricted":
      return {
        status_code: 400,
        api_error: { type: "conversation_access_restricted", message },
      };
    case "file_not_found":
      return {
        status_code: 400,
        api_error: { type: "file_not_found", message },
      };
    case "file_not_attachable":
      return {
        status_code: 400,
        api_error: { type: "file_not_attachable", message },
      };
    case "file_not_ready":
      return {
        status_code: 400,
        api_error: { type: "file_not_ready", message },
      };
    case "data_source_view_not_found":
      return {
        status_code: 400,
        api_error: { type: "data_source_view_not_found", message },
      };
    case "content_node_not_found":
      return {
        status_code: 400,
        api_error: { type: "content_node_not_found", message },
      };
    case "content_node_type_not_supported":
      return {
        status_code: 400,
        api_error: { type: "file_type_not_supported", message },
      };
    case "attachment_space_not_allowed":
      return {
        status_code: 400,
        api_error: { type: "attachment_space_not_allowed", message },
      };
    case "superseded_content_fragment_not_found":
      return {
        status_code: 400,
        api_error: { type: "content_fragment_not_found", message },
      };
    // `maybeUpsertFileAttachment` returns untyped errors, so they can't be characterised here.
    case "attachment_failed":
    case "invalid_content_fragment_input":
      return {
        status_code: 400,
        api_error: { type: "invalid_request_error", message },
      };
    default:
      assertNever(error.code);
  }
}
