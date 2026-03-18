import { cn, Icon, Spinner } from "@dust-tt/sparkle";

interface TimelineRowProps {
  icon?: React.ComponentType<{ className?: string }> | null;
  spinner?: boolean;
  isLast?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}

/**
 * A single row in the stepper timeline.
 * Renders an icon (or spinner) on the left with a vertical connecting line
 * to the next row, and content on the right.
 */
export function TimelineRow({
  icon,
  spinner,
  isLast,
  onClick,
  children,
}: TimelineRowProps) {
  return (
    <div
      onClick={onClick}
      className={cn("flex gap-2", onClick && "cursor-pointer hover:opacity-80")}
    >
      {/* Icon column with connecting line */}
      <div className="flex flex-col items-center">
        <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
          {spinner ? (
            <Spinner size="xs" />
          ) : icon ? (
            <Icon
              visual={icon}
              size="xs"
              className="text-muted-foreground dark:text-muted-foreground-night"
            />
          ) : null}
        </div>
        {!isLast && (
          <div className="w-0.5 flex-1 rounded-full bg-border dark:bg-border-night" />
        )}
      </div>

      {/* Content */}
      <div className="flex min-h-7 flex-wrap items-center gap-1.5 pb-1">
        {children}
      </div>
    </div>
  );
}
