import { Icon, XCircleIcon } from "@dust-tt/sparkle";
import { isAPIErrorResponse, safeParseJSON } from "@dust-tt/types";

interface ConversationError {
  error: Error;
}

export function ConversationError({ error }: ConversationError) {
  const errorMessageRes = safeParseJSON(error.message);

  if (errorMessageRes.isErr() || !isAPIErrorResponse(errorMessageRes.value)) {
    return <ConversationGenericError />;
  }

  switch (errorMessageRes.value.error.type) {
    case "conversation_access_denied":
      return <ConversationAccessDenied />;

    case "conversation_not_found":
      return <ConversationNotFound />;

    default:
      return <ConversationGenericError />;
  }
}

function ConversationAccessDenied() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-1">
      <Icon visual={XCircleIcon} className="text-warning-400" size="lg" />
      <p className="text-center text-xl font-bold leading-7 text-slate-900">
        Permission Required
      </p>
      <p className="text-center text-sm font-normal leading-tight text-slate-700">
        This conversation contains protected information.
        <br />
        Request access to view it.
      </p>
    </div>
  );
}

function ConversationNotFound() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-1">
      <p className="text-center text-xl font-bold leading-7 text-slate-900">
        Conversation Not Found
      </p>
      <p className="text-center text-sm font-normal leading-tight text-slate-700">
        It looks like the conversation you're looking for doesn't exist or may
        have been deleted.
      </p>
    </div>
  );
}

function ConversationGenericError() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-1">
      <p className="text-center text-xl font-bold leading-7 text-slate-900">
        Error Loading Conversation
      </p>
      <p className="text-center text-sm font-normal leading-tight text-slate-700">
        Something went wrong while loading the conversation.
        <br />
        Please try again later.
      </p>
    </div>
  );
}
