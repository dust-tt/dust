import { Button, Collapsible, SliderToggle } from "@dust-tt/sparkle";
import { DataSourceType } from "@dust-tt/types";
import { JsonViewer } from "@textea/json-viewer";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import React from "react";

import PokeNavbar from "@app/components/poke/PokeNavbar";
import { getDataSources } from "@app/lib/api/data_sources";
import { Authenticator, getSession } from "@app/lib/auth";
import { useSubmitFunction } from "@app/lib/client/utils";
import { ConnectorsAPI } from "@app/lib/connectors_api";
import {
  FREE_TEST_PLAN_CODE,
  FREE_UPGRADED_PLAN_CODE,
} from "@app/lib/plans/plan_codes";
import { getPlanInvitation } from "@app/lib/plans/subscription";
import { usePokePlans } from "@app/lib/swr";
import { timeAgoFrom } from "@app/lib/utils";
import {
  PlanInvitationType,
  PlanType,
  SubscriptionType,
} from "@app/types/plan";
import { UserType, WorkspaceType } from "@app/types/user";

export const getServerSideProps: GetServerSideProps<{
  user: UserType;
  owner: WorkspaceType;
  subscription: SubscriptionType;
  planInvitation: PlanInvitationType | null;
  dataSources: DataSourceType[];
  slackbotEnabled?: boolean;
  gdrivePDFEnabled?: boolean;
  dataSourcesSynchronizedAgo: Record<string, string>;
}> = async (context) => {
  const wId = context.params?.wId;
  if (!wId || typeof wId !== "string") {
    return {
      notFound: true,
    };
  }

  const session = await getSession(context.req, context.res);
  const auth = await Authenticator.fromSuperUserSession(session, wId);
  const user = auth.user();

  if (!user) {
    return {
      redirect: {
        destination: "/login",
        permanent: false,
      },
    };
  }

  if (!auth.isDustSuperUser()) {
    return {
      notFound: true,
    };
  }

  const owner = auth.workspace();
  const subscription = auth.subscription();

  if (!owner || !subscription) {
    return {
      notFound: true,
    };
  }

  const dataSources = await getDataSources(auth);

  // sort data source so that managed ones (i.e ones with a connector provider) are first
  dataSources.sort((a, b) => {
    if (a.connectorProvider && !b.connectorProvider) {
      return -1;
    }
    if (!a.connectorProvider && b.connectorProvider) {
      return 1;
    }
    return 0;
  });

  const synchronizedAgoByDsName: Record<string, string> = {};

  await Promise.all(
    dataSources.map(async (ds) => {
      if (!ds.connectorId) {
        return;
      }
      const statusRes = await ConnectorsAPI.getConnector(
        ds.connectorId?.toString()
      );
      if (statusRes.isErr()) {
        throw statusRes.error;
      }
      const { lastSyncSuccessfulTime } = statusRes.value;

      if (!lastSyncSuccessfulTime) {
        return;
      }

      synchronizedAgoByDsName[ds.name] = timeAgoFrom(lastSyncSuccessfulTime);
    })
  );

  // Get slackbot enabled status
  const slackConnectorId = dataSources.find(
    (ds) => ds.connectorProvider === "slack"
  )?.connectorId;

  let slackbotEnabled = false;
  if (slackConnectorId) {
    const botEnabledRes = await ConnectorsAPI.getBotEnabled(slackConnectorId);
    if (botEnabledRes.isErr()) {
      throw botEnabledRes.error;
    }
    slackbotEnabled = botEnabledRes.value.botEnabled;
  }
  // Get Gdrive PDF enabled status
  const gdriveConnectorId = dataSources.find(
    (ds) => ds.connectorProvider === "google_drive"
  )?.connectorId;

  let gdrivePDFEnabled = false;
  if (gdriveConnectorId) {
    const gdrivePDFEnabledRes = await ConnectorsAPI.getConnectorConfig(
      gdriveConnectorId,
      "pdfEnabled"
    );
    if (gdrivePDFEnabledRes.isErr()) {
      throw gdrivePDFEnabledRes.error;
    }
    gdrivePDFEnabled =
      gdrivePDFEnabledRes.value.configValue === "true" ? true : false;
  }

  const planInvitation = await getPlanInvitation(auth);

  return {
    props: {
      user,
      owner,
      subscription,
      planInvitation: planInvitation ?? null,
      dataSources,
      slackbotEnabled,
      gdrivePDFEnabled,
      dataSourcesSynchronizedAgo: synchronizedAgoByDsName,
    },
  };
};

