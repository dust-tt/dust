import type { ConversationError } from "@app/types/assistant/conversation";
import { isAPIErrorResponse } from "@app/types/error";
import { safeParseJSON } from "@app/types/shared/utils/json_utils";
import {
  AlertCircle,
  Button,
  Icon,
  LinkWrapper,
  LogIn01,
} from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";
import type { ComponentType } from "react";

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
  const { t } = useLingui();

  return (
    <ErrorDisplay
      icon={AlertCircle}
      title={t`You don't have access to this page`}
      message={[t`This conversation may include restricted data.`]}
    />
  );
}

function ConversationNotFound() {
  const { t } = useLingui();

  return (
    <ErrorDisplay
      icon={AlertCircle}
      title={t`Conversation not found`}
      message={t`This conversation may have been deleted or moved.`}
    />
  );
}

function ConversationGenericError() {
  const { t } = useLingui();

  return (
    <ErrorDisplay
      title={t`Error loading conversation`}
      message={[
        t`Something went wrong while loading the conversation.`,
        t`Please try again later.`,
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
  const { t } = useLingui();

  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 px-4">
      {icon && <Icon visual={icon} className="text-info-400" size="lg" />}
      <p className="heading-xl text-center text-foreground">{title}</p>
      <div className="copy-sm text-center text-muted-foreground">
        {Array.isArray(message) ? (
          message.map((line, index) => <p key={index}>{line}</p>)
        ) : (
          <p>{message}</p>
        )}
      </div>
      <LinkWrapper href="/">
        <Button variant="outline" label={t`Back to homepage`} icon={LogIn01} />
      </LinkWrapper>
    </div>
  );
}
