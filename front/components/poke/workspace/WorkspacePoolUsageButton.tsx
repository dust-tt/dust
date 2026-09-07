import { cn } from "@app/components/poke/shadcn/lib/utils";
import {
  ArrowRight,
  CoinsStacked01,
  Icon,
  LinkWrapper,
} from "@dust-tt/sparkle";

interface WorkspacePoolUsageButtonProps {
  workspaceId: string;
}

export function WorkspacePoolUsageButton({
  workspaceId,
}: WorkspacePoolUsageButtonProps) {
  return (
    <LinkWrapper
      href={`/poke/${workspaceId}/pool-usage`}
      className={cn(
        "group relative isolate flex min-h-20 w-full items-center gap-3 overflow-hidden",
        "rounded-lg border border-highlight-200 bg-linear-to-r from-background via-background to-highlight-50/50",
        "p-4 text-left shadow-sm outline-hidden",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-muted-background"
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center",
          "rounded-lg border border-highlight-200 bg-background text-highlight-500 shadow-sm"
        )}
      >
        <Icon visual={CoinsStacked01} size="md" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-semibold text-foreground">
          Credits Usage
        </span>
        <span className="text-xs text-muted-foreground">
          Review member seats and credit pool consumption.
        </span>
      </div>
      <Icon visual={ArrowRight} size="sm" className="text-highlight-500" />
    </LinkWrapper>
  );
}
