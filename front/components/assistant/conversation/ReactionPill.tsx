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
      trigger={
        <Button
          label={`${emoji} ${count}`}
          size="xs"
          variant="outline"
          onClick={onClick}
          className={cn(
            hasCurrentUserReacted &&
              "border-primary-200 bg-primary-50 hover:border-primary-200 hover:bg-primary-100 dark:border-primary-700 dark:bg-primary-900 hover:dark:border-primary-700 dark:hover:bg-primary-800"
          )}
        />
      }
    />
  );
}
