import {
  Button,
  CheckIcon,
  CommandLineIcon,
  ContentMessage,
  ExclamationCircleIcon,
  LoadingBlock,
  PuzzleIcon,
  SparklesIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import React from "react";

import { InstructionsDiff } from "@app/components/markdown/suggestion/InstructionsDiff";
import type {
  AgentSuggestionKind,
  AgentSuggestionType,
  InstructionsSuggestionType,
  ModelSuggestionType,
  SkillsSuggestionType,
  ToolsSuggestionType,
} from "@app/types/suggestions/agent_suggestion";

interface SuggestionCardProps {
  agentSuggestion: AgentSuggestionType;
}

type SuggestionKindWithHeader = Exclude<AgentSuggestionKind, "instructions">;

function getTitle(kind?: SuggestionKindWithHeader): string {
  switch (kind) {
    case "tools":
      return "Tools Suggestion";
    case "skills":
      return "Skills Suggestion";
    case "model":
      return "Model Suggestion";
    default:
      return "Suggestion";
  }
}

function getIcon(kind?: SuggestionKindWithHeader) {
  switch (kind) {
    case "tools":
      return CommandLineIcon;
    case "skills":
      return PuzzleIcon;
    case "model":
      return SparklesIcon;
    default:
      return undefined;
  }
}

function InstructionsSuggestionContent({
  suggestion,
}: {
  suggestion: InstructionsSuggestionType;
}) {
  return (
    <InstructionsDiff
      oldString={suggestion.oldString}
      newString={suggestion.newString}
    />
  );
}

function ToolsSuggestionContent({
  suggestion,
}: {
  suggestion: ToolsSuggestionType;
}) {
  const additions = suggestion.additions ?? [];
  const deletions = suggestion.deletions ?? [];

  return (
    <div className="space-y-2 text-sm">
      {additions.length > 0 && (
        <div>
          <span className="font-medium">Add: </span>
          <span className="text-success-700 dark:text-success-700-night">
            {additions.map((a) => a.id).join(", ")}
          </span>
        </div>
      )}
      {deletions.length > 0 && (
        <div>
          <span className="font-medium">Remove: </span>
          <span className="text-warning-600 dark:text-warning-600-night">
            {deletions.join(", ")}
          </span>
        </div>
      )}
    </div>
  );
}

function SkillsSuggestionContent({
  suggestion,
}: {
  suggestion: SkillsSuggestionType;
}) {
  const additions = suggestion.additions ?? [];
  const deletions = suggestion.deletions ?? [];

  return (
    <div className="space-y-2 text-sm">
      {additions.length > 0 && (
        <div>
          <span className="font-medium">Add: </span>
          <span className="text-success-700 dark:text-success-700-night">
            {additions.join(", ")}
          </span>
        </div>
      )}
      {deletions.length > 0 && (
        <div>
          <span className="font-medium">Remove: </span>
          <span className="text-warning-600 dark:text-warning-600-night">
            {deletions.join(", ")}
          </span>
        </div>
      )}
    </div>
  );
}

function ModelSuggestionContent({
  suggestion,
}: {
  suggestion: ModelSuggestionType;
}) {
  return (
    <div className="space-y-2 text-sm">
      <div>
        <span className="font-medium">Model: </span>
        <span className="text-success-700 dark:text-success-700-night">
          {suggestion.modelId}
        </span>
      </div>
      {suggestion.reasoningEffort && (
        <div>
          <span className="font-medium">Reasoning effort: </span>
          <span>{suggestion.reasoningEffort}</span>
        </div>
      )}
    </div>
  );
}

function SuggestionActions() {
  // No-op handlers for now - logic will be added in a later PR.
  const handleAccept = () => {};
  const handleReject = () => {};

  return (
    <div className="flex items-center justify-end gap-2">
      <Button
        variant="outline"
        size="xs"
        label="Reject"
        icon={XMarkIcon}
        onClick={handleReject}
        disabled
      />
      <Button
        variant="primary"
        size="xs"
        label="Accept"
        icon={CheckIcon}
        onClick={handleAccept}
        disabled
      />
    </div>
  );
}

export function CopilotSuggestionCard({
  agentSuggestion,
}: SuggestionCardProps) {
  // Instructions suggestions: no title/icon, full width, no actions.
  if (agentSuggestion.kind === "instructions") {
    return (
      <div className="mb-2 w-full">
        <ContentMessage variant="primary" size="lg">
          <div className="flex flex-col gap-3">
            <InstructionsSuggestionContent
              suggestion={agentSuggestion.suggestion}
            />
          </div>
        </ContentMessage>
      </div>
    );
  }

  // Other suggestion types: with title/icon, actions at bottom-right.
  const title = getTitle(agentSuggestion.kind);
  const icon = getIcon(agentSuggestion.kind);

  const renderContent = () => {
    switch (agentSuggestion.kind) {
      case "tools":
        return (
          <ToolsSuggestionContent suggestion={agentSuggestion.suggestion} />
        );
      case "skills":
        return (
          <SkillsSuggestionContent suggestion={agentSuggestion.suggestion} />
        );
      case "model":
        return (
          <ModelSuggestionContent suggestion={agentSuggestion.suggestion} />
        );
    }
  };

  return (
    <div className="mb-2 inline-block w-full max-w-md align-top">
      <ContentMessage title={title} icon={icon} variant="primary" size="sm">
        <div className="flex flex-col gap-3">
          {renderContent()}
          <SuggestionActions />
        </div>
      </ContentMessage>
    </div>
  );
}

interface SuggestionCardSkeletonProps {
  kind?: AgentSuggestionKind;
}

export function SuggestionCardSkeleton({ kind }: SuggestionCardSkeletonProps) {
  if (kind === "instructions") {
    return (
      <div className="mb-2 w-full">
        <ContentMessage variant="primary" size="lg">
          <LoadingBlock className="h-16 w-full rounded-md" />
        </ContentMessage>
      </div>
    );
  }

  const title = getTitle(kind);
  const icon = getIcon(kind);

  return (
    <div className="mb-2 inline-block w-full max-w-md align-top">
      <ContentMessage title={title} icon={icon} variant="primary" size="sm">
        <div className="flex flex-col gap-3">
          <LoadingBlock className="h-10 w-full rounded-md" />
          <div className="flex justify-end gap-2">
            <LoadingBlock className="h-7 w-16 rounded-md" />
            <LoadingBlock className="h-7 w-16 rounded-md" />
          </div>
        </div>
      </ContentMessage>
    </div>
  );
}

export function SuggestionCardError() {
  return (
    <div className="mb-2 inline-block w-full max-w-md align-top">
      <ContentMessage
        title="Failed to load suggestion"
        icon={ExclamationCircleIcon}
        variant="warning"
        size="sm"
      >
        <span className="text-sm">
          The suggestion could not be loaded. Please try refreshing the page.
        </span>
      </ContentMessage>
    </div>
  );
}
