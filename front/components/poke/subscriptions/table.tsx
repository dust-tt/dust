import {
  Button,
  CloudArrowDownIcon,
  ConfluenceLogo,
  GithubLogo,
  GoogleLogo,
  IntercomLogo,
  Modal,
  NotionLogo,
  Page,
  SlackLogo,
} from "@dust-tt/sparkle";
import type { PlanType, SubscriptionType, WorkspaceType } from "@dust-tt/types";
import { Separator } from "@radix-ui/react-select";
import { format } from "date-fns/format";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";

import { PokeButton } from "@app/components/poke/shadcn/ui/button";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import {
  PokeTable,
  PokeTableBody,
  PokeTableCell,
  PokeTableRow,
} from "@app/components/poke/shadcn/ui/table";
import { makeColumnsForSubscriptions } from "@app/components/poke/subscriptions/columns";
import { useSubmitFunction } from "@app/lib/client/utils";
import { isDevelopment } from "@app/lib/development";
import {
  FREE_NO_PLAN_CODE,
  PRO_PLAN_SEAT_29_CODE,
} from "@app/lib/plans/plan_codes";
import { usePokePlans } from "@app/lib/swr";

interface SubscriptionsDataTableProps {
  owner: WorkspaceType;
  subscriptions: SubscriptionType[];
}

function prepareSubscriptionsForDisplay(
  owner: WorkspaceType,
  subscriptions: SubscriptionType[]
) {
  return subscriptions.map((s) => {
    return {
      sId: s.sId ?? "unknown",
      planCode: s.plan.code,
      status: s.status,
      startDate: s.startDate
        ? new Date(s.startDate).toLocaleDateString()
        : null,
      endDate: s.endDate ? new Date(s.endDate).toLocaleDateString() : null,
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
}: {
  owner: WorkspaceType;
  subscription: SubscriptionType;
}) {
  const activePlan = subscription.plan;

  const [showUpgradeDowngradeModal, setShowUpgradeDowngradeModal] =
    useState(false);

  return (
    <>
      <UpgradeDowngradeModal
        show={showUpgradeDowngradeModal}
        onClose={() => setShowUpgradeDowngradeModal(false)}
        owner={owner}
        subscription={subscription}
      />
      <div className="flex flex-col space-y-8 pt-4">
        <div className="flex justify-between gap-3">
          <div className="border-material-200 my-4 flex flex-grow flex-col rounded-lg border p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-md flex-grow pb-4 font-bold">
                Active Subscription:
              </h2>
              <PokeButton
                aria-label="Upgrade / Downgrade"
                variant="outline"
                size="sm"
                onClick={() => setShowUpgradeDowngradeModal(true)}
              >
                🔥 Upgrade / Downgrade
              </PokeButton>
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
                        className="text-xs text-action-400"
                      >
                        {subscription.stripeSubscriptionId}
                      </Link>
                    ) : (
                      "No subscription id"
                    )}
                  </PokeTableCell>
                </PokeTableRow>
                <PokeTableRow>
                  <PokeTableCell>Stripe Customer Id</PokeTableCell>
                  <PokeTableCell>
                    {subscription.stripeCustomerId ? (
                      <Link
                        href={
                          isDevelopment()
                            ? `https://dashboard.stripe.com/test/customers/${subscription.stripeCustomerId}`
                            : `https://dashboard.stripe.com/customers/${subscription.stripeCustomerId}`
                        }
                        target="_blank"
                        className="text-xs text-action-400"
                      >
                        {subscription.stripeCustomerId}
                      </Link>
                    ) : (
                      "No customer id"
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
          <div className="border-material-200 my-4 flex flex-grow flex-col rounded-lg border p-4">
            <h2 className="text-md pb-4 font-bold">Plan limitations:</h2>
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
                        <CloudArrowDownIcon />
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
  show,
  onClose,
  owner,
  subscription,
}: {
  show: boolean;
  onClose: () => void;
  owner: WorkspaceType;
  subscription: SubscriptionType;
}) {
  const router = useRouter();
  const { plans } = usePokePlans();

  const { submit: onDowngrade } = useSubmitFunction(async () => {
    if (
      !window.confirm(
        "Are you sure you want to downgrade this workspace to no plan?"
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

  const { submit: onUpgradeToPlan } = useSubmitFunction(
    async (plan: PlanType) => {
      if (
        !window.confirm(
          `Are you sure you want to upgrade ${owner.name} (${owner.sId}) to plan ${plan.name} (${plan.code}) ?.`
        )
      ) {
        return;
      }
      try {
        const r = await fetch(
          `/api/poke/workspaces/${owner.sId}/upgrade?planCode=${plan.code}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
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
    <Modal
      isOpen={show}
      onClose={onClose}
      hasChanged={false}
      title="Upgrade / Downgrade Workspace"
      variant="full-screen"
    >
      <Page>
        <Page.SectionHeader
          title="Downgrade Workspace"
          description="This action will downgrade the workspace to having no plan. This means that all the features will be disabled and members of
          the workspaces will be redirected to the paywall page. After 15 days, the workspace data will be deleted."
        />
        <div>
          <Button
            label="Downgrade to NO PLAN"
            variant="secondaryWarning"
            onClick={onDowngrade}
            disabled={subscription.plan.code === FREE_NO_PLAN_CODE}
          />
        </div>
        <Separator />
        <Page.SectionHeader
          title="Upgrade Workspace to a Free Plan"
          description="This action will upgrade the workspace to a free plan. This means that all the features will be enabled and members of the workspace will be able to use the workspace according to the selected plan product limitations."
        />
        <div>
          {plans
            // Daph Uncomment this line when Enteprise billing Form is ready
            .filter((p) => p.code !== PRO_PLAN_SEAT_29_CODE) // to be replaced with .filter((p) => p.code.startsWith("FREE_"))
            .map((p) => {
              return (
                <div key={p.code} className="pt-2">
                  <Button
                    variant="secondary"
                    label={`Upgrade to ${p.code}`}
                    onClick={() => onUpgradeToPlan(p)}
                    disabled={subscription.plan.code === p.code}
                  />
                </div>
              );
            })}
        </div>
        <Separator />
        <Page.SectionHeader
          title="Upgrade Workspace to a new Enterprise Plan"
          description="Go to the Enterprise billing form page to upgrade this workspace to a new Enterprise plan ."
        />
        <div>
          <Link href={`/poke/${owner.sId}/upgrade_enterprise`}>
            <Button
              variant="secondary"
              label="Start upgrade to Enterprise plan"
              disabled={subscription.plan.code.startsWith("ENT_")}
            />
          </Link>
        </div>
      </Page>
    </Modal>
  );
}
