import {
  useCompactConversation,
  useConversationContextUsage,
} from "@app/hooks/conversations";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  LinkWrapper,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
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
const COMPACTION_GUIDE_URL = "https://docs.dust.tt/docs/context-compaction";

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
  const { contextUsage, isContextUsageLoading } = useConversationContextUsage({
    conversationId,
    workspaceId: owner.sId,
  });

  const { compact, isCompacting } = useCompactConversation({
    owner,
    conversationId,
  });

  if (isContextUsageLoading) {
    return null;
  }

  const percentage =
    contextUsage && contextUsage.contextSize > 0
      ? Math.round((contextUsage.contextUsage / contextUsage.contextSize) * 100)
      : 0;

  return (
    <div className="hidden md:block" onClick={(e) => e.stopPropagation()}>
      <PopoverRoot>
        <PopoverTrigger asChild>
          <Button
            variant="ghost-secondary"
            size={buttonSize}
            icon={() => <CircleProgress percentage={percentage} size={16} />}
            tooltip={`${percentage}% of context used.`}
          />
        </PopoverTrigger>
        <PopoverContent side="top" align="end" className="w-auto p-3">
          <div className="flex flex-col items-start gap-3">
            <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              {percentage}% of context used.
            </span>
            <div className="flex items-center gap-3">
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
              <LinkWrapper
                href={COMPACTION_GUIDE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-highlight underline hover:text-highlight-light dark:text-highlight-night dark:hover:text-highlight-light-night"
              >
                Learn more
              </LinkWrapper>
            </div>
          </div>
        </PopoverContent>
      </PopoverRoot>
    </div>
  );
}
