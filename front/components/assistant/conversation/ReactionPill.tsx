import { Chip, Tooltip } from "@dust-tt/sparkle";

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
        <Chip
          size="xs"
          color={hasCurrentUserReacted ? "highlight" : "primary"}
          onClick={onClick}
        >
          <span>{emoji}</span>
          <span className="text-xs font-medium">{count}</span>
        </Chip>
      }
    />
  );
}
