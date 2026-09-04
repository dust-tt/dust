import {
  AttachmentChip,
  Citation,
  CitationClose,
  CitationDescription,
  CitationIcons,
  CitationTitle,
  Icon,
  Tooltip,
} from "@dust-tt/sparkle";
import type React from "react";
import type { ComponentType } from "react";
import { isValidElement } from "react";

export type FileCitationCardSize = "md" | "sm" | "xs";
// Either an icon component or an already rendered visual (e.g. a DoubleIcon).
export type FileCitationCardIcon =
  | ComponentType<{ className?: string }>
  | React.ReactElement;

interface FileCitationCardPropsBase {
  // Secondary line of the card body. Chips (`xs`) have no body: compose it into
  // `tooltipLabel` instead (see FileCitationTooltipLabel).
  description?: React.ReactNode;
  icon: FileCitationCardIcon;
  isLoading?: boolean;
  loadingLabel?: string;
  onRemove?: () => void;
  size?: FileCitationCardSize;
  title: string;
  tooltipLabel: React.ReactNode;
}

// Card is either interactive (onClick or href) or static, never both at once.
type FileCitationCardProps = FileCitationCardPropsBase &
  (
    | { onClick: () => void; href?: never }
    | { href: string; onClick?: never }
    | { onClick?: never; href?: never }
  );

interface FileCitationTooltipLabelProps {
  title: React.ReactNode;
  description: React.ReactNode;
}

/** Two-line tooltip content shared by file citations and chips. */
export function FileCitationTooltipLabel({
  title,
  description,
}: FileCitationTooltipLabelProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <div>{title}</div>
      <div className="text-sm text-muted-foreground">{description}</div>
    </div>
  );
}

function getFileCitationCardLayout(size: Exclude<FileCitationCardSize, "xs">) {
  switch (size) {
    case "sm":
      return {
        citationClassName: "h-full",
        citationCompact: true,
        showDescription: true,
      };
    case "md":
    default:
      return {
        citationClassName: "h-full",
        citationCompact: false,
        showDescription: true,
      };
  }
}

function isIconComponent(
  icon: FileCitationCardIcon
): icon is ComponentType<{ className?: string }> {
  return !isValidElement(icon);
}

function renderFileCitationIcon(icon: FileCitationCardIcon): React.ReactNode {
  return isIconComponent(icon) ? <Icon visual={icon} size="sm" /> : icon;
}

export function FileCitationCard(props: FileCitationCardProps) {
  const {
    description,
    icon,
    isLoading,
    loadingLabel,
    onRemove,
    size = "md",
    title,
    tooltipLabel,
  } = props;

  if (size === "xs") {
    // Same AttachmentChip as the composer's inline knowledge and pasted-content
    // chips. It takes an icon component, so a rendered visual is wrapped in one
    // (as KnowledgeChip does). The wrapper ignores the chip's className, so the
    // visual keeps its own size, and being a new component type on each render
    // it remounts the (stateless) icon every time, which is fine.
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

    // A chip has no room for the loading label (e.g. transcription progress).
    const chipTooltipLabel =
      isLoading && loadingLabel ? (
        <FileCitationTooltipLabel
          title={tooltipLabel}
          description={loadingLabel}
        />
      ) : (
        tooltipLabel
      );

    return (
      <Tooltip
        tooltipTriggerAsChild
        trigger={<span className="inline-flex align-middle">{chip}</span>}
        label={chipTooltipLabel}
      />
    );
  }

  const renderedIcon = renderFileCitationIcon(icon);
  const href = "href" in props ? props.href : undefined;
  const onClick = "onClick" in props ? props.onClick : undefined;

  const layout = getFileCitationCardLayout(size);
  const action = onRemove ? (
    <CitationClose
      onClick={(e) => {
        e.stopPropagation();
        onRemove();
      }}
    />
  ) : undefined;

  const interior = (
    <>
      <CitationIcons>{renderedIcon}</CitationIcons>
      <CitationTitle className="truncate text-ellipsis">{title}</CitationTitle>
      {layout.showDescription && description && (
        <CitationDescription className="truncate text-ellipsis">
          {description}
        </CitationDescription>
      )}
    </>
  );

  const citation = href ? (
    <Citation
      className={layout.citationClassName}
      compact={layout.citationCompact}
      isLoading={isLoading}
      loadingLabel={loadingLabel}
      href={href}
      action={action}
    >
      {interior}
    </Citation>
  ) : (
    <Citation
      className={layout.citationClassName}
      compact={layout.citationCompact}
      isLoading={isLoading}
      loadingLabel={loadingLabel}
      onClick={onClick}
      action={action}
    >
      {interior}
    </Citation>
  );

  return <Tooltip trigger={citation} label={tooltipLabel} />;
}
