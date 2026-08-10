import { useSkillBuilderContext } from "@app/components/skill_builder/SkillBuilderContext";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import { SkillSuggestionCard } from "@app/components/skill_builder/SkillSuggestionCard";
import {
  usePatchSkillSuggestions,
  useSkillSuggestions,
} from "@app/hooks/useSkillSuggestions";
import type { SkillSuggestionType } from "@app/types/suggestions/skill_suggestion";
import { Lightbulb04, ScrollArea, Spinner } from "@dust-tt/sparkle";
import { useCallback, useState } from "react";
import { useFormContext } from "react-hook-form";

interface SkillBuilderSuggestionsPanelProps {
  disabled?: boolean;
}

export function SkillBuilderSuggestionsPanel({
  disabled = false,
}: SkillBuilderSuggestionsPanelProps) {
  const {
    owner,
    skillId,
    selectedSuggestionId,
    setSelectedSuggestionId,
    acceptInstructionEdits,
  } = useSkillBuilderContext();
  const { getValues, setValue } = useFormContext<SkillBuilderFormData>();
  const [pendingAction, setPendingAction] = useState<{
    suggestionId: string;
    action: "accept" | "decline";
  } | null>(null);

  const getSkillInstructionsHtml = useCallback(
    () => getValues("instructionsHtml") ?? "",
    [getValues]
  );
  const getCurrentAgentFacingDescription = useCallback(
    () => getValues("agentFacingDescription") ?? "",
    [getValues]
  );
  const { suggestions, isSuggestionsLoading, mutateSuggestions } =
    useSkillSuggestions({
      skillId,
      states: ["pending"],
      workspaceId: owner.sId,
      disabled: !skillId,
    });

  const { patchSuggestions } = usePatchSkillSuggestions({
    skillId,
    workspaceId: owner.sId,
  });

  const applyAgentFacingDescriptionEdit = useCallback(
    (suggestion: SkillSuggestionType) => {
      const { agentFacingDescriptionEdit } = suggestion.suggestion;
      if (!agentFacingDescriptionEdit) {
        return;
      }
      setValue("agentFacingDescription", agentFacingDescriptionEdit.content, {
        shouldDirty: true,
        shouldValidate: true,
      });
    },
    [setValue]
  );

  const handleAccept = useCallback(
    async (suggestion: SkillSuggestionType) => {
      if (disabled || pendingAction) {
        return;
      }

      setPendingAction({ suggestionId: suggestion.sId, action: "accept" });
      try {
        const result = await patchSuggestions([suggestion.sId], "approved");
        if (result) {
          acceptInstructionEdits?.(suggestion.sId);
          applyAgentFacingDescriptionEdit(suggestion);
          setSelectedSuggestionId(null);
          await mutateSuggestions();
        }
      } finally {
        setPendingAction(null);
      }
    },
    [
      patchSuggestions,
      mutateSuggestions,
      acceptInstructionEdits,
      applyAgentFacingDescriptionEdit,
      setSelectedSuggestionId,
      disabled,
      pendingAction,
    ]
  );

  const handleDecline = useCallback(
    async (suggestion: SkillSuggestionType) => {
      if (disabled || pendingAction) {
        return;
      }

      setPendingAction({ suggestionId: suggestion.sId, action: "decline" });
      try {
        const result = await patchSuggestions([suggestion.sId], "rejected");
        if (result) {
          setSelectedSuggestionId(null);
          await mutateSuggestions();
        }
      } finally {
        setPendingAction(null);
      }
    },
    [
      patchSuggestions,
      mutateSuggestions,
      setSelectedSuggestionId,
      disabled,
      pendingAction,
    ]
  );

  const handleSelect = useCallback(
    (suggestionId: string) => {
      setSelectedSuggestionId(
        selectedSuggestionId === suggestionId ? null : suggestionId
      );
    },
    [selectedSuggestionId, setSelectedSuggestionId]
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-1 px-4 pb-3 pt-4">
        <h2 className="heading-lg font-semibold text-foreground">
          Suggestions
        </h2>
        <p className="text-sm text-muted-foreground">
          Dust continuously analyses conversations using this skill to suggest
          improvements.
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-3 p-4">
          {isSuggestionsLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Spinner />
            </div>
          ) : suggestions.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Lightbulb04 className="text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No pending suggestions.
              </p>
            </div>
          ) : (
            suggestions.map((suggestion) => (
              <SkillSuggestionCard
                key={suggestion.sId}
                suggestion={suggestion}
                onAccept={handleAccept}
                onDecline={handleDecline}
                getSkillInstructionsHtml={getSkillInstructionsHtml}
                getCurrentAgentFacingDescription={
                  getCurrentAgentFacingDescription
                }
                isSelected={selectedSuggestionId === suggestion.sId}
                onSelect={() => handleSelect(suggestion.sId)}
                workspaceId={owner.sId}
                disabled={disabled || pendingAction !== null}
                isAccepting={
                  pendingAction?.suggestionId === suggestion.sId &&
                  pendingAction.action === "accept"
                }
                isDeclining={
                  pendingAction?.suggestionId === suggestion.sId &&
                  pendingAction.action === "decline"
                }
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
