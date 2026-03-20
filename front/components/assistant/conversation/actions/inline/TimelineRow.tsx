import { Icon, Spinner } from "@dust-tt/sparkle";

interface TimelineRowProps {
  icon?: React.ComponentType<{ className?: string }> | null;
  spinner?: boolean;
  isLast?: boolean;
  children?: React.ReactNode;
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
  children,
}: TimelineRowProps) {
  return (
    <div className="flex gap-2">
      {/* Icon column with connecting line */}
      <div className="flex flex-col items-center pt-0.5">
        <div className="flex h-4 w-4 flex-shrink-0 items-center justify-center">
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
          <div className="mt-0.5 w-0.5 flex-1 rounded-full bg-border dark:bg-border-night" />
        )}
      </div>

      {/* Content */}
      {children && (
        <div className="flex min-h-6 flex-wrap items-start gap-1.5 pb-1">
          {children}
        </div>
      )}
    </div>
  );
}
