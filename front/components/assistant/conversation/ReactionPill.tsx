import { Button, cn, Tooltip } from "@dust-tt/sparkle";

interface ReactionPillProps {
  emoji: string;
  count: number;
  users: {
    userId: string | null;
    username: string;
    fullName: string | null;
  }[];
  hasCurrentUserReacted: boolean;
  onClick: () => void;
}

export function ReactionPill({
  emoji,
  count,
  users,
  hasCurrentUserReacted,
  onClick,
}: ReactionPillProps) {
  const tooltipLabel = (
    <div className="flex flex-col gap-0.5">
      {users.map((user, idx) => (
        <span key={idx} className="text-xs">
          {user.fullName ?? user.username}
        </span>
      ))}
    </div>
  );

  return (
    <Tooltip
      label={tooltipLabel}
      side="top"
      tooltipTriggerAsChild
      trigger={
        <Button
          label={`${emoji} ${count}`}
          size="xmini"
          variant="outline"
          onClick={onClick}
          className={cn(
            hasCurrentUserReacted &&
              "border-highlight-200 bg-highlight-50 hover:border-highlight-200 hover:bg-highlight-100"
          )}
        />
      }
    />
  );
}
