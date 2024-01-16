import {
  Button,
  Collapsible,
  DropdownMenu,
  SliderToggle,
  Spinner,
} from "@dust-tt/sparkle";
import {
  AgentConfigurationType,
  DataSourceType,
  isDustAppRunConfiguration,
  isRetrievalConfiguration,
  LightAgentConfigurationType,
  WorkspaceSegmentationType,
} from "@dust-tt/types";
import { UserType, WorkspaceType } from "@dust-tt/types";
import { PlanInvitationType, PlanType, SubscriptionType } from "@dust-tt/types";
import { ConnectorsAPI } from "@dust-tt/types";
import { JsonViewer } from "@textea/json-viewer";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useContext } from "react";

import PokeNavbar from "@app/components/poke/PokeNavbar";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { getAgentConfigurations } from "@app/lib/api/assistant/configuration";
import { getDataSources } from "@app/lib/api/data_sources";
import { GLOBAL_AGENTS_SID } from "@app/lib/assistant";
import { Authenticator, getSession } from "@app/lib/auth";
import { useSubmitFunction } from "@app/lib/client/utils";
import {
  FREE_TEST_PLAN_CODE,
  FREE_UPGRADED_PLAN_CODE,
  isUpgraded,
} from "@app/lib/plans/plan_codes";
import { getPlanInvitation } from "@app/lib/plans/subscription";
import { usePokePlans } from "@app/lib/swr";
import { timeAgoFrom } from "@app/lib/utils";
import logger from "@app/logger/logger";

