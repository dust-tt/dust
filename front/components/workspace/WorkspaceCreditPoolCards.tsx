import { ONE_DAY_MS } from "@app/lib/api/analytics/time_utils";
import { formatCredits } from "@app/lib/client/credits";
import {
  AlertCircle,
  ContentMessage,
  Page,
  Spinner,
  ValueCard,
} from "@dust-tt/sparkle";
import type { ReactNode } from "react";

function formatCycleDayLabel(
  currentCycleStartMs: number | null,
  currentCycleEndMs: number | null
): string | null {
  if (
    currentCycleStartMs === null ||
    currentCycleEndMs === null ||
    currentCycleEndMs <= currentCycleStartMs
  ) {
    return null;
  }
  const totalDays = Math.round(
    (currentCycleEndMs - currentCycleStartMs) / ONE_DAY_MS
  );
  const elapsedDays = Math.min(
    totalDays,
    Math.max(0, Math.ceil((Date.now() - currentCycleStartMs) / ONE_DAY_MS))
  );
  return `Day ${elapsedDays}/${totalDays}`;
}

interface WorkspaceCreditPoolValueCardsProps {
  totalRemainingCredits: number;
  currentCycleConsumedCredits: number | null;
  currentCycleStartMs: number | null;
  currentCycleEndMs: number | null;
  programmaticConsumedCredits: number | null;
  otherConsumedCredits: number | null;
  isLoading: boolean;
}

export function WorkspaceCreditPoolValueCards({
  totalRemainingCredits,
  currentCycleConsumedCredits,
  currentCycleStartMs,
  currentCycleEndMs,
  programmaticConsumedCredits,
  otherConsumedCredits,
  isLoading,
}: WorkspaceCreditPoolValueCardsProps) {
  const cycleDayLabel = formatCycleDayLabel(
    currentCycleStartMs,
    currentCycleEndMs
  );
  return (
    <div className="grid grid-cols-3 gap-4">
      <ValueCard
        title="Remaining credits pool"
        isLoading={isLoading}
        content={
          <div className="truncate text-2xl text-foreground">
            {formatCredits(totalRemainingCredits)}
          </div>
        }
      />
      <ValueCard
        title="Consumed this cycle"
        isLoading={isLoading}
        content={
          <div className="flex items-baseline gap-2">
            <div className="truncate text-2xl text-foreground">
              {typeof currentCycleConsumedCredits === "number"
                ? formatCredits(currentCycleConsumedCredits)
                : "—"}
            </div>
            {cycleDayLabel && (
              <span className="copy-sm text-muted-foreground">
                {cycleDayLabel}
              </span>
            )}
          </div>
        }
      />
      <ValueCard
        title="Programmatic / Other usage"
        isLoading={isLoading}
        content={
          <div className="flex flex-col gap-1">
            <div className="truncate text-2xl text-foreground">
              {typeof programmaticConsumedCredits === "number"
                ? formatCredits(programmaticConsumedCredits)
                : "—"}
            </div>
            <span className="copy-sm text-muted-foreground">
              Other:{" "}
              {typeof otherConsumedCredits === "number"
                ? formatCredits(otherConsumedCredits)
                : "—"}
            </span>
          </div>
        }
      />
    </div>
  );
}

interface WorkspaceExcessCreditsValueCardProps {
  excessConsumedCredits: number | null;
  currentCycleStartMs: number | null;
  currentCycleEndMs: number | null;
  programmaticConsumedCredits: number | null;
  otherConsumedCredits: number | null;
  isLoading: boolean;
}

