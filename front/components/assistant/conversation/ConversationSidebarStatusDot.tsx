import type { ConversationDotStatus } from "@app/lib/utils/conversation_dot_status";
import { cn } from "@dust-tt/sparkle";

/**
 * Same colors as Sparkle `NavigationListItem` status dots (sidebar conversation rows).
 */
export function ConversationSidebarStatusDot({
  status,
  className,
}: {
  status: ConversationDotStatus;
  className?: string;
}) {
  if (status === "idle") {
    return null;
  }

  return (
    <div
      className={cn(
        "heading-xs m-1 flex h-2 w-2 shrink-0 items-center justify-center rounded-full",
        status === "unread" && "bg-highlight-500 dark:bg-highlight-500-night",
        status === "blocked" && "bg-golden-400 dark:bg-golden-400-night",
        className
      )}
      aria-hidden
    />
  );
}
