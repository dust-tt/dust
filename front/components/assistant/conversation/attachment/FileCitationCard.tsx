import {
  AttachmentChip,
  Chip,
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
// `card` is the Citation card shown under messages; `chip` is the compact
// AttachmentChip of the composer's attachment row.
export type FileCitationCardVariant = "card" | "chip";
// Either an icon component or an already rendered visual (e.g. a DoubleIcon).
export type FileCitationCardIcon =
  | ComponentType<{ className?: string }>
  | React.ReactElement;

interface FileCitationCardPropsBase {
  description?: React.ReactNode;
  icon: FileCitationCardIcon;
  isLoading?: boolean;
  loadingLabel?: string;
  onRemove?: () => void;
  size?: FileCitationCardSize;
  title: string;
  tooltipLabel: React.ReactNode;
  variant?: FileCitationCardVariant;
}

// Card is either interactive (onClick or href) or static, never both at once.
type FileCitationCardProps = FileCitationCardPropsBase &
  (
    | { onClick: () => void; href?: never }
    | { href: string; onClick?: never }
    | { onClick?: never; href?: never }
  );

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

// Chips have no body, so the description goes below the title in the tooltip.
function getChipTooltipLabel({
  description,
  tooltipLabel,
}: {
  description?: React.ReactNode;
  tooltipLabel: React.ReactNode;
}) {
  if (!description) {
    return tooltipLabel;
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div>{tooltipLabel}</div>
      <div className="text-sm text-muted-foreground">{description}</div>
    </div>
  );
}

function getIconSizeForCitationCard(size: FileCitationCardSize): "xs" | "sm" {
  return size === "xs" ? "xs" : "sm";
}

function isIconComponent(
  icon: FileCitationCardIcon
): icon is ComponentType<{ className?: string }> {
  return !isValidElement(icon);
}

function renderFileCitationIcon(
  icon: FileCitationCardIcon,
  size: FileCitationCardSize
): React.ReactNode {
  return isIconComponent(icon) ? (
    <Icon visual={icon} size={getIconSizeForCitationCard(size)} />
  ) : (
    icon
  );
}

interface FileCitationChipProps
  extends Omit<FileCitationCardPropsBase, "size" | "variant"> {
  href?: string;
  onClick?: () => void;
}

function FileCitationChip({
  description,
  href,
  icon,
  isLoading,
  loadingLabel,
  onClick,
  onRemove,
  title,
  tooltipLabel,
}: FileCitationChipProps) {
  // AttachmentChip takes an icon component; rendered visuals are wrapped in
  // one (as KnowledgeChip does) and keep their own size.
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

  const chip = href ? (
    <AttachmentChip {...chipProps} href={href} target="_blank" />
  ) : (
    <AttachmentChip {...chipProps} onClick={onClick} />
  );

  return (
    <Tooltip
      tooltipTriggerAsChild
      trigger={<span className="inline-flex align-middle">{chip}</span>}
      label={getChipTooltipLabel({
        description: isLoading && loadingLabel ? loadingLabel : description,
        tooltipLabel,
      })}
    />
  );
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
    variant = "card",
  } = props;

  if (variant === "chip") {
    return <FileCitationChip {...props} />;
  }

  const renderedIcon = renderFileCitationIcon(icon, size);

  if (size === "xs") {
    const chipContent = (
      <span className="flex min-w-0 items-center gap-1">
        {renderedIcon}
        <span className="truncate">{title}</span>
      </span>
    );

    const chipProps = {
      children: chipContent,
      className: "inline-flex max-w-48 align-middle",
      color: "primary" as const,
      isBusy: isLoading,
      onRemove,
      size: "xs" as const,
    };

    const chip =
      "href" in props && props.href ? (
        <Chip {...chipProps} href={props.href} />
      ) : (
        <Chip
          {...chipProps}
          onClick={"onClick" in props ? props.onClick : undefined}
        />
      );

    return (
      <Tooltip
        trigger={chip}
        label={getChipTooltipLabel({ description, tooltipLabel })}
      />
    );
  }

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
      containerClassName="h-full"
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
      containerClassName="h-full"
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
