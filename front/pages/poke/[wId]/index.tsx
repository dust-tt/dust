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
  WhitelistableFeature,
  WorkspaceSegmentationType,
} from "@dust-tt/types";
import type { WorkspaceType } from "@dust-tt/types";
import type { PlanType, SubscriptionType } from "@dust-tt/types";
import { DustProdActionRegistry, WHITELISTABLE_FEATURES } from "@dust-tt/types";
import { JsonViewer } from "@textea/json-viewer";
import { keyBy } from "lodash";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useContext } from "react";

import { AssistantsDataTable } from "@app/components/poke/assistants/table";
import { DataSourceDataTable } from "@app/components/poke/data_sources/table";
import { FeatureFlagsDataTable } from "@app/components/poke/features/table";
import PokeNavbar from "@app/components/poke/PokeNavbar";
import { SubscriptionsDataTable } from "@app/components/poke/subscriptions/table";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { getAgentConfigurations } from "@app/lib/api/assistant/configuration";
import { getDataSources } from "@app/lib/api/data_sources";
import {
  GLOBAL_AGENTS_SID,
  orderDatasourceByImportance,
} from "@app/lib/assistant";
import { useSubmitFunction } from "@app/lib/client/utils";
import { isDevelopment } from "@app/lib/development";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import { Plan, Subscription } from "@app/lib/models";
import { FREE_NO_PLAN_CODE } from "@app/lib/plans/plan_codes";
import { renderSubscriptionFromModels } from "@app/lib/plans/subscription";
import { usePokePlans } from "@app/lib/swr";

export const getServerSideProps = withSuperUserAuthRequirements<{
  owner: WorkspaceType;
  activeSubscription: SubscriptionType;
  subscriptions: SubscriptionType[];
  dataSources: DataSourceType[];
  agentConfigurations: AgentConfigurationType[];
  whitelistableFeatures: WhitelistableFeature[];
  registry: typeof DustProdActionRegistry;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const activeSubscription = auth.subscription();

  if (!owner || !activeSubscription) {
    return {
      notFound: true,
    };
  }

  // TODO(2024-02-28 flav) Stop fetching agent configurations on the server side.
  const [dataSources, agentConfigurations, subscriptionModels] =
    await Promise.all([
      getDataSources(auth, { includeEditedBy: true }),
      (async () => {
        return (
          await getAgentConfigurations({
            auth,
            agentsGetView: "admin_internal",
            variant: "full",
          })
        ).filter(
          (a) =>
            !Object.values(GLOBAL_AGENTS_SID).includes(
              a.sId as GLOBAL_AGENTS_SID
            )
        );
      })(),
      Subscription.findAll({
        where: { workspaceId: owner.id },
      }),
    ]);

  const plans = keyBy(
    await Plan.findAll({
      where: {
        id: subscriptionModels.map((s) => s.planId),
      },
    }),
    "id"
  );

  const subscriptions = subscriptionModels.map((s) =>
    renderSubscriptionFromModels({
      plan: plans[s.planId],
      activeSubscription: s,
    })
  );

  return {
    props: {
      owner,
      activeSubscription,
      subscriptions,
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
  activeSubscription,
  subscriptions,
  dataSources,
  agentConfigurations,
  whitelistableFeatures,
  registry,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const router = useRouter();

  const sendNotification = useContext(SendNotificationsContext);
  const [isLoading, setIsLoading] = React.useState<boolean>(false);

  const { plans } = usePokePlans();

  const [showDustAppLogsModal, setShowDustAppLogsModal] = React.useState(false);

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
            {activeSubscription.stripeSubscriptionId && (
              <div>
                <Link
                  href={
                    isDevelopment()
                      ? `https://dashboard.stripe.com/test/subscriptions/${activeSubscription.stripeSubscriptionId}`
                      : `https://dashboard.stripe.com/subscriptions/${activeSubscription.stripeSubscriptionId}`
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
              <JsonViewer value={activeSubscription} rootName={false} />
              <div className="flex flex-col gap-8">
                {plans && (
                  <div className="pt-8">
                    <Collapsible>
                      <Collapsible.Button label="Manage plan" />
                      <Collapsible.Panel>
                        <div className="flex flex-col gap-2 pt-4">
                          {plans
                            .filter((p) => p.billingType === "free")
                            .map((p) => {
                              return (
                                <div key={p.code}>
                                  <Button
                                    variant="secondary"
                                    label={`Upgrade to free plan: ${p.code}`}
                                    onClick={() => onUpgradeToPlan(p)}
                                    disabled={
                                      activeSubscription.plan.code === p.code
                                    }
                                  />
                                </div>
                              );
                            })}
                          <div>
                            <Button
                              label="Downgrade to NO PLAN"
                              variant="secondaryWarning"
                              onClick={onDowngrade}
                              disabled={
                                activeSubscription.plan.code ===
                                  FREE_NO_PLAN_CODE ||
                                activeSubscription.stripeSubscriptionId !==
                                  null ||
                                workspaceHasManagedDataSources
                              }
                            />
                          </div>
                        </div>
                      </Collapsible.Panel>
                    </Collapsible>
                  </div>
                )}
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
                          {activeSubscription.plan.code !==
                            FREE_NO_PLAN_CODE && (
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
                                activeSubscription.plan.code !==
                                  FREE_NO_PLAN_CODE ||
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
              {activeSubscription.plan.code !== FREE_NO_PLAN_CODE &&
                workspaceHasManagedDataSources && (
                  <div className="pl-2 pt-4">
                    <p className="text-warning mb-4 text-sm">
                      Delete managed data sources before downgrading.
                    </p>
                  </div>
                )}
            </div>

            <div className="flex flex-col space-y-8 pt-4">
              <SubscriptionsDataTable
                owner={owner}
                subscriptions={subscriptions}
              />
              <FeatureFlagsDataTable
                owner={owner}
                whitelistableFeatures={whitelistableFeatures}
              />
              <DataSourceDataTable
                owner={owner}
                dataSources={dataSources}
                agentConfigurations={agentConfigurations}
              />
              <AssistantsDataTable
                owner={owner}
                agentConfigurations={agentConfigurations}
              />
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
