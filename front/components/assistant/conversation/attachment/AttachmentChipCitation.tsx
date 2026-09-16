import type { FileCitationCardProps } from "@app/components/assistant/conversation/attachment/FileCitationCard";
import {
  FileCitationTooltipLabel,
  isIconComponent,
} from "@app/components/assistant/conversation/attachment/FileCitationCard";
import { AttachmentChip, Tooltip } from "@dust-tt/sparkle";
import type { ComponentType } from "react";

export type AttachmentChipCitationProps = Omit<FileCitationCardProps, "size">;

/**
 * Chip counterpart of FileCitationCard, using the same AttachmentChip as inline
 * knowledge links. A chip has no body, so the description goes in the tooltip.
 */
export function AttachmentChipCitation(props: AttachmentChipCitationProps) {
  const {
    description,
    icon,
    isLoading,
    loadingLabel,
    onRemove,
    title,
    tooltipLabel,
  } = props;

  // AttachmentChip takes an icon component; rendered visuals are wrapped in one
  // (as KnowledgeChip does) and keep their own size.
  const iconVisual: ComponentType<{ className?: string }> = isIconComponent(
    icon
  )
    ? icon
    : () => <>{icon}</>;

  const chipProps = {
    color: "primary" as const,
    icon: { visual: iconVisual },
    isBusy: isLoading,
    label: title,
    onRemove,
    size: "xs" as const,
  };

  const chip =
    "href" in props && props.href ? (
      <AttachmentChip {...chipProps} href={props.href} target="_blank" />
    ) : (
      <AttachmentChip
        {...chipProps}
        onClick={"onClick" in props ? props.onClick : undefined}
      />
    );

  const tooltipDescription =
    isLoading && loadingLabel ? loadingLabel : description;

  return (
    <Tooltip
      tooltipTriggerAsChild
      trigger={<span className="inline-flex align-middle">{chip}</span>}
      label={
        tooltipDescription ? (
          <FileCitationTooltipLabel
            title={tooltipLabel}
            description={tooltipDescription}
          />
        ) : (
          tooltipLabel
        )
      }
    />
  );
}
