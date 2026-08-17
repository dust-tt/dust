import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import {
  PokeTable,
  PokeTableBody,
  PokeTableCell,
  PokeTableRow,
} from "@app/components/poke/shadcn/ui/table";
import type { SubscriptionsDisplayType } from "@app/components/poke/subscriptions/columns";
import { makeColumnsForSubscriptions } from "@app/components/poke/subscriptions/columns";
import DowngradeToNoPlanButton from "@app/components/poke/subscriptions/DowngradeToNoPlanButton";
import EnterpriseUpgradeDialog from "@app/components/poke/subscriptions/EnterpriseUpgradeDialog";
import FreePlanUpgradeDialog from "@app/components/poke/subscriptions/FreePlanUpgradeDialog";
import SeatLimitScheduleDialog from "@app/components/poke/subscriptions/SeatLimitScheduleDialog";
import SwitchContractDialog from "@app/components/poke/subscriptions/SwitchContractDialog";
import type { SeatPlanResponseBody } from "@app/lib/api/credits/seat_plan";
import { useSubmitFunction } from "@app/lib/client/utils";
import { clientFetch } from "@app/lib/egress/client";
import { getMetronomeContractUrl } from "@app/lib/metronome/urls";
import { FREE_NO_PLAN_CODE, isProPlanPrefix } from "@app/lib/plans/plan_codes";
import type { PlanLimitOverride } from "@app/lib/plans/plan_limit_overrides";
import { useAppRouter } from "@app/lib/platform";
import { usePokeCancelPendingContract, usePokePlans } from "@app/lib/swr/poke";
import type { PlanType, SubscriptionType } from "@app/types/plan";
import { isSubscriptionMetronomeBilled } from "@app/types/plan";
import type { ProgrammaticUsageConfigurationType } from "@app/types/programmatic_usage";
import { isDevelopment } from "@app/types/shared/env";
import type { WorkspaceType } from "@app/types/user";
import {
  Button,
  Chip,
  ConfluenceLogo,
  cn,
  GithubLogo,
  Globe01,
  GoogleLogo,
  IntercomLogo,
  LinkWrapper,
  NotionLogo,
  Page,
  SalesforceLogo,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SlackLogo,
} from "@dust-tt/sparkle";
import { Separator } from "@radix-ui/react-select";
import { format } from "date-fns/format";

type SubscriptionStatus =
  | "paymentFailed"
  | "trialing"
  | "ended"
  | "active"
  | "inconsistent";

function getSubscriptionDisplayStatus(
  subscription: SubscriptionType
): SubscriptionStatus {
  if (subscription.paymentFailingSince !== null) {
    return "paymentFailed";
  }
  if (subscription.trialing) {
    return "trialing";
  }

  if (subscription.status === "active") {
    return "active";
  }
  if (
    subscription.plan.code === FREE_NO_PLAN_CODE ||
    subscription.status === "ended"
  ) {
    return "ended";
  }
  return "inconsistent";
}

const STATUS_CONFIG: Record<
  SubscriptionStatus,
  {
    chipColor: "info" | "highlight" | "warning" | "success" | "warning";
    chipLabel: string;
    cardClass: string;
  }
> = {
  paymentFailed: {
    chipColor: "info",
    chipLabel: "Past Due",
    cardClass: "border-info-200 bg-info-50",
  },
  trialing: {
    chipColor: "highlight",
    chipLabel: "Trialing",
    cardClass: "border-highlight-200 bg-highlight-50",
  },
  ended: {
    chipColor: "warning",
    chipLabel: "Ended",
    cardClass: "border-warning-200 bg-warning-50",
  },
  active: {
    chipColor: "success",
    chipLabel: "Active",
    cardClass: "border-success-200 bg-success-50",
  },
  inconsistent: {
    chipColor: "warning",
    chipLabel: "Inconsistent",
    cardClass: "border-warning-200 bg-warning-50",
  },
};

interface SubscriptionsDataTableProps {
  owner: WorkspaceType;
  metronomeCustomerId: string | null;
  subscriptions: SubscriptionType[];
}

