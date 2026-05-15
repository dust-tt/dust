import type { WorkspaceLimit } from "@app/components/app/ReachedLimitPopup";
import { ReachedLimitPopup } from "@app/components/app/ReachedLimitPopup";
import { InviteEmailButtonWithModal } from "@app/components/members/InviteEmailButtonWithModal";
import { BuyAwuCreditsDialog } from "@app/components/workspace/BuyAwuCreditsDialog";
import { MembersUsageTable } from "@app/components/workspace/MembersUsageTable";
import {
  useAuth,
  useFeatureFlags,
  useWorkspace,
} from "@app/lib/auth/AuthContext";
import { isUpgraded } from "@app/lib/plans/plan_codes";
import { useAppRouter } from "@app/lib/platform";
import { useAwuPoolSummary, useCreditPurchaseInfo } from "@app/lib/swr/credits";
import { useMembersUsage } from "@app/lib/swr/memberships";
import {
  useMetronomeContract,
  usePerSeatPricing,
  useWorkspaceSeatAvailability,
} from "@app/lib/swr/workspaces";
import type { MembershipSeatType } from "@app/types/memberships";
import { isAdmin } from "@app/types/user";
import {
  ActionCreditCoinsIcon,
  ActionPieChartIcon,
  ArrowUpIcon,
  Button,
  ContentMessage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  ExclamationCircleIcon,
  Icon,
  Page,
  SearchInput,
  Spinner,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useState } from "react";

function formatCredits(credits: number): string {
  return Math.round(credits).toLocaleString("en-US");
}

function getOrdinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) {
    return "th";
  }
  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

function getResetDateLabel(resetDate: string): string {
  if (!resetDate) {
    return "";
  }
  const date = new Date(resetDate);
  const resetDay = date.getUTCDate();
  const suffix = getOrdinalSuffix(resetDay);
  const resetMonth = date.toLocaleDateString(undefined, {
    month: "long",
    timeZone: "UTC",
  });
  return `Monthly resets on the ${resetDay}${suffix}, ${resetMonth}`;
}

interface CreditPoolUsageBarProps {
  totalCredits: number;
  consumedByUsersCredits: number;
  consumedByProgrammaticCredits: number;
}

