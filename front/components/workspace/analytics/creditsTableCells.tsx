import { formatCredits, formatCreditsCompact } from "@app/lib/client/credits";
import { Avatar, cn, Tooltip } from "@dust-tt/sparkle";
import type { ReactNode } from "react";

function EmptyCell() {
  return <span className="text-xs text-muted-foreground">—</span>;
}

export function AvatarNameCell({
  name,
  imageUrl,
}: {
  name: string;
  imageUrl: string | null;
}) {
  return (
    <div className="flex items-center gap-2">
      <Avatar name={name} visual={imageUrl ?? undefined} size="xs" isRounded />
      <span className="truncate text-sm">{name}</span>
    </div>
  );
}

interface CostShareBarProps {
  percentage: number;
  className?: string;
}

export function CostShareBar({ percentage, className }: CostShareBarProps) {
  return (
    <progress
      aria-hidden="true"
      className={cn(
        "block h-1.5 overflow-hidden rounded-full bg-muted accent-primary",
        className
      )}
      max={100}
      value={percentage}
    />
  );
}

export function CostShareCell({ share }: { share: number }) {
  const percentage = Math.round(Math.min(100, share * 100));

  return (
    <div className="flex items-center gap-2">
      <CostShareBar className="w-24" percentage={percentage} />
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