function prepareSubscriptionsForDisplay(
  owner: WorkspaceType,
  metronomeCustomerId: string | null,
  subscriptions: SubscriptionType[]
): SubscriptionsDisplayType[] {
  return subscriptions.map((s) => {
    return {
      id: s.sId ?? "unknown",
      name: s.plan.code,
      status: s.status,
      stripeSubscriptionId: s.stripeSubscriptionId,
      metronomeContractId: s.metronomeContractId,
      metronomeContractUrl:
        s.metronomeContractId && metronomeCustomerId
          ? getMetronomeContractUrl(metronomeCustomerId, s.metronomeContractId)
          : null,
      startDate: s.startDate
        ? `${new Date(s.startDate).toLocaleDateString()} ${new Date(
            s.startDate
          ).toLocaleTimeString()}`
        : null,
      endDate: s.endDate
        ? `${new Date(s.endDate).toLocaleDateString()} ${new Date(
            s.endDate
          ).toLocaleTimeString()}`
        : null,
      startDateValue: s.startDate ? new Date(s.startDate).getTime() : null,
      endDateValue: s.endDate ? new Date(s.endDate).getTime() : null,
    };
  });
}

function SubscriptionsDataTable({
  owner,
  metronomeCustomerId,
  subscriptions,
}: SubscriptionsDataTableProps) {
  return (
    <div className="border-material-200 my-4 flex flex-col rounded-lg border p-4">
      <h2 className="text-md mb-4 font-bold">History of subscriptions:</h2>
      <PokeDataTable
        columns={makeColumnsForSubscriptions()}
        data={prepareSubscriptionsForDisplay(
          owner,
          metronomeCustomerId,
          subscriptions
        )}
      />
    </div>
  );
}

interface SubscriptionDetailsTableProps {
  subscription: SubscriptionType;
  metronomeCustomerId: string | null;
}

function SubscriptionDetailsTable({
  subscription,
  metronomeCustomerId,
}: SubscriptionDetailsTableProps) {
  return (
    <PokeTable>
      <PokeTableBody>
        <PokeTableRow>
          <PokeTableCell>Plan Name</PokeTableCell>
          <PokeTableCell>{subscription.plan.name}</PokeTableCell>
        </PokeTableRow>
        <PokeTableRow>
          <PokeTableCell>Plan Code</PokeTableCell>
          <PokeTableCell>{subscription.plan.code}</PokeTableCell>
        </PokeTableRow>
        <PokeTableRow>
          <PokeTableCell>Is in Trial?</PokeTableCell>
          <PokeTableCell>{subscription.trialing ? "✅" : "❌"}</PokeTableCell>
        </PokeTableRow>
        <PokeTableRow>
          <PokeTableCell>Stripe Subscription Id</PokeTableCell>
          <PokeTableCell>
            {subscription.stripeSubscriptionId ? (
              <LinkWrapper
                href={
                  isDevelopment()
                    ? `https://dashboard.stripe.com/test/subscriptions/${subscription.stripeSubscriptionId}`
                    : `https://dashboard.stripe.com/subscriptions/${subscription.stripeSubscriptionId}`
                }
                target="_blank"
                className="text-xs text-highlight-400"
              >
                {subscription.stripeSubscriptionId}
              </LinkWrapper>
            ) : (
              "No subscription id"
            )}
          </PokeTableCell>
        </PokeTableRow>
        {subscription.metronomeContractId && metronomeCustomerId && (
          <PokeTableRow>
            <PokeTableCell>Metronome Contract</PokeTableCell>
            <PokeTableCell>
              <LinkWrapper
                href={getMetronomeContractUrl(
                  metronomeCustomerId,
                  subscription.metronomeContractId
                )}
                target="_blank"
                className="text-xs text-highlight-400"
              >
                {subscription.metronomeContractId}
              </LinkWrapper>
            </PokeTableCell>
          </PokeTableRow>
        )}
        <PokeTableRow>
          <PokeTableCell>Start Date</PokeTableCell>
          <PokeTableCell>
            {subscription.startDate
              ? format(subscription.startDate, "yyyy-MM-dd HH:mm")
              : "/"}
          </PokeTableCell>
        </PokeTableRow>
        <PokeTableRow>
          <PokeTableCell>End Date</PokeTableCell>
          <PokeTableCell>
            {subscription.endDate ? (
              <span
                className={cn(
                  subscription.status === "active" &&
                    subscription.endDate <= Date.now() &&
                    "font-semibold text-red-500"
                )}
              >
                {format(subscription.endDate, "yyyy-MM-dd HH:mm")}
              </span>
            ) : (
              "/"
            )}
          </PokeTableCell>
        </PokeTableRow>
      </PokeTableBody>
    </PokeTable>
  );
}

