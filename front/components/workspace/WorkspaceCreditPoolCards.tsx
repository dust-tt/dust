import { formatCredits } from "@app/lib/client/credits";
import {
  AlertCircle,
  ContentMessage,
  Page,
  Spinner,
  ValueCard,
} from "@dust-tt/sparkle";
import type { ReactNode } from "react";

export type CreditPoolFetchStatus = "loading" | "error" | "ready";

export function toCreditPoolFetchStatus(
  isLoading: boolean,
  isError: boolean
): CreditPoolFetchStatus {
  if (isError) {
    return "error";
  }
  return isLoading ? "loading" : "ready";
}

interface WorkspaceCreditPoolSectionProps {
  cardsStatus: CreditPoolFetchStatus;
  showPoolCard: boolean;
  isVisible: boolean;
  totalRemainingCredits: number;
  poolSecondaryContent?: ReactNode;
}

export function WorkspaceCreditPoolSection({
  cardsStatus,
  showPoolCard,
  isVisible,
  totalRemainingCredits,
  poolSecondaryContent,
}: WorkspaceCreditPoolSectionProps) {
  if (cardsStatus === "ready" && !isVisible) {
    return null;
  }

  return (
    <Page.Vertical gap="xs" align="stretch">
      <Page.H variant="h4">Credit usage</Page.H>

      {cardsStatus === "error" ? (
        <ContentMessage
          title="Failed to load Workspace Credits Pool"
          icon={AlertCircle}
          variant="warning"
        >
          An error occurred while loading the workspace&apos;s credit pool data.
        </ContentMessage>
      ) : cardsStatus === "loading" ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : (
        <>
          {showPoolCard && (
            <ValueCard
              title="Remaining credits pool"
              isLoading={false}
              content={
                <div className="truncate text-2xl text-foreground">
                  {formatCredits(totalRemainingCredits)}
                </div>
              }
            />
          )}
          {poolSecondaryContent}
        </>
      )}
    </Page.Vertical>
  );
}
