import { formatCredits, formatCreditsCompact } from "@app/lib/client/credits";
import { Avatar, Tooltip } from "@dust-tt/sparkle";
import type { ReactNode } from "react";

export function EmptyCell() {
  return (
    <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
      —
    </span>
  );
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

export function CreditsCell({ credits }: { credits: number }) {
  return (
    <Tooltip
      label={`${formatCredits(credits)} credits`}
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
