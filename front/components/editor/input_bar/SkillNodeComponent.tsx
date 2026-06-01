import { getSkillIcon } from "@app/lib/skill";
import { UNAVAILABLE_SKILL_LABEL } from "@app/lib/skills/format";
import { Chip, ExclamationCircleIcon } from "@dust-tt/sparkle";
import { NodeViewWrapper } from "@tiptap/react";

interface SkillNodeComponentProps {
  node: {
    attrs: {
      skillId?: string;
      skillIcon?: string | null;
      skillName?: string;
      skillUnavailable?: boolean;
    };
  };
}

export function SkillNodeComponent({ node }: SkillNodeComponentProps) {
  if (node.attrs.skillUnavailable === true) {
    return (
      <NodeViewWrapper className="inline-flex align-middle">
        <Chip
          label={UNAVAILABLE_SKILL_LABEL}
          icon={ExclamationCircleIcon}
          color="warning"
          size="xs"
        />
      </NodeViewWrapper>
    );
  }

  const skillIcon = node.attrs.skillIcon ?? null;
  const skillName = node.attrs.skillName ?? "Skill";

  return (
    <NodeViewWrapper className="inline-flex align-middle">
      <Chip
        label={skillName}
        icon={getSkillIcon(skillIcon)}
        color="white"
        size="xs"
      />
    </NodeViewWrapper>
  );
}
