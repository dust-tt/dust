import { isAPIErrorResponse, safeParseJSON } from "@dust-tt/types";

export function isConversationAccessDeniedError(error: Error) {
  const errorMessage = safeParseJSON(error.message);

  return (
    isAPIErrorResponse(errorMessage) &&
    errorMessage.error.type === "conversation_access_denied"
  );
}
