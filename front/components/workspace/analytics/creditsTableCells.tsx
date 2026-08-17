import { getModelLogoByModelId } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { formatCredits, formatCreditsCompact } from "@app/lib/client/credits";
import {
  Avatar,
  DustLogoSquare,
  Icon,
  ProgressBar,
  Tooltip,
} from "@dust-tt/sparkle";
import type { ReactNode } from "react";

function EmptyCell() {
  return <span className="text-xs text-muted-foreground">—</span>;
}

interface AvatarNameCellProps {
  name: string;
  imageUrl: string | null;
  isRounded?: boolean;
}

export function AvatarNameCell({
  name,
  imageUrl,
  isRounded,
}: AvatarNameCellProps) {
  return (
    <div className="flex items-center gap-2">
      <Avatar
        name={name}
        visual={imageUrl ?? undefined}
        size="xs"
        isRounded={isRounded}
      />
      <span className="truncate text-sm">{name}</span>
    </div>
  );
}

interface EntityTooltipCardProps {
  avatar: ReactNode;
  name: string;
  description: string | null;
  modelId?: string | null;
  modelDisplayName?: string | null;
}

export function EntityTooltipCard({
  avatar,
  name,
  description,
  modelId,
  modelDisplayName,
}: EntityTooltipCardProps) {
  const { isDark } = useTheme();
  const ModelLogo = modelId
    ? getModelLogoByModelId(modelId, isDark)
    : undefined;

  return (
    <div className="flex w-64 flex-col gap-3 py-1 text-left">
      <div className="flex min-w-0 items-center gap-2">
        {avatar}
        <span className="truncate text-base font-semibold text-primary-50">
          {name}
        </span>
      </div>
      <span className="text-sm leading-5 text-primary-200">{description}</span>
      {modelDisplayName && (
        <div className="flex items-center gap-2">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-sm bg-primary-50">
            <Icon
              visual={ModelLogo ?? DustLogoSquare}
              size="xs"
              className="text-primary-950"
            />
          </span>
          <span className="text-sm font-medium text-primary-50">
            {modelDisplayName}
          </span>
        </div>
      )}
    </div>
  );
}

export function CostShareCell({ share }: { share: number }) {
  const percentage = Math.round(Math.min(100, share * 100));

  return (
    <div className="flex items-center gap-2">
      <ProgressBar className="w-24" percentage={percentage} />
      <span className="w-8 text-right text-xs text-muted-foreground tabular-nums">
        {percentage}%
      </span>
    </div>
  );
}

export function CreditsCell({
  credits,
  messageCount,
}: {
  credits: number;
  // When provided (and > 0), the tooltip also shows the average cost per
  // message (credits / messageCount).
  messageCount?: number;
}) {
  const showAvg = messageCount !== undefined && messageCount > 0;
  return (
    <Tooltip
      label={
        <div className="flex flex-col">
          <span>{formatCredits(credits)} credits</span>
          {showAvg && (
            <span>
              {formatCredits(credits / messageCount)} credits / message
            </span>
          )}
        </div>
      }
      tooltipTriggerAsChild
      trigger={<span className="text-sm">{formatCreditsCompact(credits)}</span>}
    />
  );
}

// Vertical list of up to 3 entities (top agents/users/skills) with the shared
// empty-state placeholder. Per-item rendering is left to the caller since the
// item content differs (avatar, secondary text, tooltip).
export function EntityList<I>({
  items,
  renderItem,
}: {
  items: I[];
  renderItem: (item: I, index: number) => ReactNode;
}) {
  if (items.length === 0) {
    return <EmptyCell />;
  }
  return (
    <div className="flex flex-col gap-2 py-1">
      {items.slice(0, 3).map((item, index) => renderItem(item, index))}
    </div>
  );
}
