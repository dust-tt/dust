import {
  useCompactConversation,
  useConversationContextUsage,
} from "@app/hooks/conversations";
import { CONTEXT_USAGE_PERCENT_THRESHOLDS } from "@app/hooks/conversations/useConversationContextUsage";
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
  variant?: "default" | "warning";
}

const COMPACTION_GUIDE_URL = "https://docs.dust.tt/docs/context-compaction";

function CircleProgress({
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
      className={
        variant === "warning" ? "text-red-400 dark:text-red-400-night" : ""
      }
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

export function ContextUsageIndicator({
  buttonSize,
  owner,
  conversationId,
}: ContextUsageIndicatorProps) {
  const { contextUsage, contextUsagePercentage, isContextUsageLoading } =
    useConversationContextUsage({
      conversationId,
      workspaceId: owner.sId,
      options: { disabled: !conversationId },
    });

  const { compact, isCompacting } = useCompactConversation({
    owner,
    conversationId,
  });

  if (isContextUsageLoading) {
    return null;
  }

  const circleProgressVariant =
    contextUsagePercentage > CONTEXT_USAGE_PERCENT_THRESHOLDS["show_warning"]
      ? "warning"
      : "default";

  return (
    <div className="hidden md:block" onClick={(e) => e.stopPropagation()}>
      <PopoverRoot>
        <PopoverTrigger asChild>
          <Button
            variant="ghost-secondary"
            size={buttonSize}
            icon={
              <CircleProgress
                percentage={contextUsagePercentage}
                size={16}
                variant={circleProgressVariant}
              />
            }
          />
        </PopoverTrigger>
        <PopoverContent side="top" className="w-auto p-3">
          <div className="flex flex-col items-start gap-3">
            <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              {contextUsagePercentage}% of context used.{" "}
              <LinkWrapper
                href={COMPACTION_GUIDE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-0.5 text-sm underline"
              >
                Learn more
              </LinkWrapper>
            </span>
            {contextUsagePercentage >
              CONTEXT_USAGE_PERCENT_THRESHOLDS["enable_compaction"] && (
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
        </PopoverContent>
      </PopoverRoot>
    </div>
  );
}
