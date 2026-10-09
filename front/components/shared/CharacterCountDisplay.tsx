import { cn } from "@dust-tt/sparkle";
import { Trans } from "@lingui/react/macro";

interface CharacterCountProps {
  count: number;
  maxCount: number;
}

export function CharacterCountDisplay({
  count,
  maxCount,
}: CharacterCountProps) {
  if (count <= maxCount / 2) {
    return null;
  }

  const isOverLimit = count >= maxCount;

  return (
    <span
      className={cn(
        "text-end text-xs",
        isOverLimit ? "text-warning" : "text-muted-foreground"
      )}
    >
      <Trans>
        {count} / {maxCount} characters
      </Trans>
    </span>
  );
}