interface CancelPendingSubscriptionButtonProps {
  owner: WorkspaceType;
}

function CancelPendingSubscriptionButton({
  owner,
}: CancelPendingSubscriptionButtonProps) {
  const router = useAppRouter();
  const cancelPendingContract = usePokeCancelPendingContract();

  const { submit: onCancel, isSubmitting } = useSubmitFunction(async () => {
    if (
      !window.confirm(
        `Cancel the pending subscription for ${owner.name} (${owner.sId})? ` +
          "This archives the pending Metronome contract, deletes the pending " +
          "subscription, and restores the current contract/subscription."
      )
    ) {
      return;
    }
    const ok = await cancelPendingContract(owner);
    if (ok) {
      router.reload();
    }
  });

  return (
    <Button
      variant="warning"
      label="🗑️ Cancel pending"
      onClick={onCancel}
      disabled={isSubmitting}
    />
  );
}

function SeatCommitmentsSection({
  owner,
  seatPlan,
}: {
  owner: WorkspaceType;
  seatPlan: SeatPlanResponseBody | null;
}) {
  const entries = Object.entries(seatPlan ?? {});
  if (entries.length === 0) {
    return null;
  }

  return (
    <>
      <div className="pb-1 pt-4 text-sm font-semibold">Seat Commitments</div>
      <PokeTable>
        <PokeTableBody>
          {entries.map(([seatType, info]) => (
            <PokeTableRow key={seatType}>
              <PokeTableCell>{info.name}</PokeTableCell>
              <PokeTableCell>
                {info.minSeats} commitment / {info.maxSeats ?? "∞"} max /{" "}
                {info.assignedCount} used
              </PokeTableCell>
            </PokeTableRow>
          ))}
        </PokeTableBody>
      </PokeTable>
      <div className="pt-2">
        <SeatLimitScheduleDialog owner={owner} seatPlan={seatPlan} />
      </div>
    </>
  );
}

interface ActiveSubscriptionTableProps {
  owner: WorkspaceType;
  metronomeCustomerId: string | null;
  subscription: SubscriptionType;
  pendingSubscription: SubscriptionType | null;
  subscriptions: SubscriptionType[];
  programmaticUsageConfig: ProgrammaticUsageConfigurationType | null;
  hasMetronomeBillingFeature: boolean;
  stripeCustomerId: string | null;
  seatPlan: SeatPlanResponseBody | null;
}

export function ActiveSubscriptionTable({
  owner,
  metronomeCustomerId,
  subscription,
  pendingSubscription,
  subscriptions,
  programmaticUsageConfig,
  hasMetronomeBillingFeature,
  stripeCustomerId,
  seatPlan,
}: ActiveSubscriptionTableProps) {
  const status = getSubscriptionDisplayStatus(subscription);
  const { chipColor, chipLabel, cardClass } = STATUS_CONFIG[status];

  // Show the Metronome flow whenever the workspace is already Metronome-billed,
  // or whenever the Metronome billing feature is enabled for it (FF or
  // kill-switch off). This includes Stripe-billed + shadow-Metronome workspaces
  // mid-migration, so operators can invoke switch_contract from poke.
  const useMetronomeFlow =
    isSubscriptionMetronomeBilled(subscription) || hasMetronomeBillingFeature;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between gap-3">
        <div
          className={`flex flex-grow flex-col rounded-lg border p-4 pb-2 ${cardClass}`}
        >
          <div className="flex items-center justify-between gap-3 pb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-md font-bold">Subscription</h2>
              <Chip color={chipColor} label={chipLabel} size="xs" />
              <SubscriptionsHistoryModal
                owner={owner}
                metronomeCustomerId={metronomeCustomerId}
                subscriptions={subscriptions}
              />
            </div>
            {!useMetronomeFlow && (
              <UpgradeDowngradeModal
                owner={owner}
                subscription={subscription}
                programmaticUsageConfig={programmaticUsageConfig}
              />
            )}
          </div>
          {useMetronomeFlow && (
            <div className="flex flex-wrap items-center gap-2 pb-4">
              <SwitchContractDialog
                owner={owner}
                stripeCustomerId={stripeCustomerId}
              />
              <FreePlanUpgradeDialog owner={owner} />
              <DowngradeToNoPlanButton
                owner={owner}
                subscription={subscription}
                programmaticUsageConfig={programmaticUsageConfig}
              />
            </div>
          )}
          <SubscriptionDetailsTable
            subscription={subscription}
            metronomeCustomerId={metronomeCustomerId}
          />
          <SeatCommitmentsSection owner={owner} seatPlan={seatPlan} />
        </div>
      </div>
      {pendingSubscription && (
        <div className="flex justify-between gap-3">
          <div className="flex flex-grow flex-col rounded-lg border border-highlight-200 bg-highlight-50 p-4 pb-2">
            <div className="flex items-center justify-between gap-2 pb-4">
              <div className="flex items-center gap-2">
                <h2 className="text-md font-bold">Pending Subscription</h2>
                <Chip color="highlight" label="Pending activation" size="xs" />
              </div>
              <CancelPendingSubscriptionButton owner={owner} />
            </div>
            <p className="pb-2 text-xs text-muted-foreground">
              Provisioned in DB. The `contract.start` Metronome webhook will
              flip it to active and end the current subscription.
            </p>
            <SubscriptionDetailsTable
              subscription={pendingSubscription}
              metronomeCustomerId={metronomeCustomerId}
            />
          </div>
        </div>
      )}
    </div>
  );
}

