import {
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
}

// Card is either interactive (onClick or href) or static, never both at once.
export type FileCitationCardProps = FileCitationCardPropsBase &
  (
    | { onClick: () => void; href?: never }
    | { href: string; onClick?: never }
    | { onClick?: never; href?: never }
  );

interface FileCitationTooltipLabelProps {
  title: React.ReactNode;
  description: React.ReactNode;
}

/** Two-line tooltip content: title with a muted description below. */
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

function getFileCitationCardTooltipLabel({
  description,
  size,
  tooltipLabel,
}: {
  description?: React.ReactNode;
  size: FileCitationCardSize;
  tooltipLabel: React.ReactNode;
}) {
  if (size !== "xs" || !description) {
    return tooltipLabel;
  }

  return (
    <FileCitationTooltipLabel title={tooltipLabel} description={description} />
  );
}

function getIconSizeForCitationCard(size: FileCitationCardSize): "xs" | "sm" {
  return size === "xs" ? "xs" : "sm";
}

export function isIconComponent(
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
        label={getFileCitationCardTooltipLabel({
          description,
          size: "xs",
          tooltipLabel,
        })}
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

  return (
    <Tooltip
      trigger={citation}
      label={getFileCitationCardTooltipLabel({
        description,
        size,
        tooltipLabel,
      })}
    />
  );
}
