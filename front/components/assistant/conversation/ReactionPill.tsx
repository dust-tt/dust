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
          size="xmini"
          variant="outline"
          onClick={onClick}
          className={cn(
            hasCurrentUserReacted &&
              "border-blue-200 bg-blue-50 hover:border-blue-200 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-900 hover:dark:border-blue-700 dark:hover:bg-blue-800"
          )}
        />
      }
    />
  );
}
