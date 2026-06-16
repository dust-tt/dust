import {
  Citation,
  CitationClose,
  CitationDescription,
  CitationIcons,
  CitationTitle,
  Tooltip,
} from "@dust-tt/sparkle";
import type React from "react";

interface FileCitationCardPropsBase {
  compact?: boolean;
  description?: React.ReactNode;
  icon: React.ReactNode;
  isLoading?: boolean;
  loadingLabel?: string;
  onRemove?: () => void;
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

export function FileCitationCard({
  compact,
  description,
  href,
  icon,
  isLoading,
  loadingLabel,
  onClick,
  onRemove,
  title,
  tooltipLabel,
}: FileCitationCardProps) {
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
      <CitationIcons>{icon}</CitationIcons>
      <CitationTitle className="truncate text-ellipsis">{title}</CitationTitle>
      {description && (
        <CitationDescription className="truncate text-ellipsis">
          {description}
        </CitationDescription>
      )}
    </>
  );

  const citation = href ? (
    <Citation
      compact={compact}
      isLoading={isLoading}
      loadingLabel={loadingLabel}
      href={href}
      containerClassName="h-full"
      action={action}
    >
      {interior}
    </Citation>
  ) : (
    <Citation
      compact={compact}
      isLoading={isLoading}
      loadingLabel={loadingLabel}
      onClick={onClick}
      containerClassName="h-full"
      action={action}
    >
      {interior}
    </Citation>
  );

  return <Tooltip trigger={citation} label={tooltipLabel} />;
}