const WorkspacePage = ({
  owner,
  subscription,
  planInvitation,
  dataSources,
  slackbotEnabled,
  gdrivePDFEnabled,
  dataSourcesSynchronizedAgo,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const router = useRouter();

  const { plans } = usePokePlans();

  const { submit: onUpgrade } = useSubmitFunction(async () => {
    if (!window.confirm("Are you sure you want to upgrade this workspace?")) {
      return;
    }
    try {
      const r = await fetch(`/api/poke/workspaces/${owner.sId}/upgrade`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (!r.ok) {
        throw new Error("Failed to upgrade workspace.");
      }
      await router.reload();
    } catch (e) {
      console.error(e);
      window.alert("An error occurred while upgrading the workspace.");
    }
  });

  const { submit: onDowngrade } = useSubmitFunction(async () => {
    if (!window.confirm("Are you sure you want to downgrade this workspace?")) {
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
      await router.reload();
    } catch (e) {
      console.error(e);
      window.alert("An error occurred while downgrading the workspace.");
    }
  });

  const { submit: onDataSourcesDelete } = useSubmitFunction(
    async (dataSourceName: string) => {
      if (
        !window.confirm(
          `Are you sure you want to delete the ${dataSourceName} data source? There is no going back.`
        )
      ) {
        return;
      }

      if (!window.confirm(`really, Really, REALLY sure ?`)) {
        return;
      }

      try {
        const r = await fetch(
          `/api/poke/workspaces/${owner.sId}/data_sources/${dataSourceName}`,
          {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
            },
          }
        );
        if (!r.ok) {
          throw new Error("Failed to delete data source.");
        }
        await router.reload();
      } catch (e) {
        console.error(e);
        window.alert("An error occurred while deleting the data source.");
      }
    }
  );

  const { submit: onSlackbotToggle } = useSubmitFunction(async () => {
    try {
      const r = await fetch(
        `/api/poke/workspaces/${owner.sId}/data_sources/managed-slack/bot_enabled`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            botEnabled: !slackbotEnabled,
          }),
        }
      );
      if (!r.ok) {
        throw new Error("Failed to toggle slackbot.");
      }
      router.reload();
    } catch (e) {
      console.error(e);
      window.alert("An error occurred while toggling slackbot.");
    }
  });

  const { submit: onGdrivePDFToggle } = useSubmitFunction(async () => {
    try {
      const r = await fetch(
        `/api/poke/workspaces/${owner.sId}/data_sources/managed-google_drive/config`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            configKey: "pdfEnabled",
            configValue: `${!gdrivePDFEnabled}`,
          }),
        }
      );
      if (!r.ok) {
        throw new Error("Failed to toggle Gdrive PDF sync.");
      }
      router.reload();
    } catch (e) {
      console.error(e);
      window.alert("Failed to toggle Gdrive PDF sync.");
    }
  });

  const { submit: onInviteToEnterprisePlan } = useSubmitFunction(
    async (plan: PlanType) => {
      if (
        !window.confirm(
          `Are you sure you want to invite ${owner.name} (${owner.sId}) to plan ${plan.name} (${plan.code}) ?.`
        )
      ) {
        return;
      }
      try {
        console.log({ plan });
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
          throw new Error("Failed to invite workspace to enterprise plan.");
        }
        await router.reload();
      } catch (e) {
        console.error(e);
        window.alert("An error occurred while inviting to enterprise plan.");
      }
    }
  );

  const [hasCopiedInviteLink, setHasCopiedInviteLink] = React.useState(false);

  const workspaceHasManagedDataSources = dataSources.some(
    (ds) => !!ds.connectorProvider
  );

  return (
    <div className="min-h-screen bg-structure-50">
      <PokeNavbar />
      <div className="flex-grow p-6">
        <div>
          <span className="pr-2 text-2xl font-bold">{owner.name}</span>
        </div>
        <div>
          <Link
            href={`/poke/${owner.sId}/memberships`}
            className="text-xs text-action-400"
          >
            view members
          </Link>
        </div>

        <div className="flex justify-center">
          <div className="mx-2 w-1/3">
            <h2 className="text-md mb-4 font-bold">Plan:</h2>
            <JsonViewer value={subscription} rootName={false} />
            {planInvitation && (
              <div className="mb-4 flex flex-col gap-2 pt-4 text-sm font-bold">
                <div>
                  The workspace is currently invited to enterprise plan{" "}
                  {planInvitation.planName} ({planInvitation.planCode})
                </div>
                <div>
                  <Button
                    label={
                      hasCopiedInviteLink ? "Copied !" : "Copy invite link"
                    }
                    variant="secondary"
                    onClick={async () => {
                      await navigator.clipboard.writeText(
                        `${window.location.origin}/upgrade-enterprise/${planInvitation.secret}`
                      );
                      setHasCopiedInviteLink(true);
                      setTimeout(() => {
                        setHasCopiedInviteLink(false);
                      }, 2000);
                    }}
                    disabled={hasCopiedInviteLink}
                  />
                </div>
              </div>
            )}
            <div className="flex flex-col gap-8">
              {plans && (
                <div className="pt-8">
                  <Collapsible>
                    <Collapsible.Button label="Invite to enterprise plan" />
                    <Collapsible.Panel>
                      <div className="flex flex-col gap-2 pt-4">
                        {plans.map((p) => {
                          if (
                            [
                              FREE_TEST_PLAN_CODE,
                              FREE_UPGRADED_PLAN_CODE,
                            ].includes(p.code)
                          ) {
                            return null;
                          }

                          return (
                            <div key={p.code}>
                              <Button
                                variant="secondary"
                                label={`${p.name} (${p.code})`}
                                onClick={() => onInviteToEnterprisePlan(p)}
                                disabled={[
                                  subscription.plan.code,
                                  planInvitation?.planCode ?? "",
                                ].includes(p.code)}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </Collapsible.Panel>
                  </Collapsible>
                </div>
              )}
              <div>
                <Collapsible>
                  <Collapsible.Button label="Legacy plan actions" />
                  <Collapsible.Panel>
                    <div className="flex flex-col gap-2 pt-4">
                      <div>
                        <Button
                          label="Downgrade back to free test plan"
                          variant="secondaryWarning"
                          onClick={onDowngrade}
                          disabled={
                            subscription.plan.code === FREE_TEST_PLAN_CODE ||
                            workspaceHasManagedDataSources
                          }
                        />
                      </div>
                      <div>
                        <Button
                          label="Upgrade to free upgraded plan"
                          variant="tertiary"
                          onClick={onUpgrade}
                          disabled={
                            subscription.plan.code !== FREE_TEST_PLAN_CODE
                          }
                        />
                      </div>
                    </div>
                  </Collapsible.Panel>
                </Collapsible>
              </div>
            </div>
            {subscription.plan.code !== FREE_TEST_PLAN_CODE &&
              workspaceHasManagedDataSources && (
                <span className="mx-2 w-1/3">
                  <p className="text-warning mb-4 text-sm ">
                    Delete managed data sources before downgrading.
                  </p>
                </span>
              )}
          </div>
          <div className="mx-2 w-1/3">
            <h2 className="text-md mb-4 font-bold">Data Sources:</h2>
            {dataSources.map((ds) => (
              <div
                key={ds.id}
                className="border-material-200 my-4 rounded-lg border p-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="mb-2 text-lg font-semibold">
                    <Link href={`/poke/${owner.sId}/data_sources/${ds.name}`}>
                      {ds.name}
                    </Link>
                  </h3>
                  <Button
                    label="Delete"
                    variant="secondaryWarning"
                    onClick={() => onDataSourcesDelete(ds.name)}
                  />
                </div>
                <p className="mb-2 text-sm text-gray-600">
                  {ds.connectorProvider ? "Connection" : "Folder"}
                </p>
                {dataSourcesSynchronizedAgo[ds.name] && (
                  <p className="mb-2 text-sm text-gray-600">
                    Synchronized {dataSourcesSynchronizedAgo[ds.name]} ago
                  </p>
                )}
                {ds.connectorProvider === "slack" && (
                  <div className="mb-2 flex items-center justify-between text-sm text-gray-600">
                    <div>
                      Slackbot enabled?{" "}
                      <span className="font-medium">
                        {JSON.stringify(slackbotEnabled)}
                      </span>
                    </div>
                    <SliderToggle
                      selected={slackbotEnabled}
                      onClick={onSlackbotToggle}
                    />
                  </div>
                )}
                {ds.connectorProvider === "google_drive" && (
                  <div className="mb-2 flex items-center justify-between text-sm text-gray-600">
                    <div>
                      PDF syncing enabled?{" "}
                      <span className="font-medium">
                        {JSON.stringify(gdrivePDFEnabled)}
                      </span>
                    </div>
                    <SliderToggle
                      selected={gdrivePDFEnabled}
                      onClick={onGdrivePDFToggle}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkspacePage;
