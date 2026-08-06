import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { ConversationSidePanelHeader } from "@app/components/assistant/conversation/ConversationSidePanelHeader";
import {
  SkillDetailsContent,
  SkillDetailsHeader,
  SkillLoadError,
} from "@app/components/skills/SkillDetailsBody";
import { useSkill } from "@app/lib/swr/skill_configurations";
import { useUser } from "@app/lib/swr/user";
import type { LightWorkspaceType } from "@app/types/user";
import { Spinner } from "@dust-tt/sparkle";

interface ConversationSkillPanelProps {
  owner: LightWorkspaceType;
}

export function ConversationSkillPanel({ owner }: ConversationSkillPanelProps) {
  const { closePanel, data: skillId } = useConversationSidePanelContext();
  const { user } = useUser();

  // Fetching by id (rather than resolving from a list) is what lets non-editors
  // and unpublished skills render here at all.
  const { skill, isSkillError, mutateSkill } = useSkill({
    workspaceId: owner.sId,
    skillId: skillId ?? null,
    withRelations: true,
    disabled: !skillId,
  });

  return (
    <div className="flex h-panel flex-col bg-panel-background">
      <ConversationSidePanelHeader onClose={closePanel}>
        <span className="text-sm font-medium text-foreground">Skill</span>
      </ConversationSidePanelHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {isSkillError ? (
          <SkillLoadError onRetry={mutateSkill} />
        ) : !skill || !user ? (
          <div className="flex h-full items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : (
          <>
            <SkillDetailsHeader
              skill={skill}
              owner={owner}
              onClose={closePanel}
            />
            <div className="mt-4">
              <SkillDetailsContent skill={skill} owner={owner} user={user} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
