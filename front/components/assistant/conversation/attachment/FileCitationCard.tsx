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
import { type ComponentType, isValidElement } from "react";

export type FileCitationCardSize = "md" | "sm" | "xs";
export type FileCitationCardIcon = ComponentType | React.ReactNode;

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
type FileCitationCardProps = FileCitationCardPropsBase &
  (
    | { onClick: (e: React.MouseEvent<HTMLDivElement>) => void; href?: never }
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
    <div className="flex flex-col gap-0.5">
      <div>{tooltipLabel}</div>
      <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        {description}
      </div>
    </div>
  );
}

function getIconSizeForCitationCard(size: FileCitationCardSize): "xs" | "sm" {
  return size === "xs" ? "xs" : "sm";
}

function renderFileCitationIcon(
  icon: FileCitationCardIcon,
  size: FileCitationCardSize
): React.ReactNode {
  if (isValidElement(icon)) {
    return icon;
  }

  if (typeof icon === "function") {
    return <Icon visual={icon} size={getIconSizeForCitationCard(size)} />;
  }

  if (typeof icon === "object" && icon !== null) {
    return (
      <Icon
        visual={icon as unknown as ComponentType}
        size={getIconSizeForCitationCard(size)}
      />
    );
  }

  return icon;
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
      color: "white" as const,
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
          onClick={
            "onClick" in props && props.onClick
              ? () =>
                  props.onClick({
                    stopPropagation: () => {},
                  } as React.MouseEvent<HTMLDivElement>)
              : undefined
          }
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
