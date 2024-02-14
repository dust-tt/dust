import {
  Button,
  Collapsible,
  DropdownMenu,
  Modal,
  Spinner,
} from "@dust-tt/sparkle";
import type {
  AgentConfigurationType,
  DataSourceType,
  LightAgentConfigurationType,
  WhitelistableFeature,
  WorkspaceSegmentationType,
} from "@dust-tt/types";
import type { WorkspaceType } from "@dust-tt/types";
import type {
  PlanInvitationType,
  PlanType,
  SubscriptionType,
} from "@dust-tt/types";
import {
  DustProdActionRegistry,
  isDustAppRunConfiguration,
  isRetrievalConfiguration,
  isTablesQueryConfiguration,
  WHITELISTABLE_FEATURES,
} from "@dust-tt/types";
import { JsonViewer } from "@textea/json-viewer";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useContext } from "react";
import { useSWRConfig } from "swr";

import PokeNavbar from "@app/components/poke/PokeNavbar";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { getAgentConfigurations } from "@app/lib/api/assistant/configuration";
import { getDataSources } from "@app/lib/api/data_sources";
import {
  GLOBAL_AGENTS_SID,
  orderDatasourceByImportance,
} from "@app/lib/assistant";
import { Authenticator, getSession } from "@app/lib/auth";
import { useSubmitFunction } from "@app/lib/client/utils";
import { isDevelopment } from "@app/lib/development";
import {
  FREE_TEST_PLAN_CODE,
  FREE_UPGRADED_PLAN_CODE,
  isUpgraded,
} from "@app/lib/plans/plan_codes";
import { getPlanInvitation } from "@app/lib/plans/subscription";
import { usePokePlans } from "@app/lib/swr";
import { withGetServerSidePropsLogging } from "@app/logger/withlogging";

export const getServerSideProps = withGetServerSidePropsLogging<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  planInvitation: PlanInvitationType | null;
  dataSources: DataSourceType[];
  agentConfigurations: AgentConfigurationType[];
  whitelistableFeatures: WhitelistableFeature[];
  registry: typeof DustProdActionRegistry;
}>(async (context) => {
  const session = await getSession(context.req, context.res);
  const auth = await Authenticator.fromSuperUserSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();
  const subscription = auth.subscription();

  if (!owner || !subscription || !auth.isDustSuperUser()) {
    return {
      notFound: true,
    };
  }

  const [dataSources, agentConfigurations, planInvitation] = await Promise.all([
    getDataSources(auth),
    (async () => {
      return (
        await getAgentConfigurations({
          auth,
          agentsGetView: "admin_internal",
          variant: "full",
        })
      ).filter(
        (a) =>
          !Object.values(GLOBAL_AGENTS_SID).includes(a.sId as GLOBAL_AGENTS_SID)
      );
    })(),
    getPlanInvitation(auth),
  ]);

  return {
    props: {
      owner,
      subscription,
      planInvitation: planInvitation ?? null,
      dataSources: orderDatasourceByImportance(dataSources),
      agentConfigurations: agentConfigurations,
      whitelistableFeatures:
        WHITELISTABLE_FEATURES as unknown as WhitelistableFeature[],
      registry: DustProdActionRegistry,
    },
  };
});

