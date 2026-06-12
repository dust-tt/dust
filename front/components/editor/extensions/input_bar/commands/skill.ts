import type { InputBarSlashCommandDefinition } from "@app/components/editor/extensions/input_bar/commands/types";
import { getSkillSlashCommandItem } from "@app/components/editor/extensions/shared/SlashCommandCapabilitiesItems";

export const skillSlashCommandDefinition: InputBarSlashCommandDefinition<"skill"> =
  {
    kind: "skill",
    getItem: (capability) => ({
      ...getSkillSlashCommandItem(capability.skill),
      data: capability,
      id: `skill-${capability.skill.sId}`,
    }),
    onSelect: (capability, { editor }) => {
      const {
        sId: skillId,
        name: skillName,
        icon: skillIcon,
      } = capability.skill;

      editor
        ?.chain()
        .focus()
        .insertSkillNode({ skillId, skillName, skillIcon })
        .run();
    },
    onDetails: (capability, { openSkillDetails }) => {
      openSkillDetails(capability.skill.sId);
    },
  };
