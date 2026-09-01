import {
  Button,
  LinkWrapper,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
} from "@dust-tt/sparkle";

/**
 * Mirrors front's
 * `components/assistant/conversation/input_bar/ContextUsageIndicator.tsx`.
 * The live percentage comes from SWR in production; here it is a prop.
 */

const COMPACTION_GUIDE_URL = "https://docs.dust.tt/docs/context-compaction";

// front: CONTEXT_USAGE_PERCENT_THRESHOLDS
const SHOW_WARNING_THRESHOLD = 75;
const ENABLE_COMPACTION_THRESHOLD = 50;

interface CircleProgressProps {
  percentage: number;
  size?: number;
  variant?: "default" | "warning";
}

export function CircleProgress({
  percentage,
  size = 16,
  variant = "default",
}: CircleProgressProps) {
  const strokeWidth = size * 0.14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedPct = Math.min(100, Math.max(0, percentage));
  const offset = circumference - (clampedPct / 100) * circumference;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={variant === "warning" ? "text-warning-400" : ""}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        opacity={0.2}
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="butt"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 0.3s ease" }}
      />
    </svg>
  );
}

interface ContextUsageIndicatorProps {
  buttonSize?: "xs" | "sm";
  percentage: number;
}

export function ContextUsageIndicator({
  buttonSize = "sm",
  percentage,
}: ContextUsageIndicatorProps) {
  const circleProgressVariant =
    percentage > SHOW_WARNING_THRESHOLD ? "warning" : "default";

  return (
    <div className="hidden h-6 md:block" onClick={(e) => e.stopPropagation()}>
      <PopoverRoot>
        <PopoverTrigger asChild>
          <Button
            variant="ghost-secondary"
            size={buttonSize}
            icon={
              <CircleProgress
                percentage={percentage}
                size={16}
                variant={circleProgressVariant}
              />
            }
          />
        </PopoverTrigger>
        <PopoverContent side="top" className="w-auto p-3">
          <div className="flex flex-col items-start gap-3">
            <span className="text-sm text-muted-foreground">
              {percentage}% of context used.{" "}
              <LinkWrapper
                href={COMPACTION_GUIDE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-0.5 text-sm underline"
              >
                Learn more
              </LinkWrapper>
            </span>
            {percentage > ENABLE_COMPACTION_THRESHOLD && (
              <Button variant="outline" size="xs" label="Compact now" />
            )}
          </div>
        </PopoverContent>
      </PopoverRoot>
    </div>
  );
}
