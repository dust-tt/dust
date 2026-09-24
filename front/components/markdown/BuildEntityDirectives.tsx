import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { AttachmentChipDirectiveBlock } from "@app/components/markdown/AttachmentChipDirective";
import { createTextDirective } from "@app/components/markdown/directives";
import { MentionDisplay } from "@app/components/mentions/MentionDisplay";
import { getSkillIcon } from "@app/lib/skill";
import {
  AGENT_SIDE_PANEL_TYPE,
  SKILL_SIDE_PANEL_TYPE,
} from "@app/types/conversation_side_panel";
import type { WorkspaceType } from "@app/types/user";

/**
 * @cc [owner:fabiencelier,label:product] build-entity-directives-are-agent-only
 * `:build_skill[name]{sId=xxx}` and `:build_agent[name]{sId=xxx}` are how an agent points at an
 * entity it is building, so the user can open it from the answer. They are deliberately distinct
 * from the `:skill` chip and the `:mention` agent mention.
 */
export const buildSkillDirective = createTextDirective(
  "build_skill",
  (name, { sId, icon }) => ({ skillId: sId, icon, skillName: name })
);

export const buildAgentDirective = createTextDirective(
  "build_agent",
  (name, { sId }) => ({ agentId: sId, agentName: name })
);

interface BuildSkillDirectiveBlockProps {
  skillId: string;
  icon?: string;
  skillName: string;
}

export function getBuildSkillDirectivePlugin(previewBatchId?: string) {
  const BuildSkillDirectiveBlock = ({
    skillId,
    icon,
    skillName,
  }: BuildSkillDirectiveBlockProps) => {
    const { togglePanel } = useConversationSidePanelContext();

    return (
      <AttachmentChipDirectiveBlock
        label={skillName}
        icon={getSkillIcon(icon ?? null)}
        onClick={() =>
          togglePanel({
            type: SKILL_SIDE_PANEL_TYPE,
            skillId,
            previewBatchId,
          })
        }
      />
    );
  };

  return BuildSkillDirectiveBlock;
}

interface BuildAgentDirectiveBlockProps {
  agentId: string;
  agentName: string;
}

export function getBuildAgentDirectivePlugin(
  owner: WorkspaceType,
  previewBatchId?: string
) {
  const BuildAgentDirectiveBlock = ({
    agentId,
    agentName,
  }: BuildAgentDirectiveBlockProps) => {
    const { togglePanel } = useConversationSidePanelContext();

    return (
      <span
        onClick={() =>
          togglePanel({
            type: AGENT_SIDE_PANEL_TYPE,
            agentId,
            previewBatchId,
          })
        }
      >
        <MentionDisplay
          mention={{
            id: agentId,
            label: agentName,
            type: "agent",
            pictureUrl: "",
            description: "",
          }}
          owner={owner}
          showTooltip={false}
        />
      </span>
    );
  };

  return BuildAgentDirectiveBlock;
}
