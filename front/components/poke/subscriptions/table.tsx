import {
  Button,
  Chip,
  ConfluenceLogo,
  GithubLogo,
  GlobeAltIcon,
  GoogleLogo,
  IntercomLogo,
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
import Link from "next/link";
import { useRouter } from "next/router";

import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import {
  PokeTable,
  PokeTableBody,
  PokeTableCell,
  PokeTableRow,
} from "@app/components/poke/shadcn/ui/table";
import type { SubscriptionsDisplayType } from "@app/components/poke/subscriptions/columns";
import { makeColumnsForSubscriptions } from "@app/components/poke/subscriptions/columns";
import EnterpriseUpgradeDialog from "@app/components/poke/subscriptions/EnterpriseUpgradeDialog";
import FreePlanUpgradeDialog from "@app/components/poke/subscriptions/FreePlanUpgradeDialog";
import { useSubmitFunction } from "@app/lib/client/utils";
import { clientFetch } from "@app/lib/egress/client";
import { FREE_NO_PLAN_CODE, isProPlanPrefix } from "@app/lib/plans/plan_codes";
import { usePokePlans } from "@app/lib/swr/poke";
import type {
  PlanType,
  ProgrammaticUsageConfigurationType,
  SubscriptionType,
  WorkspaceType,
} from "@app/types";
import { isDevelopment } from "@app/types";

type SubscriptionStatus = "paymentFailed" | "trialing" | "ended" | "active";

function getSubscriptionDisplayStatus(
  subscription: SubscriptionType
): SubscriptionStatus {
  if (subscription.paymentFailingSince !== null) {
    return "paymentFailed";
  }
  if (subscription.trialing) {
    return "trialing";
  }
  if (
    subscription.plan.code === FREE_NO_PLAN_CODE ||
    subscription.endDate !== null
  ) {
    return "ended";
  }
  return "active";
}

const STATUS_CONFIG: Record<
  SubscriptionStatus,
  {
    chipColor: "info" | "blue" | "warning" | "success";
    chipLabel: string;
    cardClass: string;
  }
> = {
  paymentFailed: {
    chipColor: "info",
    chipLabel: "Past Due",
    cardClass:
      "border-info-200 bg-info-50 dark:border-info-200-night dark:bg-info-50-night",
  },
  trialing: {
    chipColor: "blue",
    chipLabel: "Trialing",
    cardClass:
      "border-blue-200 bg-blue-50 dark:border-blue-200-night dark:bg-blue-50-night",
  },
  ended: {
    chipColor: "warning",
    chipLabel: "Ended",
    cardClass:
      "border-warning-200 bg-warning-50 dark:border-warning-200-night dark:bg-warning-50-night",
  },
  active: {
    chipColor: "success",
    chipLabel: "Active",
    cardClass:
      "border-success-200 bg-success-50 dark:border-success-200-night dark:bg-success-50-night",
  },
};

interface SubscriptionsDataTableProps {
  owner: WorkspaceType;
  subscriptions: SubscriptionType[];
}

function prepareSubscriptionsForDisplay(
  owner: WorkspaceType,
  subscriptions: SubscriptionType[]
): SubscriptionsDisplayType[] {
  return subscriptions.map((s) => {
    return {
      id: s.sId ?? "unknown",
      name: s.plan.code,
      status: s.status,
      stripeSubscriptionId: s.stripeSubscriptionId,
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

export function SubscriptionsDataTable({
  owner,
  subscriptions,
}: SubscriptionsDataTableProps) {
  return (
    <div className="border-material-200 my-4 flex flex-col rounded-lg border p-4">
      <h2 className="text-md mb-4 font-bold">History of subscriptions:</h2>
      <PokeDataTable
        columns={makeColumnsForSubscriptions()}
        data={prepareSubscriptionsForDisplay(owner, subscriptions)}
      />
    </div>
  );
}

interface ActiveSubscriptionTableProps {
  owner: WorkspaceType;
  subscription: SubscriptionType;
  subscriptions: SubscriptionType[];
  programmaticUsageConfig: ProgrammaticUsageConfigurationType | null;
}

export function ActiveSubscriptionTable({
  owner,
  subscription,
  subscriptions,
  programmaticUsageConfig,
}: ActiveSubscriptionTableProps) {
  const status = getSubscriptionDisplayStatus(subscription);
  const { chipColor, chipLabel, cardClass } = STATUS_CONFIG[status];

  return (
    <div className="flex flex-col">
      <div className="flex justify-between gap-3">
        <div
          className={`flex flex-grow flex-col rounded-lg border p-4 pb-2 ${cardClass}`}
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-md flex flex-grow items-center gap-2 pb-4 font-bold">
              Subscription
              <Chip color={chipColor} label={chipLabel} size="xs" />
            </h2>
            <SubscriptionsHistoryModal
              owner={owner}
              subscriptions={subscriptions}
            />
            <UpgradeDowngradeModal
              owner={owner}
              subscription={subscription}
              programmaticUsageConfig={programmaticUsageConfig}
            />
          </div>
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
                <PokeTableCell>
                  {subscription.trialing ? "✅" : "❌"}
                </PokeTableCell>
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableCell>Stripe Subscription Id</PokeTableCell>
                <PokeTableCell>
                  {subscription.stripeSubscriptionId ? (
                    <Link
                      href={
                        isDevelopment()
                          ? `https://dashboard.stripe.com/test/subscriptions/${subscription.stripeSubscriptionId}`
                          : `https://dashboard.stripe.com/subscriptions/${subscription.stripeSubscriptionId}`
                      }
                      target="_blank"
                      className="text-xs text-highlight-400"
                    >
                      {subscription.stripeSubscriptionId}
                    </Link>
                  ) : (
                    "No subscription id"
                  )}
                </PokeTableCell>
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableCell>Start Date</PokeTableCell>
                <PokeTableCell>
                  {subscription.startDate
                    ? format(subscription.startDate, "yyyy-MM-dd")
                    : "/"}
                </PokeTableCell>
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableCell>End Date</PokeTableCell>
                <PokeTableCell>
                  {subscription.endDate
                    ? format(subscription.endDate, "yyyy-MM-dd")
                    : "/"}
                </PokeTableCell>
              </PokeTableRow>
            </PokeTableBody>
          </PokeTable>
        </div>
      </div>
    </div>
  );
}

export function PlanLimitationsTable({
  subscription,
}: {
  subscription: SubscriptionType;
}) {
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
                      <GlobeAltIcon />
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
                  {activePlan.limits.users.maxUsers === -1
                    ? "unlimited"
                    : activePlan.limits.users.maxUsers}
                </PokeTableCell>
              </PokeTableRow>

              <PokeTableRow>
                <PokeTableCell>Max number of spaces</PokeTableCell>
                <PokeTableCell>
                  {activePlan.limits.vaults.maxVaults === -1
                    ? "unlimited"
                    : activePlan.limits.vaults.maxVaults}
                </PokeTableCell>
              </PokeTableRow>

              <PokeTableRow>
                <PokeTableCell>Max number of messages</PokeTableCell>
                <PokeTableCell>
                  {activePlan.limits.assistant.maxMessages === -1
                    ? "unlimited"
                    : `${activePlan.limits.assistant.maxMessages} / ${activePlan.limits.assistant.maxMessagesTimeframe}`}
                </PokeTableCell>
              </PokeTableRow>

              <PokeTableRow>
                <PokeTableCell>Max number of data sources</PokeTableCell>
                <PokeTableCell>
                  {activePlan.limits.dataSources.count === -1
                    ? "unlimited"
                    : activePlan.limits.dataSources.count}
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
  const router = useRouter();
  const { plans } = usePokePlans();

  const { submit: onDowngrade } = useSubmitFunction(async () => {
    if (
      !window.confirm(
        "Confirm workspace downgrade to no plan? This action will pause all connectors and delete data after the retention period expires."
      )
    ) {
      return;
    }
    try {
      const r = await clientFetch(
        `/api/poke/workspaces/${owner.sId}/downgrade`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      if (!r.ok) {
        throw new Error("Failed to downgrade workspace.");
      }
      router.reload();
    } catch (e) {
      console.error(e);
      window.alert("An error occurred while downgrading the workspace.");
    }
  });

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
              <Button
                variant="warning"
                onClick={onDowngrade}
                disabled={
                  subscription.plan.code === FREE_NO_PLAN_CODE ||
                  programmaticUsageConfig?.paygCapMicroUsd
                }
                label="Downgrade to NO PLAN"
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
  subscriptions,
}: {
  owner: WorkspaceType;
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
          <SubscriptionsDataTable owner={owner} subscriptions={subscriptions} />
        </SheetContainer>
      </SheetContent>
    </Sheet>
  );
}
