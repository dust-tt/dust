import { Tooltip } from "@dust-tt/sparkle";

import { classNames } from "@app/lib/utils";

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
        <button
          onClick={onClick}
          className={classNames(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-sm transition-colors",
            "border-structure-200 dark:border-structure-200-dark border",
            "hover:bg-structure-100 dark:hover:bg-structure-100-dark",
            hasCurrentUserReacted
              ? "bg-action-200 border-action-300 dark:bg-action-200-dark dark:border-action-300-dark"
              : "bg-structure-50 dark:bg-structure-50-dark"
          )}
        >
          <span>{emoji}</span>
          <span className="text-element-700 dark:text-element-700-dark text-xs font-medium">
            {count}
          </span>
        </button>
      }
    />
  );
}
