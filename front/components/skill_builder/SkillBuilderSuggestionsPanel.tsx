import { getDefaultMCPAction } from "@app/components/agent_builder/types";
import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import { useSkillBuilderContext } from "@app/components/skill_builder/SkillBuilderContext";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import { SkillSuggestionCard } from "@app/components/skill_builder/SkillSuggestionCard";
import {
  usePatchSkillSuggestions,
  useSkillSuggestions,
} from "@app/hooks/useSkillSuggestions";
import type { SkillSuggestionType } from "@app/types/suggestions/skill_suggestion";
import { LightbulbIcon, ScrollArea, Spinner } from "@dust-tt/sparkle";
import { useCallback } from "react";
import { useFormContext } from "react-hook-form";

export function SkillBuilderSuggestionsPanel() {
  const { owner, skillId } = useSkillBuilderContext();
  const { getValues, setValue } = useFormContext<SkillBuilderFormData>();
  const { mcpServerViews } = useMCPServerViewsContext();

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

  const applyInstructionEdits = useCallback(
    (suggestion: SkillSuggestionType) => {
      const { instructionEdits } = suggestion.suggestion;
      if (!instructionEdits || instructionEdits.length === 0) {
        return;
      }

      let html = getValues("instructionsHtml");

      for (const edit of instructionEdits) {
        // TODO(reinforced-skills): Implement the actual decoration logic (Issue #7388)
        html = edit.content;
      }

      setValue("instructionsHtml", html, { shouldDirty: true });
    },
    [getValues, setValue]
  );

  const applyToolEdits = useCallback(
    (suggestion: SkillSuggestionType) => {
      const { toolEdits } = suggestion.suggestion;
      if (!toolEdits || toolEdits.length === 0) {
        return;
      }

      let currentTools = getValues("tools");

      for (const edit of toolEdits) {
        if (edit.action === "add") {
          const alreadyAdded = currentTools.some(
            (t) => t.configuration.mcpServerViewId === edit.toolId
          );
          if (!alreadyAdded) {
            const view = mcpServerViews.find((v) => v.sId === edit.toolId);
            if (view) {
              currentTools = [...currentTools, getDefaultMCPAction(view)];
            }
          }
        } else {
          currentTools = currentTools.filter(
            (t) => t.configuration.mcpServerViewId !== edit.toolId
          );
        }
      }

      setValue("tools", currentTools, { shouldDirty: true });
    },
    [getValues, setValue, mcpServerViews]
  );

  const handleAccept = useCallback(
    async (suggestion: SkillSuggestionType) => {
      const result = await patchSuggestions([suggestion.sId], "approved");
      if (result) {
        applyInstructionEdits(suggestion);
        applyToolEdits(suggestion);
        await mutateSuggestions();
      }
    },
    [patchSuggestions, mutateSuggestions, applyInstructionEdits, applyToolEdits]
  );

  const handleDecline = useCallback(
    async (suggestion: SkillSuggestionType) => {
      const result = await patchSuggestions([suggestion.sId], "rejected");
      if (result) {
        await mutateSuggestions();
      }
    },
    [patchSuggestions, mutateSuggestions]
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-1 px-4 pb-3 pt-4">
        <h2 className="heading-lg font-semibold text-foreground dark:text-foreground-night">
          Suggestions
        </h2>
        <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
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
              <LightbulbIcon className="text-muted-foreground dark:text-muted-foreground-night" />
              <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
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
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
