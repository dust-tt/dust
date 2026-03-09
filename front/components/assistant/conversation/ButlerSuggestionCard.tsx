import type {
  ButlerSuggestionPublicType,
  CallAgentButlerSuggestion,
  CreateFrameButlerSuggestion,
  RenameTitleButlerSuggestion,
} from "@app/types/conversation_butler_suggestion";
import { assertNever } from "@app/types/shared/utils/assert_never";
import {
  ActionFrameIcon,
  Button,
  ChatBubbleLeftRightIcon,
  CheckIcon,
  ContentMessage,
  PencilSquareIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";
import { useState } from "react";

interface ButlerSuggestionCardProps {
  suggestion: ButlerSuggestionPublicType;
  onAction: (
    suggestionSId: string,
    status: "accepted" | "dismissed"
  ) => Promise<void>;
}

export function ButlerSuggestionCard({
  suggestion,
  onAction,
}: ButlerSuggestionCardProps) {
  switch (suggestion.suggestionType) {
    case "rename_title":
      return (
        <RenameTitleSuggestionCard
          suggestion={suggestion}
          onAction={onAction}
        />
      );
    case "call_agent":
      return (
        <AgentInvocationSuggestionCard
          suggestion={suggestion}
          onAction={onAction}
          icon={ChatBubbleLeftRightIcon}
          title={`Try asking @${suggestion.metadata.agentName}`}
          actionLabel="Ask"
        />
      );
    case "create_frame":
      return (
        <AgentInvocationSuggestionCard
          suggestion={suggestion}
          onAction={onAction}
          icon={ActionFrameIcon}
          title="Create a Frame?"
          actionLabel="Create"
        />
      );
    default:
      assertNever(suggestion);
  }
}

interface RenameTitleSuggestionCardProps {
  suggestion: RenameTitleButlerSuggestion;
  onAction: (
    suggestionSId: string,
    status: "accepted" | "dismissed"
  ) => Promise<void>;
}

function RenameTitleSuggestionCard({
  suggestion,
  onAction,
}: RenameTitleSuggestionCardProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAction = async (status: "accepted" | "dismissed") => {
    setIsSubmitting(true);
    try {
      await onAction(suggestion.sId, status);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ContentMessage
      variant="highlight"
      icon={PencilSquareIcon}
      title="Rename this conversation?"
      className="my-3 w-full max-w-full"
    >
      <div className="flex flex-col gap-3">
        <div>
          Suggested title:{" "}
          <span className="font-semibold">
            {suggestion.metadata.suggestedTitle}
          </span>
        </div>
        <div className="flex flex-row gap-2">
          <Button
            label="Rename"
            variant="highlight"
            size="xs"
            icon={CheckIcon}
            disabled={isSubmitting}
            onClick={() => handleAction("accepted")}
          />
          <Button
            label="Dismiss"
            variant="outline"
            size="xs"
            icon={XMarkIcon}
            disabled={isSubmitting}
            onClick={() => handleAction("dismissed")}
          />
        </div>
      </div>
    </ContentMessage>
  );
}

interface AgentInvocationSuggestionCardProps {
  suggestion: CallAgentButlerSuggestion | CreateFrameButlerSuggestion;
  onAction: (
    suggestionSId: string,
    status: "accepted" | "dismissed"
  ) => Promise<void>;
  icon: ComponentType;
  title: string;
  actionLabel: string;
}

function AgentInvocationSuggestionCard({
  suggestion,
  onAction,
  icon,
  title,
  actionLabel,
}: AgentInvocationSuggestionCardProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAction = async (status: "accepted" | "dismissed") => {
    setIsSubmitting(true);
    try {
      await onAction(suggestion.sId, status);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ContentMessage
      variant="highlight"
      icon={icon}
      title={title}
      className="my-3 w-full max-w-full"
    >
      <div className="flex flex-col gap-3">
        <div className="italic text-sm text-muted-foreground">
          "{suggestion.metadata.prompt}"
        </div>
        <div className="flex flex-row gap-2">
          <Button
            label={actionLabel}
            variant="highlight"
            size="xs"
            icon={icon}
            disabled={isSubmitting}
            onClick={() => handleAction("accepted")}
          />
          <Button
            label="Dismiss"
            variant="outline"
            size="xs"
            icon={XMarkIcon}
            disabled={isSubmitting}
            onClick={() => handleAction("dismissed")}
          />
        </div>
      </div>
    </ContentMessage>
  );
}
