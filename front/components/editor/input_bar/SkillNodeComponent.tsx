import { getSkillIcon } from "@app/lib/skill";
import { AlertCircle, Chip, Tooltip } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";
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
  onDetails?: (skillId: string) => void;
  onRemove?: () => void;
}

export function SkillNodeComponent({
  node,
  onDetails,
  onRemove,
}: SkillNodeComponentProps) {
  const { t } = useLingui();
  if (node.attrs.skillUnavailable === true) {
    return (
      <NodeViewWrapper className="inline-flex align-middle">
        <Tooltip
          label={t`This referenced skill is unavailable because its visibility or permissions changed.`}
          side="top"
          tooltipTriggerAsChild
          trigger={
            <span className="inline-flex">
              <Chip
                label={t`Unavailable skill`}
                icon={AlertCircle}
                color="warning"
                size="xs"
                onRemove={onRemove}
              />
            </span>
          }
        />
      </NodeViewWrapper>
    );
  }

  const skillIcon = node.attrs.skillIcon ?? null;
  const skillName = node.attrs.skillName ?? t`Skill`;
  const skillId = node.attrs.skillId;
  const handleClick =
    skillId && onDetails ? () => onDetails(skillId) : undefined;

  return (
    <NodeViewWrapper className="inline-flex align-middle">
      <Chip
        label={skillName}
        icon={getSkillIcon(skillIcon)}
        color="primary"
        onClick={handleClick}
        onRemove={onRemove}
        size="xs"
      />
    </NodeViewWrapper>
  );
}
