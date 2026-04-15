import { useCompactConversation } from "@app/hooks/conversations";
import type { SupportedModel } from "@app/types/assistant/models/types";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";

interface ContextUsageIndicatorProps {
  contextUsage: number;
  contextSize: number;
  model: SupportedModel | null;
  buttonSize: "xs" | "sm";
  owner: LightWorkspaceType;
  conversationId?: string | null;
}

interface CircleProgressProps {
  percentage: number;
  size?: number;
}

function CircleProgress({ percentage, size = 16 }: CircleProgressProps) {
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
  model,
  buttonSize,
  owner,
  conversationId,
}: ContextUsageIndicatorProps) {
  const percentage =
    contextSize > 0 ? Math.round((contextUsage / contextSize) * 100) : 0;

  const { compact, isCompacting } = useCompactConversation({
    owner,
    conversationId,
  });

  return (
    <div className="hidden md:block">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost-secondary"
            size={buttonSize}
            icon={() => <CircleProgress percentage={percentage} size={16} />}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" className="w-64">
          <div className="flex flex-col items-start gap-3 p-3">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
                Context
              </span>
              <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                The current context usage is at {percentage}%
              </span>
            </div>
            <Button
              variant="outline"
              size="xs"
              label="Compact now"
              onClick={() => {
                if (model) {
                  void compact(model);
                }
              }}
              disabled={isCompacting || !model}
              isLoading={isCompacting}
            />
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
