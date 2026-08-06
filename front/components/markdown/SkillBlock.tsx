import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { getSkillIcon } from "@app/lib/skill";
import { SKILL_SIDE_PANEL_TYPE } from "@app/types/conversation_side_panel";
import { AttachmentChip } from "@dust-tt/sparkle";
import { visit } from "unist-util-visit";

export interface SkillDirectiveProps {
  skillId: string;
  skillIcon: string | null;
  skillName: string;
}

export function SkillBlock({
  skillId,
  skillIcon,
  skillName,
}: SkillDirectiveProps) {
  const { togglePanel } = useConversationSidePanelContext();

  return (
    <AttachmentChip
      label={skillName}
      icon={{ visual: getSkillIcon(skillIcon), size: "xs" }}
      onClick={() => togglePanel({ type: SKILL_SIDE_PANEL_TYPE, skillId })}
      color="primary"
      size="xs"
    />
  );
}

export function skillDirective() {
  return (tree: any) => {
    visit(tree, ["textDirective"], (node) => {
      if (node.name === "skill" && node.children[0]) {
        const data = node.data ?? {};
        // `unist-util-visit` directive transforms are expected to annotate the
        // current node in place so mdast-util-to-hast can consume `node.data`.
        node.data = data;
        data.hName = "skill";
        data.hProperties = {
          skillId: node.attributes.sId,
          skillIcon: node.attributes.icon,
          skillName: node.children[0].value,
        };
      }
    });
  };
}
