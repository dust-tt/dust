import type { ContentFragmentError } from "@app/lib/api/assistant/conversation/content_fragment";
import type { APIErrorWithContentfulStatusCode } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";

/**
 * Maps a `ContentFragmentError` from `postNewContentFragment` to the API error returned by the
 * private conversation routes. Every failure is a 400, except a locked conversation (409) and a
 * failed Core search (500).
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
    case "content_node_search_failed":
      return {
        status_code: 500,
        api_error: { type: "internal_server_error", message },
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
    case "audio_transcription_unavailable":
      return {
        status_code: 400,
        api_error: { type: "file_type_not_supported", message },
      };
    case "invalid_content_fragment_input":
      return {
        status_code: 400,
        api_error: { type: "invalid_request_error", message },
      };
    default:
      assertNever(error.code);
  }
}