interface PlanLimitValueProps {
  value: number;
  isOverridden: boolean;
}

// A plan limit as it applies to this workspace. Overridden limits are flagged so
// that a value that does not match the plan is never silently displayed as if it
// came from the plan.
function PlanLimitValue({ value, isOverridden }: PlanLimitValueProps) {
  return (
    <span>
      {value === -1 ? "unlimited" : value}
      {isOverridden && (
        <span className="text-warning-500 pl-1 font-bold">(overridden)</span>
      )}
    </span>
  );
}

interface PlanLimitationsTableProps {
  subscription: SubscriptionType;
  planLimitOverride: PlanLimitOverride | null;
}

export function PlanLimitationsTable({
  subscription,
  planLimitOverride,
}: PlanLimitationsTableProps) {
  const activePlan = subscription.plan;

  return (
    <div className="flex flex-col">
      <div className="flex justify-between gap-3">
        <div className="border-material-200 flex flex-grow flex-col rounded-lg border p-4 pb-2">
          <h2 className="text-md pb-4 font-bold">Plan limitations</h2>
          <PokeTable>
            <PokeTableBody>
              <PokeTableRow>
                <PokeTableCell>SlackBot allowed</PokeTableCell>
                <PokeTableCell>
                  {activePlan.limits.assistant.isSlackBotAllowed ? "✅" : "❌"}
                </PokeTableCell>
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableCell>SSO/SCIM features</PokeTableCell>
                <PokeTableCell>
                  {activePlan.limits.users.isSSOAllowed ? "SSO ✅" : "SSO ❌"}
                  {activePlan.limits.users.isSCIMAllowed
                    ? " SCIM ✅"
                    : " SCIM ❌"}
                </PokeTableCell>
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableCell>Connections allowed</PokeTableCell>
                <PokeTableCell>
                  <div className="flex gap-2">
                    {activePlan.limits.connections.isSlackAllowed ? (
                      <SlackLogo />
                    ) : null}
                    {activePlan.limits.connections.isGoogleDriveAllowed ? (
                      <GoogleLogo />
                    ) : null}
                    {activePlan.limits.connections.isGithubAllowed ? (
                      <GithubLogo />
                    ) : null}
                    {activePlan.limits.connections.isNotionAllowed ? (
                      <NotionLogo />
                    ) : null}
                    {activePlan.limits.connections.isIntercomAllowed ? (
                      <IntercomLogo />
                    ) : null}
                    {activePlan.limits.connections.isConfluenceAllowed ? (
                      <ConfluenceLogo />
                    ) : null}
                    {activePlan.limits.connections.isWebCrawlerAllowed ? (
                      <Globe01 />
                    ) : null}
                    {activePlan.limits.connections.isSalesforceAllowed ? (
                      <SalesforceLogo />
                    ) : null}
                  </div>
                </PokeTableCell>
              </PokeTableRow>

              <PokeTableRow>
                <PokeTableCell>Max number of users</PokeTableCell>
                <PokeTableCell>
                  <PlanLimitValue
                    value={activePlan.limits.users.maxUsers}
                    isOverridden={
                      planLimitOverride?.maxUsersInWorkspace != null
                    }
                  />
                </PokeTableCell>
              </PokeTableRow>

              <PokeTableRow>
                <PokeTableCell>Max number of free seats</PokeTableCell>
                <PokeTableCell>
                  <PlanLimitValue
                    value={activePlan.limits.users.maxFreeUsers}
                    isOverridden={
                      planLimitOverride?.maxFreeUsersInWorkspace != null
                    }
                  />
                </PokeTableCell>
              </PokeTableRow>

              <PokeTableRow>
                <PokeTableCell>Max number of lifetime free seats</PokeTableCell>
                <PokeTableCell>
                  <PlanLimitValue
                    value={activePlan.limits.users.maxLifetimeFreeUsers}
                    isOverridden={
                      planLimitOverride?.maxLifetimeFreeUsersInWorkspace != null
                    }
                  />
                </PokeTableCell>
              </PokeTableRow>

              <PokeTableRow>
                <PokeTableCell>Max number of spaces</PokeTableCell>
                <PokeTableCell>
                  <PlanLimitValue
                    value={activePlan.limits.vaults.maxVaults}
                    isOverridden={
                      planLimitOverride?.maxVaultsInWorkspace != null
                    }
                  />
                </PokeTableCell>
              </PokeTableRow>

              <PokeTableRow>
                <PokeTableCell>Messages (pooled) fair use</PokeTableCell>
                <PokeTableCell>
                  {activePlan.limits.assistant.maxMessages === -1
                    ? "unlimited"
                    : `${activePlan.limits.assistant.maxMessages} / ${activePlan.limits.assistant.maxMessagesTimeframe}`}
                </PokeTableCell>
              </PokeTableRow>

              <PokeTableRow>
                <PokeTableCell>AWUCredits (unpooled) fair use</PokeTableCell>
                <PokeTableCell>
                  {activePlan.limits.assistant.maxAwuCredits === -1
                    ? "unlimited"
                    : `${activePlan.limits.assistant.maxAwuCredits} / ${activePlan.limits.assistant.maxAwuCreditsTimeframe}`}
                </PokeTableCell>
              </PokeTableRow>

              <PokeTableRow>
                <PokeTableCell>Is Deep Dive allowed?</PokeTableCell>
                <PokeTableCell>
                  {activePlan.limits.assistant.isDeepDiveAllowed ? "✅" : "❌"}
                </PokeTableCell>
              </PokeTableRow>

              <PokeTableRow>
                <PokeTableCell>
                  Has advanced model access (Opus...)
                </PokeTableCell>
                <PokeTableCell>
                  {activePlan.hasAdvancedModelAccess ? "✅" : "❌"}
                </PokeTableCell>
              </PokeTableRow>

              <PokeTableRow>
                <PokeTableCell>Max number of data sources</PokeTableCell>
                <PokeTableCell>
                  <PlanLimitValue
                    value={activePlan.limits.dataSources.count}
                    isOverridden={
                      planLimitOverride?.maxDataSourcesCount != null
                    }
                  />
                </PokeTableCell>
              </PokeTableRow>

              <PokeTableRow>
                <PokeTableCell>
                  Max number of connections (user-added connectors)
                </PokeTableCell>
                <PokeTableCell>
                  <PlanLimitValue
                    value={activePlan.limits.connections.count}
                    isOverridden={
                      planLimitOverride?.maxConnectionsCount != null
                    }
                  />
                </PokeTableCell>
              </PokeTableRow>

              <PokeTableRow>
                <PokeTableCell>
                  Max number of documents in data sources
                </PokeTableCell>
                <PokeTableCell>
                  {activePlan.limits.dataSources.documents.count === -1
                    ? "unlimited"
                    : activePlan.limits.dataSources.documents.count}
                </PokeTableCell>
              </PokeTableRow>

              <PokeTableRow>
                <PokeTableCell>Max documents size</PokeTableCell>
                <PokeTableCell>
                  {activePlan.limits.dataSources.documents.sizeMb === -1
                    ? "unlimited"
                    : `${activePlan.limits.dataSources.documents.sizeMb}Mb`}
                </PokeTableCell>
              </PokeTableRow>
            </PokeTableBody>
          </PokeTable>
        </div>
      </div>
    </div>
  );
}