function CreditPoolUsageBar({
  totalCredits,
  consumedByUsersCredits,
  consumedByProgrammaticCredits,
}: CreditPoolUsageBarProps) {
  const usersPercentage =
    totalCredits > 0
      ? Math.min((consumedByUsersCredits / totalCredits) * 100, 100)
      : 0;
  const programmaticPercentage =
    totalCredits > 0
      ? Math.min(
          (consumedByProgrammaticCredits / totalCredits) * 100,
          100 - usersPercentage
        )
      : 0;
  const totalConsumedPercentage = usersPercentage + programmaticPercentage;

  return (
    <Page.Vertical gap="xs" align="stretch">
      <div
        className="flex h-2 w-full overflow-hidden rounded-full bg-muted-foreground/10 dark:bg-muted-foreground-night/10"
        role="progressbar"
        aria-label="User and programmatic usage"
        aria-valuenow={Math.round(totalConsumedPercentage)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full shrink-0 bg-yellow-400 transition-all"
          style={{ width: `${usersPercentage}%` }}
        />
        <div
          className="h-full shrink-0 bg-purple-500 transition-all"
          style={{ width: `${programmaticPercentage}%` }}
        />
      </div>
      <div className="flex gap-4 text-xs text-muted-foreground dark:text-muted-foreground-night">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 bg-yellow-400" />
          Users
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 bg-purple-500" />
          Programmatic Usage
        </span>
      </div>
    </Page.Vertical>
  );
}

export function UsagePage() {
  const owner = useWorkspace();
  const { subscription } = useAuth();
  const { hasFeature } = useFeatureFlags();
  const router = useAppRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [seatTypeFilter, setSeatTypeFilter] = useState<
    MembershipSeatType | "none" | null
  >(null);
  const [showBuyCreditDialog, setShowBuyCreditDialog] = useState(false);
  const [inviteBlockedPopupReason, setInviteBlockedPopupReason] =
    useState<WorkspaceLimit | null>(null);

  useEffect(() => {
    if (!hasFeature("metronome_billing_usage_page")) {
      void router.push(`/w/${owner.sId}/members`);
    }
  }, [hasFeature, router, owner.sId]);

  const {
    totalCredits,
    consumedByUsersCredits,
    consumedByProgrammaticCredits,
    resetDate,
    isAwuPoolSummaryLoading,
    isAwuPoolSummaryError,
    mutateAwuPoolSummary,
  } = useAwuPoolSummary({
    workspaceId: owner.sId,
  });

  const { currency, discountPercent, creditPricing, creditPurchaseLimits } =
    useCreditPurchaseInfo({ workspaceId: owner.sId });

  const { membersUsage, isMembersUsageLoading } = useMembersUsage({
    workspaceId: owner.sId,
  });

  const { hasAvailableSeats } = useWorkspaceSeatAvailability({
    workspaceId: owner.sId,
  });

  const { perSeatPricing } = usePerSeatPricing({
    workspaceId: owner.sId,
  });

  const { contract } = useMetronomeContract({
    workspaceId: owner.sId,
  });

  // Default to true so seat columns are shown for non-Metronome workspaces.
  const hasSeatSubscription = contract?.hasSeatSubscription ?? true;

  const plan = subscription.plan;
  const isManualInvitationsEnabled =
    owner.metadata?.disableManualInvitations !== true;

  const onInviteClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (!isUpgraded(plan)) {
        setInviteBlockedPopupReason("cant_invite_free_plan");
        event.preventDefault();
      } else if (subscription.paymentFailingSince) {
        setInviteBlockedPopupReason("cant_invite_payment_failure");
        event.preventDefault();
      } else if (!hasAvailableSeats) {
        setInviteBlockedPopupReason("cant_invite_no_seats_available");
        event.preventDefault();
      }
    },
    [plan, subscription.paymentFailingSince, hasAvailableSeats]
  );

  const totalConsumedCredits =
    consumedByUsersCredits + consumedByProgrammaticCredits;
  const currentBalanceCredits = Math.round(totalCredits - totalConsumedCredits);

  const resetDateLabel = getResetDateLabel(resetDate);

  if (!hasFeature("metronome_billing_usage_page")) {
    return null;
  }

  return (
    <>
      <BuyAwuCreditsDialog
        isOpen={showBuyCreditDialog}
        onClose={() => {
          setShowBuyCreditDialog(false);
          void mutateAwuPoolSummary();
        }}
        workspaceId={owner.sId}
        currency={currency}
        discountPercent={discountPercent}
        creditPricing={creditPricing}
        creditPurchaseLimits={creditPurchaseLimits}
        currentBalanceCredits={currentBalanceCredits}
      />

      <Page.Vertical gap="xl" align="stretch">
        <Page.Vertical gap="xs">
          <Icon
            visual={ActionPieChartIcon}
            className="text-muted-foreground dark:text-muted-foreground-night"
            size="lg"
          />
          <Page.H variant="h3">Usage</Page.H>
          <Page.P variant="secondary">
            Manage the usage of your Dust workspace
          </Page.P>
        </Page.Vertical>

        <Page.Vertical gap="sm" align="stretch">
          <div className="flex items-center justify-between">
            <span className="text-[16px] font-medium leading-[24px] tracking-[-0.32px] text-foreground dark:text-foreground-night">
              Credit pool
            </span>
            {!isAwuPoolSummaryLoading && (
              <div className="flex flex-col items-end gap-0.5">
                <span className="flex items-center gap-1.5 text-[18px] font-semibold leading-[26px] tracking-[-0.36px] text-foreground dark:text-foreground-night">
                  <Icon
                    visual={ActionCreditCoinsIcon}
                    size="sm"
                    className="text-muted-foreground dark:text-muted-foreground-night"
                  />
                  {formatCredits(totalConsumedCredits)} /{" "}
                  {formatCredits(totalCredits)}
                </span>
                <button
                  className="flex cursor-pointer items-center gap-1 text-xs font-medium text-highlight-500 dark:text-highlight-500-night"
                  onClick={() => setShowBuyCreditDialog(true)}
                >
                  <Icon visual={ArrowUpIcon} size="xs" />
                  Top up
                </button>
              </div>
            )}
          </div>

          {isAwuPoolSummaryError && (
            <ContentMessage
              title="Failed to load credit pool"
              icon={ExclamationCircleIcon}
              variant="warning"
            >
              An error occurred while loading your credit pool data. Please
              refresh the page or contact support if the issue persists.
            </ContentMessage>
          )}

          {resetDateLabel &&
            !isAwuPoolSummaryLoading &&
            !isAwuPoolSummaryError && (
              <Page.P variant="secondary">{resetDateLabel}</Page.P>
            )}

          {!isAwuPoolSummaryLoading && !isAwuPoolSummaryError && (
            <CreditPoolUsageBar
              totalCredits={totalCredits}
              consumedByUsersCredits={consumedByUsersCredits}
              consumedByProgrammaticCredits={consumedByProgrammaticCredits}
            />
          )}

          {isAwuPoolSummaryLoading && (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          )}
        </Page.Vertical>

        <Page.Vertical gap="sm" align="stretch">
          <span className="text-[16px] font-medium leading-[24px] tracking-[-0.32px] text-foreground dark:text-foreground-night">
            Members
          </span>
          <div className="flex flex-row gap-2">
            <SearchInput
              placeholder="Search members (email)"
              value={searchTerm}
              name="search"
              onChange={setSearchTerm}
              className="w-full"
            />
            {isManualInvitationsEnabled && (
              <InviteEmailButtonWithModal
                owner={owner}
                prefillText=""
                perSeatPricing={perSeatPricing}
                onInviteClick={onInviteClick}
              />
            )}
          </div>
          {hasSeatSubscription && (
            <div className="flex flex-row justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    label={
                      seatTypeFilter === "none"
                        ? "No seat"
                        : seatTypeFilter
                          ? seatTypeFilter.charAt(0).toUpperCase() +
                            seatTypeFilter.slice(1)
                          : "All seats"
                    }
                    size="sm"
                    isSelect
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    label="All seats"
                    onClick={() => setSeatTypeFilter(null)}
                  />
                  <DropdownMenuItem
                    label="No seat"
                    onClick={() => setSeatTypeFilter("none")}
                  />
                  <DropdownMenuItem
                    label="Free"
                    onClick={() => setSeatTypeFilter("free")}
                  />
                  <DropdownMenuItem
                    label="Pro"
                    onClick={() => setSeatTypeFilter("pro")}
                  />
                  <DropdownMenuItem
                    label="Max"
                    onClick={() => setSeatTypeFilter("max")}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
          <MembersUsageTable
            members={membersUsage}
            isLoading={isMembersUsageLoading}
            searchTerm={searchTerm}
            seatTypeFilter={seatTypeFilter}
            showSeatColumns={hasSeatSubscription}
          />
        </Page.Vertical>

        {inviteBlockedPopupReason && (
          <ReachedLimitPopup
            isAdmin={isAdmin(owner)}
            isOpened={!!inviteBlockedPopupReason}
            onClose={() => setInviteBlockedPopupReason(null)}
            subscription={subscription}
            owner={owner}
            code={inviteBlockedPopupReason}
          />
        )}

        {/* TODO: Settings section*/}
        <div />

        {/* TODO: Notifications section */}
        <div />
      </Page.Vertical>
    </>
  );
}
