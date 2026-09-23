import {
  parseSuggestionPreviewData,
  useConversationSidePanelContext,
} from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { ConversationSidePanelHeader } from "@app/components/assistant/conversation/ConversationSidePanelHeader";
import { SkillSuggestionPreviewProvider } from "@app/components/assistant/details/SuggestionPreviewContext";
import {
  SkillDetailsContent,
  SkillDetailsHeader,
  SkillLoadError,
} from "@app/components/skills/SkillDetailsBody";
import { useSkillSuggestions } from "@app/hooks/useSkillSuggestions";
import { useSkill } from "@app/lib/swr/skill_configurations";
import { useUser } from "@app/lib/swr/user";
import type { LightWorkspaceType } from "@app/types/user";
import { Spinner } from "@dust-tt/sparkle";
import { useMemo } from "react";

interface ConversationSkillPanelProps {
  owner: LightWorkspaceType;
}

export function ConversationSkillPanel({ owner }: ConversationSkillPanelProps) {
  const { closePanel, data } = useConversationSidePanelContext();
  const { entityId, suggestionIds } = parseSuggestionPreviewData(data);
  const skillId = entityId || null;
  const { user } = useUser();

  const { suggestions, isSuggestionsLoading } = useSkillSuggestions({
    skillId,
    workspaceId: owner.sId,
    sources: ["conversational"],
    disabled: !suggestionIds,
  });
  const previewSuggestions = useMemo(() => {
    const ids = suggestionIds.split(",");
    return suggestions.filter(
      (s) => s.state === "pending" && ids.includes(s.sId)
    );
  }, [suggestions, suggestionIds]);

  // Fetching by id (rather than resolving from a list) is what lets non-editors
  // and unpublished skills render here at all.
  const { skill, isSkillError, mutateSkill } = useSkill({
    workspaceId: owner.sId,
    skillId,
    withRelations: true,
    disabled: !skillId,
  });

  return (
    <div className="flex h-panel flex-col bg-panel-background">
      <ConversationSidePanelHeader onClose={closePanel}>
        <span className="text-sm font-medium text-foreground">Skill</span>
      </ConversationSidePanelHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
        {isSkillError ? (
          <SkillLoadError onRetry={mutateSkill} />
        ) : !skill || !user || isSuggestionsLoading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : (
          <SkillSuggestionPreviewProvider suggestions={previewSuggestions}>
            <SkillDetailsHeader
              skill={skill}
              owner={owner}
              onClose={closePanel}
            />
            <SkillDetailsContent skill={skill} owner={owner} user={user} />
          </SkillSuggestionPreviewProvider>
        )}
      </div>
    </div>
  );
}
