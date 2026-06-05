import { getSkillIcon } from "@app/lib/skill";
import { UNAVAILABLE_SKILL_LABEL } from "@app/lib/skills/format";
import { AlertCircle, Chip, Tooltip } from "@dust-tt/sparkle";
import { NodeViewWrapper } from "@tiptap/react";

const UNAVAILABLE_SKILL_TOOLTIP_LABEL =
  "This referenced skill is unavailable because its visibility or permissions changed.";

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
        <Tooltip
          label={UNAVAILABLE_SKILL_TOOLTIP_LABEL}
          side="top"
          tooltipTriggerAsChild
          trigger={
            <span className="inline-flex">
              <Chip
                label={UNAVAILABLE_SKILL_LABEL}
                icon={AlertCircle}
                color="warning"
                size="xs"
              />
            </span>
          }
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