const WorkspacePage = ({
  owner,
  subscription,
  planInvitation,
  dataSources,
  agentConfigurations,
  whitelistableFeatures,
  registry,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const router = useRouter();
  const { mutate } = useSWRConfig();

  const sendNotification = useContext(SendNotificationsContext);
  const [isLoading, setIsLoading] = React.useState<boolean>(false);

  const { plans } = usePokePlans();

  const [showDustAppLogsModal, setShowDustAppLogsModal] = React.useState(false);

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

  const { submit: onToggleFeature, isSubmitting: isTogglingFeature } =
    useSubmitFunction(async (feature: WhitelistableFeature, value: boolean) => {
      try {
        const r = await fetch(`/api/poke/workspaces/${owner.sId}/features`, {
          method: value ? "POST" : "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: feature,
          }),
        });
        if (!r.ok) {
          throw new Error("Failed to disable feature.");
        }

        await mutate(`/api/poke/workspaces/${owner.sId}/features`);
      } catch (e) {
        sendNotification({
          title: "Error",
          description: `An error occurred while toggling feature "${feature}": ${JSON.stringify(
            e,
            null,
            2
          )}`,
          type: "error",
        });
      }
    });

  const [hasCopiedInviteLink, setHasCopiedInviteLink] = React.useState(false);

  const workspaceHasManagedDataSources = dataSources.some(
    (ds) => !!ds.connectorProvider
  );

  return (
    <>
      <DustAppLogsModal
        show={showDustAppLogsModal}
        onClose={() => {
          setShowDustAppLogsModal(false);
        }}
        owner={owner}
        registry={registry}
      />
      <div className="min-h-screen bg-structure-50">
        <PokeNavbar />
        <div className="ml-8 flex-grow p-6">
          <div>
            <span className="pr-2 text-2xl font-bold">{owner.name}</span>
          </div>
          <div className="pb-4">
            <div>
              <Link
                href={`/poke/${owner.sId}/memberships`}
                className="text-xs text-action-400"
              >
                View members
              </Link>
            </div>
            <div>
              <a
                className="cursor-pointer text-xs text-action-400"
                onClick={() => {
                  setShowDustAppLogsModal(true);
                }}
              >
                View dust app logs
              </a>
            </div>
            {subscription.stripeSubscriptionId && (
              <div>
                <Link
                  href={
                    isDevelopment()
                      ? `https://dashboard.stripe.com/test/subscriptions/${subscription.stripeSubscriptionId}`
                      : `https://dashboard.stripe.com/subscriptions/${subscription.stripeSubscriptionId}`
                  }
                  target="_blank"
                  className="text-xs text-action-400"
                >
                  View Stripe Subscription
                </Link>
              </div>
            )}
          </div>

          <div className="flex-col justify-center">
            <div className="mx-2">
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
                              subscription.stripeSubscriptionId !== null ||
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
                                subscription.plan.code !==
                                  FREE_TEST_PLAN_CODE ||
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
                  <div className="pl-2 pt-4">
                    <p className="text-warning mb-4 text-sm">
                      Delete managed data sources before downgrading.
                    </p>
                  </div>
                )}
            </div>

            <div>
              <div className="mx-2 w-1/3">
                <h2 className="text-md mb-4 font-bold">Features:</h2>
                {whitelistableFeatures.map((f) => (
                  <div
                    key={`feature_${f}`}
                    className="border-material-200 my-4 rounded-lg border p-4"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="mb-2 text-lg font-semibold">{f}</h3>
                      {owner.flags.includes(f) ? (
                        <Button
                          label="Disable"
                          variant="secondaryWarning"
                          onClick={() => {
                            void onToggleFeature(f, false);
                          }}
                          disabled={isTogglingFeature}
                        />
                      ) : (
                        <Button
                          label="Enable"
                          variant="secondary"
                          onClick={() => {
                            void onToggleFeature(f, true);
                          }}
                          disabled={isTogglingFeature}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-row gap-8 pt-4">
              <div className="mx-2 w-1/3">
                <h2 className="text-md mb-4 font-bold">Data Sources:</h2>
                {dataSources.map((ds) => (
                  <div
                    key={ds.id}
                    className="border-material-200 my-4 rounded-lg border p-4"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="mb-2 text-lg font-semibold">
                        <Link
                          href={`/poke/${owner.sId}/data_sources/${ds.name}`}
                        >
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
                  </div>
                ))}
              </div>
              <div className="mx-2 w-1/3">
                <h2 className="text-md mb-4 font-bold">Assistants:</h2>
                {agentConfigurations.map((a) => (
                  <div
                    key={a.id}
                    className="border-material-200 my-4 rounded-lg border p-4"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="mb-2 text-lg font-semibold">
                        <Link href={`/poke/${owner.sId}/assistants/${a.sId}`}>
                          {a.name}
                        </Link>
                      </h3>
                      <div className="flex flex-col gap-2">
                        <Button
                          label="Archive"
                          variant="secondaryWarning"
                          onClick={() => {
                            void onAssistantArchive(a);
                          }}
                        />
                      </div>
                    </div>
                    <div className="mb-2 flex items-center justify-between text-sm text-gray-600">
                      [{a.scope}] {a.description}
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
                    {a.action && isTablesQueryConfiguration(a.action) && (
                      <div className="mb-2 ml-4 flex-col text-sm text-gray-600">
                        <div className="font-bold">Tables:</div>
                        {a.action.tables.map((t) => (
                          <div key={t.tableId}>
                            {t.workspaceId}/{t.dataSourceId}/{t.tableId}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="mb-2 flex flex-col text-sm text-gray-600">
                      <div className="font-bold">Instructions</div>
                      <div>
                        {(a.generation?.prompt || "").substring(0, 100)}...
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

function DustAppLogsModal({
  show,
  onClose,
  owner,
  registry,
}: {
  show: boolean;
  onClose: () => void;
  owner: WorkspaceType;
  registry: typeof DustProdActionRegistry;
}) {
  return (
    <Modal
      isOpen={show}
      onClose={onClose}
      hasChanged={false}
      title={"View Dust App Logs"}
    >
      <div className="flex flex-col gap-2 pt-4">
        {Object.entries(registry).map(
          ([
            action,
            {
              app: { appId, workspaceId: appWorkspaceid },
            },
          ]) => {
            const url = `https://dust.tt/w/${appWorkspaceid}/a/${appId}/runs?wIdTarget=${owner.sId}`;
            return (
              <div key={appId}>
                <div className="flex flex-row items-center space-x-2">
                  <div className="flex-1">
                    <h3
                      className="cursor-pointer text-lg font-semibold text-action-600"
                      onClick={() => {
                        window.open(url, "_blank", "noopener,noreferrer");
                      }}
                    >
                      {action}
                    </h3>
                  </div>
                </div>
              </div>
            );
          }
        )}
      </div>
    </Modal>
  );
}

export default WorkspacePage;