interface UpgradeDowngradeModalProps {
  owner: WorkspaceType;
  subscription: SubscriptionType;
  programmaticUsageConfig: ProgrammaticUsageConfigurationType | null;
}

function UpgradeDowngradeModal({
  owner,
  subscription,
  programmaticUsageConfig,
}: UpgradeDowngradeModalProps) {
  const router = useAppRouter();
  const { plans } = usePokePlans();

  const { submit: onUpgradeToProPlan } = useSubmitFunction(
    async (plan: PlanType) => {
      if (
        !window.confirm(
          `Are you sure you want to upgrade ${owner.name} (${owner.sId}) to plan ${plan.name} (${plan.code}) ?.`
        )
      ) {
        return;
      }
      try {
        const r = await clientFetch(
          `/api/poke/workspaces/${owner.sId}/upgrade`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              planCode: plan.code,
            }),
          }
        );
        if (!r.ok) {
          throw new Error("Failed to upgrade workspace to plan.");
        }
        router.reload();
      } catch (e) {
        console.error(e);
        window.alert(
          "An error occurred while upgrading the workspace to plan."
        );
      }
    }
  );

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button label="🔥 Upgrade / Downgrade" variant="outline" />
      </SheetTrigger>
      <SheetContent size="xl">
        <SheetHeader>
          <SheetTitle>Upgrade / Downgrade Workspace</SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <div className="flex flex-col gap-4">
            <Page.SectionHeader
              title="Downgrade Workspace"
              description="This action will downgrade the workspace to having no plan. This means that all the features will be disabled and members of
          the workspaces will be redirected to the paywall page. After 15 days, the workspace data will be deleted."
            />
            {programmaticUsageConfig?.paygCapMicroUsd && (
              <div className="rounded-md border border-warning-200 bg-warning-100 p-3 text-warning-800">
                Cannot downgrade while Pay-as-you-go is enabled. Please disable
                PAYG in the "Manage Programmatic Usage Configuration" plugin
                first.
              </div>
            )}
            <div>
              <DowngradeToNoPlanButton
                owner={owner}
                subscription={subscription}
                programmaticUsageConfig={programmaticUsageConfig}
              />
            </div>
            <Separator />
            <Page.SectionHeader
              title="Upgrade Workspace to a Free Plan"
              description="This action will upgrade the workspace to a free plan. This means that all the features will be enabled and members of the workspace will be able to use the workspace according to the selected plan product limitations."
            />
            <div>
              <FreePlanUpgradeDialog owner={owner} />
            </div>
            <Separator />
            <Page.SectionHeader
              title="Upgrade Workspace to a new Enterprise Plan"
              description="Go to the Enterprise billing form page to upgrade this workspace to a new Enterprise plan ."
            />
            <div>
              <EnterpriseUpgradeDialog
                owner={owner}
                subscription={subscription}
                programmaticUsageConfig={programmaticUsageConfig}
              />
            </div>
            {isProPlanPrefix(subscription.plan.code) && (
              <>
                <Page.SectionHeader
                  title="Change the Pro Plan of this workspace"
                  description="This action changes the Plan limitations for an active Pro subscription. Subscription on Stripe stays the same, we just change the plan in our database."
                />
                <div>
                  {plans
                    .filter((p) => isProPlanPrefix(p.code))
                    .map((p) => {
                      return (
                        <div key={p.code} className="pt-2">
                          <Button
                            variant="outline"
                            disabled={subscription.plan.code === p.code}
                            onClick={() => onUpgradeToProPlan(p)}
                            label={`Upgrade to ${p.code}`}
                          />
                        </div>
                      );
                    })}
                </div>
              </>
            )}
          </div>
        </SheetContainer>
      </SheetContent>
    </Sheet>
  );
}

function SubscriptionsHistoryModal({
  owner,
  metronomeCustomerId,
  subscriptions,
}: {
  owner: WorkspaceType;
  metronomeCustomerId: string | null;
  subscriptions: SubscriptionType[];
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button label="🕰️ History" variant="outline" />
      </SheetTrigger>
      <SheetContent size="xl">
        <SheetHeader>
          <SheetTitle>Workspace subscriptions history</SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <SubscriptionsDataTable
            owner={owner}
            metronomeCustomerId={metronomeCustomerId}
            subscriptions={subscriptions}
          />
        </SheetContainer>
      </SheetContent>
    </Sheet>
  );
}
