import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { trackSuggestionTargetPreviewOpen } from "@app/components/markdown/suggestion/suggestionTracking";
import { getIcon } from "@app/components/resources/resources_icons";
import { getSkillAvatarIcon } from "@app/lib/skill";
import { useAgentConfiguration } from "@app/lib/swr/assistants";
import { useSkill } from "@app/lib/swr/skill_configurations";
import {
  AGENT_SIDE_PANEL_TYPE,
  SKILL_SIDE_PANEL_TYPE,
} from "@app/types/conversation_side_panel";
import type { AgentSuggestionType } from "@app/types/suggestions/agent_suggestion";
import { isCreateAgentSuggestion } from "@app/types/suggestions/agent_suggestion";
import type { SkillSuggestionType } from "@app/types/suggestions/skill_suggestion";
import {
  isCreateSkillSuggestion,
  isDeleteSkillSuggestion,
} from "@app/types/suggestions/skill_suggestion";
import type { LightWorkspaceType } from "@app/types/user";
import { Avatar } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";
import type { ReactElement } from "react";
import { useMemo } from "react";

export interface SuggestionTarget {
  name: string;
  visual: ReactElement;
  isDeletion: boolean;
  onOpen: () => void;
}

export interface AgentSuggestionTargetInput {
  owner: LightWorkspaceType;
  batchId: string;
  agentId: string;
  suggestions: AgentSuggestionType[];
}

export function useAgentSuggestionTarget({
  owner,
  batchId,
  agentId,
  suggestions,
}: AgentSuggestionTargetInput) {
  const { t } = useLingui();
  const { openPanel } = useConversationSidePanelContext();
  // A created agent is still pending: its name is the suggested one.
  const creation = suggestions.find(isCreateAgentSuggestion);
  const { agentConfiguration, isAgentConfigurationLoading } =
    useAgentConfiguration({
      workspaceId: owner.sId,
      agentConfigurationId: agentId,
      disabled: !!creation,
    });

  const target: SuggestionTarget = {
    name: creation
      ? creation.suggestion.name
      : (agentConfiguration?.name ?? t`Agent`),
    visual:
      agentConfiguration && !creation ? (
        <Avatar visual={agentConfiguration.pictureUrl} size="3xs" />
      ) : (
        <Avatar icon={getIcon("ActionRobotIcon")} size="3xs" />
      ),
    isDeletion: suggestions.some((s) => s.kind === "delete"),
    onOpen: () => {
      trackSuggestionTargetPreviewOpen({
        batchId,
        targetKind: "agent",
        targetId: agentId,
      });
      openPanel({
        type: AGENT_SIDE_PANEL_TYPE,
        agentId,
        previewBatchId: batchId,
      });
    },
  };

  return {
    agentConfiguration,
    isLoading: isAgentConfigurationLoading,
    target,
  };
}

export interface SkillSuggestionTargetInput {
  owner: LightWorkspaceType;
  batchId: string;
  skillId: string;
  suggestions: SkillSuggestionType[];
}

export function useSkillSuggestionTarget({
  owner,
  batchId,
  skillId,
  suggestions,
}: SkillSuggestionTargetInput) {
  const { t } = useLingui();
  const { openPanel } = useConversationSidePanelContext();
  // A created skill is still pending: its name is the suggested one.
  const creation = suggestions.find(isCreateSkillSuggestion);
  const { skill, isSkillLoading } = useSkill({
    workspaceId: owner.sId,
    skillId,
    disabled: !!creation,
  });
  const SkillAvatar = useMemo(() => getSkillAvatarIcon(skill), [skill]);

  const target: SuggestionTarget = {
    name: creation ? creation.suggestion.name : (skill?.name ?? t`Skill`),
    visual: <SkillAvatar size="3xs" />,
    isDeletion: suggestions.some(isDeleteSkillSuggestion),
    onOpen: () => {
      trackSuggestionTargetPreviewOpen({
        batchId,
        targetKind: "skill",
        targetId: skillId,
      });
      openPanel({
        type: SKILL_SIDE_PANEL_TYPE,
        skillId,
        previewBatchId: batchId,
      });
    },
  };

  return { skill, isLoading: isSkillLoading, target };
}
