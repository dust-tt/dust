import { getSkillIcon } from "@app/lib/skill";
import { Chip } from "@dust-tt/sparkle";
import { NodeViewWrapper } from "@tiptap/react";

interface SkillNodeComponentProps {
  node: {
    attrs: {
      skillId?: string;
      skillIcon?: string | null;
      skillName?: string;
    };
  };
}

export function SkillNodeComponent({ node }: SkillNodeComponentProps) {
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