export const getServerSideProps: GetServerSideProps<{
  user: UserType;
  owner: WorkspaceType;
  subscription: SubscriptionType;
  planInvitation: PlanInvitationType | null;
  dataSources: DataSourceType[];
  agentConfigurations: AgentConfigurationType[];
  slackBotEnabled: boolean;
  gdrivePDFEnabled: boolean;
  githubCodeSyncEnabled: boolean;
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

  const agentConfigurations = (
    await getAgentConfigurations({
      auth,
      agentsGetView: "admin_internal",
      variant: "full",
    })
  ).filter(
    (a) =>
      !Object.values(GLOBAL_AGENTS_SID).includes(a.sId as GLOBAL_AGENTS_SID)
  );

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

  const connectorsAPI = new ConnectorsAPI(logger);
  await Promise.all(
    dataSources.map(async (ds) => {
      if (!ds.connectorId) {
        return;
      }
      const statusRes = await connectorsAPI.getConnector(
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

  const [slackBotEnabled, gdrivePDFEnabled, githubCodeSyncEnabled] =
    await Promise.all([
      // Get slackbot enabled status
      (async () => {
        const slackConnectorId = dataSources.find(
          (ds) => ds.connectorProvider === "slack"
        )?.connectorId;
        let slackBotEnabled = false;
        if (slackConnectorId) {
          const botEnabledRes = await connectorsAPI.getConnectorConfig(
            slackConnectorId,
            "botEnabled"
          );
          if (botEnabledRes.isErr()) {
            throw botEnabledRes.error;
          }
          slackBotEnabled = botEnabledRes.value.configValue === "true";
        }
        return slackBotEnabled;
      })(),
      // Get Gdrive PDF enabled status
      (async () => {
        const gdriveConnectorId = dataSources.find(
          (ds) => ds.connectorProvider === "google_drive"
        )?.connectorId;

        let gdrivePDFEnabled = false;
        if (gdriveConnectorId) {
          const gdrivePDFEnabledRes = await connectorsAPI.getConnectorConfig(
            gdriveConnectorId,
            "pdfEnabled"
          );
          if (gdrivePDFEnabledRes.isErr()) {
            throw gdrivePDFEnabledRes.error;
          }
          gdrivePDFEnabled =
            gdrivePDFEnabledRes.value.configValue === "true" ? true : false;
        }
        return gdrivePDFEnabled;
      })(),
      // Get Github Code Sync enabled status
      (async () => {
        const githubConnectorId = dataSources.find(
          (ds) => ds.connectorProvider === "github"
        )?.connectorId;

        let githubCodeSyncEnabled = false;
        if (githubConnectorId) {
          const githubConnectorEnabledRes =
            await connectorsAPI.getConnectorConfig(
              githubConnectorId,
              "codeSyncEnabled"
            );
          if (githubConnectorEnabledRes.isErr()) {
            throw githubConnectorEnabledRes.error;
          }
          githubCodeSyncEnabled =
            githubConnectorEnabledRes.value.configValue === "true"
              ? true
              : false;
        }
        return githubCodeSyncEnabled;
      })(),
    ]);

  const planInvitation = await getPlanInvitation(auth);

  return {
    props: {
      user,
      owner,
      subscription,
      planInvitation: planInvitation ?? null,
      dataSources,
      agentConfigurations: agentConfigurations,
      slackBotEnabled,
      gdrivePDFEnabled,
      githubCodeSyncEnabled,
      dataSourcesSynchronizedAgo: synchronizedAgoByDsName,
    },
  };
};

const WorkspacePage = ({
  owner,
  subscription,
  planInvitation,
  dataSources,
  agentConfigurations,
  slackBotEnabled,
  gdrivePDFEnabled,
  githubCodeSyncEnabled,
  dataSourcesSynchronizedAgo,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const router = useRouter();
  const sendNotification = useContext(SendNotificationsContext);
  const [isLoading, setIsLoading] = React.useState<boolean>(false);

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
      router.reload();
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
      router.reload();
    } catch (e) {
      console.error(e);
      window.alert("An error occurred while downgrading the workspace.");
    }
  });

  const { submit: onDataSourcesDelete } = useSubmitFunction(
    async (dataSourceName: string) => {
      const retrievalAgents = agentConfigurations.filter((a) => {
        if (isRetrievalConfiguration(a.action)) {
          return a.action.dataSources.some(
            (ds) => ds.dataSourceId === dataSourceName
          );
        }
        return false;
      });
      if (retrievalAgents.length > 0) {
        window.alert(
          "Please archive agents using this data source first: " +
            retrievalAgents.map((a) => a.name).join(", ")
        );
        return;
      }
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
        router.reload();
      } catch (e) {
        console.error(e);
        window.alert("An error occurred while deleting the data source.");
      }
    }
  );

  const { submit: onWorkspaceUpdate } = useSubmitFunction(
    async (segmentation: WorkspaceSegmentationType) => {
      try {
        const r = await fetch(`/api/poke/workspaces/${owner.sId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            segmentation,
          }),
        });
        if (!r.ok) {
          throw new Error("Failed to update workspace.");
        }
        router.reload();
      } catch (e) {
        console.error(e);
        window.alert("An error occurred while updating the workspace.");
      }
    }
  );

  const { submit: onAssistantArchive } = useSubmitFunction(
    async (agentConfiguration: LightAgentConfigurationType) => {
      if (
        !window.confirm(
          `Are you sure you want to archive the ${agentConfiguration.name} assistant? There is no going back.`
        )
      ) {
        return;
      }

      try {
        const r = await fetch(
          `/api/poke/workspaces/${owner.sId}/agent_configurations/${agentConfiguration.sId}`,
          {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
            },
          }
        );
        if (!r.ok) {
          throw new Error("Failed to archive agent configuration.");
        }
        router.reload();
      } catch (e) {
        console.error(e);
        window.alert(
          "An error occurred while archiving the agent configuration."
        );
      }
    }
  );
  const { submit: onDeleteWorkspace } = useSubmitFunction(async () => {
    if (
      !window.confirm(
        "Are you sure you want to delete this workspace? Data will be deleted and THERE IS NO GOING BACK."
      )
    ) {
      return;
    }
    setIsLoading(true);
    try {
      const r = await fetch(`/api/poke/workspaces/${owner.sId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (!r.ok) {
        const res: { error: { message: string } } = await r.json();
        throw new Error(res.error.message);
      }
      await router.push("/poke?success=workspace-deleted");
      sendNotification({
        title: "Succes!",
        description: "Workspace data deleted.",
        type: "success",
      });
    } catch (e) {
      console.error(e);
      window.alert(`We could not delete the workspace:\n${e}`);
    }
    setIsLoading(false);
  });

  const { submit: onSlackbotToggle } = useSubmitFunction(async () => {
    try {
      const r = await fetch(
        `/api/poke/workspaces/${owner.sId}/data_sources/managed-slack/config`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            configKey: "botEnabled",
            botEnabled: `${!slackBotEnabled}`,
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

  const { submit: onGithubCodeSyncToggle } = useSubmitFunction(async () => {
    try {
      const r = await fetch(
        `/api/poke/workspaces/${owner.sId}/data_sources/managed-github/config`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            configKey: "codeSyncEnabled",
            configValue: `${!githubCodeSyncEnabled}`,
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

  const { submit: onUpgradeOrInviteToPlan } = useSubmitFunction(
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
        router.reload();
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
            <h2 className="text-md mb-4 font-bold">Segmentation:</h2>
            <div>
              <DropdownMenu>
                <DropdownMenu.Button>
                  <Button
                    type="select"
                    labelVisible={true}
                    label={owner.segmentation ?? "none"}
                    variant="secondary"
                    hasMagnifying={false}
                    size="sm"
                  />
                </DropdownMenu.Button>
                <DropdownMenu.Items origin="auto" width={240}>
                  {[null, "interesting"].map((segment) => (
                    <DropdownMenu.Item
                      label={segment ?? "none"}
                      key={segment ?? "all"}
                      onClick={() => {
                        void onWorkspaceUpdate(
                          segment as WorkspaceSegmentationType
                        );
                      }}
                    ></DropdownMenu.Item>
                  ))}
                </DropdownMenu.Items>
              </DropdownMenu>
            </div>

            <h2 className="text-md mb-4 mt-8 font-bold">Plan:</h2>
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
                        `${window.location.origin}/w/${owner.sId}/subscription/upgrade-enterprise/${planInvitation.secret}`
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
                    <Collapsible.Button label="Invite or Upgrade to plan" />
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
                                label={
                                  p.billingType === "free"
                                    ? `Upgrade to free plan: ${p.code}`
                                    : `Invite to paid plan: ${p.code}`
                                }
                                onClick={() => onUpgradeOrInviteToPlan(p)}
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
                            !isUpgraded(subscription.plan) ||
                            workspaceHasManagedDataSources
                          }
                        />
                      </div>
                      <div>
                        <Button
                          label="Upgrade to free upgraded plan"
                          variant="tertiary"
                          onClick={onUpgrade}
                          disabled={isUpgraded(subscription.plan)}
                        />
                      </div>
                    </div>
                  </Collapsible.Panel>
                </Collapsible>
              </div>
              <div>
                <Collapsible>
                  <Collapsible.Button label="Delete workspace data (GDPR)" />
                  <Collapsible.Panel>
                    <div className="flex flex-col gap-2 pt-4">
                      <div>
                        {dataSources.length > 0 && (
                          <p className="text-warning mb-4 text-sm ">
                            Delete data sources before deleting the workspace.
                          </p>
                        )}
                        {subscription.plan.code !== FREE_TEST_PLAN_CODE && (
                          <p className="text-warning mb-4 text-sm ">
                            Downgrade to free test plan before deleting the
                            workspace.
                          </p>
                        )}
                        {isLoading ? (
                          <p className="text-warning mb-4 text-sm ">
                            Deleting workspace data...
                            <Spinner />
                          </p>
                        ) : (
                          <Button
                            label="Delete the workspace"
                            variant="secondaryWarning"
                            onClick={onDeleteWorkspace}
                            disabled={
                              subscription.plan.code !== FREE_TEST_PLAN_CODE ||
                              workspaceHasManagedDataSources
                            }
                          />
                        )}
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
                        {JSON.stringify(slackBotEnabled)}
                      </span>
                    </div>
                    <SliderToggle
                      selected={slackBotEnabled}
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
                {ds.connectorProvider === "github" && (
                  <div className="mb-2 flex items-center justify-between text-sm text-gray-600">
                    <div>
                      Code sync enabled?{" "}
                      <span className="font-medium">
                        {JSON.stringify(githubCodeSyncEnabled)}
                      </span>
                    </div>
                    <SliderToggle
                      selected={githubCodeSyncEnabled}
                      onClick={onGithubCodeSyncToggle}
                    />
                  </div>
                )}
              </div>
            ))}

            <h2 className="text-md mb-4 mt-16 font-bold">Assistants:</h2>
            {agentConfigurations.map((a) => (
              <div
                key={a.id}
                className="border-material-200 my-4 rounded-lg border p-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="mb-2 text-lg font-semibold">{a.name}</h3>
                  <div className="flex flex-col gap-2">
                    <Button
                      label="Archive"
                      variant="secondaryWarning"
                      onClick={() => {
                        void onAssistantArchive(a);
                      }}
                    />
                    <Link href={`/poke/${owner.sId}/assistants/${a.sId}`}>
                      <Button label="History" variant="secondary" />
                    </Link>
                  </div>
                </div>
                <div className="mb-2 flex items-center justify-between text-sm text-gray-600">
                  {a.description}
                </div>
                {a.action && isRetrievalConfiguration(a.action) && (
                  <div className="mb-2 flex-col text-sm text-gray-600">
                    <div className="font-bold">Data Sources:</div>
                    {a.action.dataSources.map((ds) => (
                      <div key={ds.dataSourceId}>{ds.dataSourceId}</div>
                    ))}
                  </div>
                )}
                {a.action && isDustAppRunConfiguration(a.action) && (
                  <div className="mb-2 flex-col text-sm text-gray-600">
                    <div className="font-bold">Dust app:</div>
                    <div>
                      {a.action.appWorkspaceId}/{a.action.appId}
                    </div>
                  </div>
                )}
                <div className="mb-2 flex flex-col text-sm text-gray-600">
                  <div className="font-bold">Instructions</div>
                  <div>{(a.generation?.prompt || "").substring(0, 100)}...</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkspacePage;