export function WorkspaceExcessCreditsValueCard({
  excessConsumedCredits,
  currentCycleStartMs,
  currentCycleEndMs,
  programmaticConsumedCredits,
  otherConsumedCredits,
  isLoading,
}: WorkspaceExcessCreditsValueCardProps) {
  const cycleDayLabel = formatCycleDayLabel(
    currentCycleStartMs,
    currentCycleEndMs
  );
  return (
    <div className="grid grid-cols-2 gap-4">
      <ValueCard
        title="Consumed this cycle"
        isLoading={isLoading}
        content={
          <div className="flex items-baseline gap-2">
            <div className="truncate text-2xl text-foreground">
              {typeof excessConsumedCredits === "number"
                ? formatCredits(excessConsumedCredits)
                : "—"}
            </div>
            {cycleDayLabel && (
              <span className="copy-sm text-muted-foreground">
                {cycleDayLabel}
              </span>
            )}
          </div>
        }
      />
      <ValueCard
        title="Programmatic / Other usage"
        isLoading={isLoading}
        content={
          <div className="flex flex-col gap-1">
            <div className="truncate text-2xl text-foreground">
              {typeof programmaticConsumedCredits === "number"
                ? formatCredits(programmaticConsumedCredits)
                : "—"}
            </div>
            <span className="copy-sm text-muted-foreground">
              Other:{" "}
              {typeof otherConsumedCredits === "number"
                ? formatCredits(otherConsumedCredits)
                : "—"}
            </span>
          </div>
        }
      />
    </div>
  );
}

interface WorkspaceCreditPoolSectionProps {
  isLoading: boolean;
  isError: boolean;
  showPoolBranch: boolean;
  isVisible: boolean;
  totalRemainingCredits: number;
  currentCycleConsumedCredits: number | null;
  currentCycleStartMs: number | null;
  currentCycleEndMs: number | null;
  excessConsumedCredits: number | null;
  programmaticConsumedCredits: number | null;
  otherConsumedCredits: number | null;
  poolSecondaryContent?: ReactNode;
  footer?: ReactNode;
}

// Single source of truth for the "Workspace credit pool" / "Excess credit
// consumption" block so the customer-facing usage page and its Poke mirror
// can't drift from each other on this section's structure
export function WorkspaceCreditPoolSection({
  isLoading,
  isError,
  showPoolBranch,
  isVisible,
  totalRemainingCredits,
  currentCycleConsumedCredits,
  currentCycleStartMs,
  currentCycleEndMs,
  excessConsumedCredits,
  programmaticConsumedCredits,
  otherConsumedCredits,
  poolSecondaryContent,
  footer,
}: WorkspaceCreditPoolSectionProps) {
  if (!isLoading && !isError && !isVisible) {
    return null;
  }

  return (
    <Page.Vertical gap="xs" align="stretch">
      <Page.H variant="h4">
        {showPoolBranch ? "Workspace credit pool" : "Excess credit consumption"}
      </Page.H>

      {isError ? (
        <ContentMessage
          title="Failed to load Workspace Credits Pool"
          icon={AlertCircle}
          variant="warning"
        >
          An error occurred while loading the workspace&apos;s credit pool data.
        </ContentMessage>
      ) : isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : showPoolBranch ? (
        <>
          <WorkspaceCreditPoolValueCards
            totalRemainingCredits={totalRemainingCredits}
            currentCycleConsumedCredits={currentCycleConsumedCredits}
            currentCycleStartMs={currentCycleStartMs}
            currentCycleEndMs={currentCycleEndMs}
            programmaticConsumedCredits={programmaticConsumedCredits}
            otherConsumedCredits={otherConsumedCredits}
            isLoading={false}
          />
          {poolSecondaryContent}
          {footer}
        </>
      ) : (
        <>
          <WorkspaceExcessCreditsValueCard
            excessConsumedCredits={excessConsumedCredits}
            currentCycleStartMs={currentCycleStartMs}
            currentCycleEndMs={currentCycleEndMs}
            programmaticConsumedCredits={programmaticConsumedCredits}
            otherConsumedCredits={otherConsumedCredits}
            isLoading={false}
          />
          {footer}
        </>
      )}
    </Page.Vertical>
  );
}
