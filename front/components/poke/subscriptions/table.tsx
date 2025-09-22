import {
  Button,
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
import { FREE_NO_PLAN_CODE, isProPlan } from "@app/lib/plans/plan_codes";
import { usePokePlans } from "@app/lib/swr/poke";
import type { PlanType, SubscriptionType, WorkspaceType } from "@app/types";
import { isDevelopment } from "@app/types";

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

export function ActiveSubscriptionTable({
  owner,
  subscription,
  subscriptions,
}: {
  owner: WorkspaceType;
  subscription: SubscriptionType;
  subscriptions: SubscriptionType[];
}) {
  return (
    <>
      <div className="flex flex-col">
        <div className="flex justify-between gap-3">
          <div className="border-material-200 flex flex-grow flex-col rounded-lg border p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-md flex-grow pb-4 font-bold">
                Active Subscription
              </h2>
              <SubscriptionsHistoryModal
                owner={owner}
                subscriptions={subscriptions}
              />
              <UpgradeDowngradeModal
                owner={owner}
                subscription={subscription}
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
    </>
  );
}

export function PlanLimitationsTable({
  subscription,
}: {
  subscription: SubscriptionType;
}) {
  const activePlan = subscription.plan;

  return (
    <>
      <div className="flex flex-col">
        <div className="flex justify-between gap-3">
          <div className="border-material-200 flex flex-grow flex-col rounded-lg border p-4">
            <h2 className="text-md pb-4 font-bold">Plan limitations</h2>
            <PokeTable>
              <PokeTableBody>
                <PokeTableRow>
                  <PokeTableCell>SlackBot allowed</PokeTableCell>
                  <PokeTableCell>
                    {activePlan.limits.assistant.isSlackBotAllowed
                      ? "✅"
                      : "❌"}
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
    </>
  );
}

function UpgradeDowngradeModal({
  owner,
  subscription,
}: {
  owner: WorkspaceType;
  subscription: SubscriptionType;
}) {
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
      const r = await fetch(`/api/poke/workspaces/${owner.sId}/downgrade`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
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
        const r = await fetch(`/api/poke/workspaces/${owner.sId}/upgrade`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            planCode: plan.code,
          }),
        });
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
            <div>
              <Button
                variant="warning"
                onClick={onDowngrade}
                disabled={subscription.plan.code === FREE_NO_PLAN_CODE}
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
              <EnterpriseUpgradeDialog owner={owner} />
            </div>
            {isProPlan(subscription.plan.code) && (
              <>
                <Page.SectionHeader
                  title="Change the Pro Plan of this workspace"
                  description="This action changes the Plan limitations for an active Pro subscription. Subscription on Stripe stays the same, we just change the plan in our database."
                />
                <div>
                  {plans
                    .filter((p) => isProPlan(p.code))
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
