import type {
  ButlerSuggestionPublicType,
  RenameTitleButlerSuggestion,
} from "@app/types/conversation_butler_suggestion";
import {
  Button,
  CheckIcon,
  ContentMessage,
  PencilSquareIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
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
      // Not yet implemented.
      return null;
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
