import {
  Button,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
} from "@dust-tt/sparkle";

interface ContextUsageIndicatorProps {
  contextUsage: number;
  contextSize: number;
  buttonSize: "xs" | "sm";
}

function CircleProgress({
  percentage,
  size = 16,
}: {
  percentage: number;
  size?: number;
}) {
  const strokeWidth = size * 0.12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedPct = Math.min(100, Math.max(0, percentage));
  const offset = circumference - (clampedPct / 100) * circumference;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
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

export function ContextUsageIndicator({
  contextUsage,
  contextSize,
  buttonSize,
}: ContextUsageIndicatorProps) {
  const percentage =
    contextSize > 0 ? Math.round((contextUsage / contextSize) * 100) : 0;

  return (
    <PopoverRoot>
      <PopoverTrigger asChild>
        <div className="hidden md:block">
          <Button
            variant="ghost-secondary"
            size={buttonSize}
            icon={() => <CircleProgress percentage={percentage} size={16} />}
          />
        </div>
      </PopoverTrigger>
      <PopoverContent side="top" align="end">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-foreground">
              Context
            </span>
            <span className="text-sm text-muted-foreground">
              The current context of this conversation is {percentage}%
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            label="Compact now"
            disabled={true}
          />
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
}
