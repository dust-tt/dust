import { Button } from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import type { ComponentType } from "react";
import React, { useCallback, useState } from "react";

import { useConversations } from "@app/lib/swr/conversations";
import type { ConversationError } from "@app/types";
import { isAPIErrorResponse, safeParseJSON } from "@app/types";

interface ConversationErrorProps {
  error: ConversationError;
}

export function ConversationErrorDisplay({ error }: ConversationErrorProps) {
  // SWR may throw either a plain API error object or an Error whose message is a JSON string.
  const apiErr = (() => {
    if (isAPIErrorResponse(error)) {
      return error;
    }
    const msg = (error as any)?.message;
    if (typeof msg === "string") {
      const parsed = safeParseJSON(msg);
      if (parsed.isOk() && isAPIErrorResponse(parsed.value)) {
        return parsed.value;
      }
    }
    return null;
  })();

  if (!apiErr) {
    return <ConversationGenericError />;
  }

  switch (apiErr.error.type) {
    case "conversation_access_restricted":
      return <ConversationAccessRestricted />;

    case "conversation_not_found":
      return <ConversationNotFound />;

    default:
      return <ConversationGenericError />;
  }
}

function ConversationAccessRestricted() {
  const router = useRouter();
  const { wId, cId } = router.query as { wId?: string; cId?: string };
  const workspaceId = typeof wId === "string" ? wId : undefined;
  const conversationId = typeof cId === "string" ? cId : undefined;

  const { mutateConversations } = useConversations({
    workspaceId: workspaceId || "",
  });

  const [leaving, setLeaving] = useState(false);

  const onLeave = useCallback(async () => {
    if (!workspaceId || !conversationId) {
      return;
    }
    setLeaving(true);
    const res = await fetch(
      `/api/w/${workspaceId}/assistant/conversations/${conversationId}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      void mutateConversations((prev) => {
        if (!prev) {
          return prev;
        }
        return {
          ...prev,
          conversations: prev.conversations.filter(
            (c) => c.sId !== conversationId
          ),
        };
      });
      await router.push(`/w/${workspaceId}/assistant/new`);
    }
    setLeaving(false);
  }, [workspaceId, conversationId, router, mutateConversations]);

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3">
      <p className="heading-xl text-center text-foreground dark:text-foreground-night">
        You no longer have access to this conversation
      </p>
      <Button
        label="Leave this conversation"
        variant="secondary"
        onClick={onLeave}
        disabled={leaving || !workspaceId || !conversationId}
      />
    </div>
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
        <Icon
          visual={icon}
          className="text-warning-400 dark:text-warning-400-night"
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
    </div>
  );
}
