import { getSkillIcon } from "@app/lib/skill";
import { Chip } from "@dust-tt/sparkle";
import type { ReactNodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";

export function SkillNodeComponent({ node }: ReactNodeViewProps) {
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
