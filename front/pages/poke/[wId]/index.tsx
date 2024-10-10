import { Button, DropdownMenu, Modal, Spinner } from "@dust-tt/sparkle";
import type {
  DataSourceType,
  WhitelistableFeature,
  WorkspaceDomain,
  WorkspaceSegmentationType,
} from "@dust-tt/types";
import type { WorkspaceType } from "@dust-tt/types";
import type { SubscriptionType } from "@dust-tt/types";
import { WHITELISTABLE_FEATURES } from "@dust-tt/types";
import { format } from "date-fns/format";
import { keyBy } from "lodash";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useContext } from "react";

import { AssistantsDataTable } from "@app/components/poke/assistants/table";
import { DataSourceViewsDataTable } from "@app/components/poke/data_source_views/table";
import { DataSourceDataTable } from "@app/components/poke/data_sources/table";
import { FeatureFlagsDataTable } from "@app/components/poke/features/table";
import { PluginList } from "@app/components/poke/plugins/PluginList";
import PokeNavbar from "@app/components/poke/PokeNavbar";
import { ActiveSubscriptionTable } from "@app/components/poke/subscriptions/table";
import { WorkspaceInfoTable } from "@app/components/poke/workspace/table";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { getDataSources } from "@app/lib/api/data_sources";
import {
  getWorkspaceCreationDate,
  getWorkspaceVerifiedDomain,
} from "@app/lib/api/workspace";
import { orderDatasourceByImportance } from "@app/lib/assistant";
import { useSubmitFunction } from "@app/lib/client/utils";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import { Plan, Subscription } from "@app/lib/models/plan";
import { FREE_NO_PLAN_CODE } from "@app/lib/plans/plan_codes";
import { renderSubscriptionFromModels } from "@app/lib/plans/renderers";
import { DustProdActionRegistry } from "@app/lib/registry";

export const getServerSideProps = withSuperUserAuthRequirements<{
  owner: WorkspaceType;
  activeSubscription: SubscriptionType;
  subscriptions: SubscriptionType[];
  dataSources: DataSourceType[];
  whitelistableFeatures: WhitelistableFeature[];
  registry: typeof DustProdActionRegistry;
  workspaceVerifiedDomain: WorkspaceDomain | null;
  worspaceCreationDay: string;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const activeSubscription = auth.subscription();

  if (!owner || !activeSubscription) {
    return {
      notFound: true,
    };
  }

  const [dataSources, subscriptionModels] = await Promise.all([
    getDataSources(auth, { includeEditedBy: true }),
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

  const workspaceVerifiedDomain = await getWorkspaceVerifiedDomain(owner);
  const worspaceCreationDate = await getWorkspaceCreationDate(owner.sId);

  return {
    props: {
      owner,
      activeSubscription,
      subscriptions,
      dataSources: orderDatasourceByImportance(
        dataSources.map((ds) => ds.toJSON())
      ),
      whitelistableFeatures:
        WHITELISTABLE_FEATURES as unknown as WhitelistableFeature[],
      registry: DustProdActionRegistry,
      workspaceVerifiedDomain,
      worspaceCreationDay: format(worspaceCreationDate, "yyyy-MM-dd"),
    },
  };
});

const WorkspacePage = ({
  owner,
  activeSubscription,
  subscriptions,
  dataSources,
  whitelistableFeatures,
  registry,
  workspaceVerifiedDomain,
  worspaceCreationDay,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const router = useRouter();

  const [showDustAppLogsModal, setShowDustAppLogsModal] = React.useState(false);
  const [showDeleteWorkspaceModal, setShowDeleteWorkspaceModal] =
    React.useState(false);

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
      <DeleteWorkspaceModal
        show={showDeleteWorkspaceModal}
        onClose={() => {
          setShowDeleteWorkspaceModal(false);
        }}
        owner={owner}
        subscription={activeSubscription}
        dataSources={dataSources}
      />

      <div className="min-h-screen bg-structure-50">
        <PokeNavbar />
        <div className="ml-8 p-6">
          <div className="flex justify-between gap-3">
            <div className="flex-grow">
              <span className="text-2xl font-bold">{owner.name}</span>
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
              <div>
                <a
                  className="cursor-pointer text-xs text-action-400"
                  onClick={() => {
                    setShowDeleteWorkspaceModal(true);
                  }}
                >
                  Delete workspace data (GDPR)
                </a>
              </div>
            </div>
            <div>
              <DropdownMenu>
                <DropdownMenu.Button>
                  <Button
                    type="select"
                    labelVisible={true}
                    label={`Segmentation: ${owner.segmentation ?? "none"}`}
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
          </div>

          <div className="flex-col justify-center">
            <div className="flex flex-col space-y-8">
              <div className="mt-4 flex flex-col space-x-3 lg:flex-row">
                <WorkspaceInfoTable
                  owner={owner}
                  workspaceVerifiedDomain={workspaceVerifiedDomain}
                  worspaceCreationDay={worspaceCreationDay}
                />
                <div className="flex flex-grow flex-col gap-4">
                  <PluginList
                    resourceType="workspaces"
                    workspaceResource={{
                      workspace: owner,
                      resourceId: owner.sId,
                    }}
                  />
                  <ActiveSubscriptionTable
                    owner={owner}
                    subscription={activeSubscription}
                    subscriptions={subscriptions}
                  />
                </div>
              </div>
              <DataSourceDataTable owner={owner} />
              <DataSourceViewsDataTable owner={owner} />
              <AssistantsDataTable owner={owner} />
              <FeatureFlagsDataTable
                owner={owner}
                whitelistableFeatures={whitelistableFeatures}
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
              app: { appId, workspaceId: appWorkspaceid, appVaultId },
            },
          ]) => {
            const url = `https://dust.tt/w/${appWorkspaceid}/vaults/${appVaultId}/apps/${appId}/runs?wIdTarget=${owner.sId}`;
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

function DeleteWorkspaceModal({
  show,
  onClose,
  owner,
  subscription,
  dataSources,
}: {
  show: boolean;
  onClose: () => void;
  owner: WorkspaceType;
  subscription: SubscriptionType;
  dataSources: DataSourceType[];
}) {
  const router = useRouter();
  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  const sendNotification = useContext(SendNotificationsContext);

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
        title: "Success!",
        description: "Workspace data request successfully sent.",
        type: "success",
      });
    } catch (e) {
      console.error(e);
      window.alert(`We could not delete the workspace:\n${e}`);
    }
    setIsLoading(false);
  });

  const workspaceHasManagedDataSources = dataSources.some(
    (ds) => !!ds.connectorProvider
  );

  return (
    <Modal
      isOpen={show}
      onClose={onClose}
      hasChanged={false}
      title="Delete Workspace Data (GDPR)"
    >
      <div className="flex flex-col gap-2 pt-4">
        <div className="flex flex-col gap-2 pt-4">
          <div>
            {dataSources.length > 0 && (
              <p className="text-warning mb-4 text-sm">
                Delete data sources before deleting the workspace.
              </p>
            )}
            {subscription.plan.code !== FREE_NO_PLAN_CODE && (
              <p className="text-warning mb-4 text-sm">
                Downgrade workspace before deleting its data.
              </p>
            )}
            {isLoading ? (
              <p className="text-warning mb-4 text-sm">
                Deleting workspace data...
                <Spinner />
              </p>
            ) : (
              <Button
                label="Delete the workspace"
                variant="secondaryWarning"
                onClick={onDeleteWorkspace}
                disabled={
                  subscription.plan.code !== FREE_NO_PLAN_CODE ||
                  workspaceHasManagedDataSources
                }
              />
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default WorkspacePage;
