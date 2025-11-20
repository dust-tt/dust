import {
  Button,
  ExclamationCircleIcon,
  Icon,
  LoginIcon,
} from "@dust-tt/sparkle";
import Link from "next/link";
import type { ComponentType } from "react";

import type { ConversationError } from "@app/types";
import { isAPIErrorResponse, safeParseJSON } from "@app/types";

interface ConversationErrorProps {
  error: ConversationError;
}

export function ConversationErrorDisplay({ error }: ConversationErrorProps) {
  const errorMessageRes = safeParseJSON(JSON.stringify(error));

  if (errorMessageRes.isErr() || !isAPIErrorResponse(errorMessageRes.value)) {
    return <ConversationGenericError />;
  }

  switch (errorMessageRes.value.error.type) {
    case "conversation_access_restricted":
      return <ConversationAccessRestricted />;

    case "conversation_not_found":
      return <ConversationNotFound />;

    default:
      return <ConversationGenericError />;
  }
}

function ConversationAccessRestricted() {
  return (
    <ErrorDisplay
      icon={ExclamationCircleIcon}
      title="You don't have access to this page"
      message={["This conversation may include restricted data."]}
    />
  );
}

function ConversationNotFound() {
  return (
    <ErrorDisplay
      icon={ExclamationCircleIcon}
      title="Conversation Not Found"
      message="This conversation may have been deleted or moved."
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

export function ErrorDisplay({ icon, message, title }: ErrorDisplayProps) {
  return (
    <div className="h-dvh flex flex-col items-center justify-center gap-3">
      {icon && (
        <Icon
          visual={icon}
          className="dark:text-golder-400-night text-golden-400"
          size="lg"
        />
      )}
      <p className="heading-xl text-center text-foreground dark:text-foreground-night">
        {title}
      </p>
      <p className="copy-sm text-center text-muted-foreground dark:text-muted-foreground-night">
        {Array.isArray(message) ? (
          message.map((line, index) => <p key={index}>{line}</p>)
        ) : (
          <p>{message}</p>
        )}
      </p>
      <Link href="/">
        <Button variant="outline" label="Back to homepage" icon={LoginIcon} />
      </Link>
    </div>
  );
}
