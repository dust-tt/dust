import {
  useCompactConversation,
  useConversationContextUsage,
} from "@app/hooks/conversations";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from "@dust-tt/sparkle";

interface ContextUsageIndicatorProps {
  buttonSize: "xs" | "sm";
  owner: LightWorkspaceType;
  conversationId?: string | null;
}

interface CircleProgressProps {
  percentage: number;
  size?: number;
}

const CONTEXT_USAGE_PERCENT_THRESHOLD = 33;

function CircleProgress({ percentage, size = 16 }: CircleProgressProps) {
  const strokeWidth = size * 0.14;
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
  buttonSize,
  owner,
  conversationId,
}: ContextUsageIndicatorProps) {
  const { contextUsage } = useConversationContextUsage({
    conversationId,
    workspaceId: owner.sId,
  });

  const { compact, isCompacting } = useCompactConversation({
    owner,
    conversationId,
  });

  const percentage =
    contextUsage && contextUsage.contextSize > 0
      ? Math.round((contextUsage.contextUsage / contextUsage.contextSize) * 100)
      : 0;

  return (
    <div className="hidden md:block">
      <TooltipProvider>
        <TooltipRoot>
          <TooltipTrigger asChild>
            <Button
              variant="ghost-secondary"
              size={buttonSize}
              icon={() => <CircleProgress percentage={percentage} size={16} />}
            />
          </TooltipTrigger>
          <TooltipContent side="top" className="p-3">
            <div className="flex flex-col items-start gap-3">
              <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                The current context usage is at {percentage}%
              </span>
              {percentage > CONTEXT_USAGE_PERCENT_THRESHOLD && (
                <Button
                  variant="outline"
                  size="xs"
                  label={isCompacting ? "Compacting" : "Compact now"}
                  onClick={() => {
                    if (contextUsage?.model) {
                      void compact(contextUsage.model);
                    }
                  }}
                  disabled={isCompacting || !contextUsage?.model}
                  isLoading={isCompacting}
                />
              )}
            </div>
          </TooltipContent>
        </TooltipRoot>
      </TooltipProvider>
    </div>
  );
}
