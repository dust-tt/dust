import { Icon, XCircleIcon } from "@dust-tt/sparkle";
import { isAPIErrorResponse, safeParseJSON } from "@dust-tt/types";
import type { ComponentType } from "react";

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
    <ErrorDisplay
      title="Permission Required"
      message={[
        "This conversation contains protected information.",
        "Request access to view it.",
      ]}
    />
  );
}

function ConversationNotFound() {
  return (
    <ErrorDisplay
      title="Conversation Not Found"
      message="It looks like the conversation you're looking for doesn't exist or may
        have been deleted."
    />
  );
}

function ConversationGenericError() {
  return (
    <ErrorDisplay
      title="Error Loading Conversation"
      message={[
        "Something went wrong while loading the conversation.",
        "Please try again later.",
      ]}
    />
  );
}

interface ErrorDisplayProps {
  icon?: ComponentType<{
    className?: string;
  }>;
  message: string | string[];
  title: string;
}

function ErrorDisplay({ icon, message, title }: ErrorDisplayProps) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-1">
      {icon && (
        <Icon visual={XCircleIcon} className="text-warning-400" size="lg" />
      )}
      <p className="text-center text-xl font-bold leading-7 text-slate-900">
        {title}
      </p>
      <p className="text-center text-sm font-normal leading-tight text-slate-700">
        {Array.isArray(message) ? (
          message.map((line, index) => <p key={index}>{line}</p>)
        ) : (
          <p>{message}</p>
        )}
      </p>
    </div>
  );
}
