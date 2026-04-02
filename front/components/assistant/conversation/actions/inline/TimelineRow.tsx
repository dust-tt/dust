import { Icon, Spinner } from "@dust-tt/sparkle";

const LINE_ANIMATION_STYLE: React.CSSProperties = {
  transformOrigin: "top",
  animation: "grow-down 0.3s ease-out forwards, fade-in 0.3s ease-out forwards",
};

interface TimelineRowProps {
  icon?: React.ComponentType<{ className?: string }> | "circle" | null;
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
      <div className="flex flex-col items-center">
        <div className="flex h-5 w-4 flex-shrink-0 items-center justify-center">
          {spinner ? (
            <Spinner size="xs" />
          ) : icon === "circle" ? (
            <div className="h-2 w-2 rounded-full border-[1.5px] border-border dark:border-border-night" />
          ) : icon ? (
            <Icon
              visual={icon}
              size="xs"
              className="text-faint dark:text-faint-night"
            />
          ) : null}
        </div>
        {!isLast && (
          <div
            className="w-px flex-1 rounded-full bg-border dark:bg-border-night"
            style={LINE_ANIMATION_STYLE}
          />
        )}
      </div>

      {/* Content */}
      {children && (
        <div className="flex min-h-5 min-w-0 flex-wrap items-start gap-1.5 overflow-x-auto">
          {children}
        </div>
      )}
    </div>
  );
}
