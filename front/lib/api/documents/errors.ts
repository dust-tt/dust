import type { DocumentError } from "@app/lib/api/documents/storage";
import type { APIErrorWithStatusCode } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";

export const documentAPIError = (
  error: DocumentError
): APIErrorWithStatusCode<403 | 404 | 409 | 422> => {
  const { code, message } = error;
  switch (code) {
    case "not_found":
      return {
        status_code: 404,
        api_error: { type: "file_not_found", message },
      };
    case "forbidden":
      return {
        status_code: 403,
        api_error: { type: "workspace_auth_error", message },
      };
    case "conflict":
      return {
        status_code: 409,
        api_error: { type: "invalid_request_error", message },
      };
    case "invalid_document":
      return {
        status_code: 422,
        api_error: { type: "invalid_request_error", message },
      };
    default:
      return assertNever(code);
  }
};
