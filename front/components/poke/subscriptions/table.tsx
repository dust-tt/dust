import {
  CloudArrowDownIcon,
  ConfluenceLogo,
  GithubLogo,
  GoogleLogo,
  IntercomLogo,
  NotionLogo,
  SlackLogo,
} from "@dust-tt/sparkle";
import type { SubscriptionType, WorkspaceType } from "@dust-tt/types";
import { format } from "date-fns/format";
import Link from "next/link";

import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import {
  PokeTable,
  PokeTableBody,
  PokeTableCell,
  PokeTableRow,
} from "@app/components/poke/shadcn/ui/table";
import { makeColumnsForSubscriptions } from "@app/components/poke/subscriptions/columns";
import { isDevelopment } from "@app/lib/development";

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
  subscription,
}: {
  subscription: SubscriptionType;
}) {
  const activePlan = subscription.plan;
  return (
    <div className="flex flex-col space-y-8 pt-4">
      <div className="flex justify-between gap-3">
        <div className="border-material-200 my-4 flex flex-grow flex-col rounded-lg border p-4">
          <h2 className="text-md pb-4 font-bold">Active Subscription:</h2>
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
                  {activePlan.limits.assistant.isSlackBotAllowed ? "✅" : "❌"}
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
  );
}
