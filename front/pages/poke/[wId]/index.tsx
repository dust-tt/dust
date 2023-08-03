import { Button, Tooltip } from "@dust-tt/sparkle";
import { JsonViewer } from "@textea/json-viewer";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import React from "react";

import PokeNavbar from "@app/components/poke/PokeNavbar";
import { getDataSources } from "@app/lib/api/data_sources";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { ConnectorsAPI } from "@app/lib/connectors_api";
import { CoreAPI } from "@app/lib/core_api";
import { timeAgoFrom } from "@app/lib/utils";
import { DataSourceType } from "@app/types/data_source";
import { UserType, WorkspaceType } from "@app/types/user";

export const getServerSideProps: GetServerSideProps<{
  user: UserType;
  workspace: WorkspaceType;
  dataSources: DataSourceType[];
  documentCounts: Record<string, number>;
  dataSourcesSynchronizedAgo: Record<string, string>;
}> = async (context) => {
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);
  const wId = context.params?.wId;

  if (!user) {
    return {
      redirect: {
        destination: "/login",
        permanent: false,
      },
    };
  }

  if (!user.isDustSuperUser) {
    return {
      notFound: true,
    };
  }

  if (!wId || typeof wId !== "string") {
    return {
      notFound: true,
    };
  }

  const auth = await Authenticator.fromSession(session, wId);
  const workspace = auth.workspace();

  if (!workspace) {
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

  const docCountByDsName: Record<string, number> = {};

  await Promise.all(
    dataSources.map(async (ds) => {
      const res = await CoreAPI.getDataSourceDocuments({
        projectId: ds.dustAPIProjectId,
        dataSourceName: ds.name,
        limit: 0,
        offset: 0,
      });
      if (res.isErr()) {
        throw res.error;
      }
      docCountByDsName[ds.name] = res.value.total;
    })
  );

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

  return {
    props: {
      user,
      workspace,
      dataSources,
      documentCounts: docCountByDsName,
      dataSourcesSynchronizedAgo: synchronizedAgoByDsName,
    },
  };
};

const WorkspacePage = ({
  workspace,
  dataSources,
  documentCounts,
  dataSourcesSynchronizedAgo,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const router = useRouter();

  const onUpgrade = async () => {
    if (!window.confirm("Are you sure you want to upgrade this workspace?")) {
      return;
    }
    try {
      const r = await fetch(`/api/poke/workspaces/${workspace.sId}/upgrade`, {
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
  };

  const onDowngrade = async () => {
    if (!window.confirm("Are you sure you want to downgrade this workspace?")) {
      return;
    }
    try {
      const r = await fetch(`/api/poke/workspaces/${workspace.sId}/downgrade`, {
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
  };

  const onDataSourcesDelete = async (dataSourceName: string) => {
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
        `/api/poke/workspaces/${workspace.sId}/data_sources/${dataSourceName}`,
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
  };

  const workspaceHasManagedDataSources = dataSources.some(
    (ds) => !!ds.connectorProvider
  );

  const isFullyUpgraded =
    workspace.plan?.limits.dataSources.count === -1 &&
    workspace.plan?.limits.dataSources.documents.count === -1 &&
    workspace.plan?.limits.dataSources.documents.sizeMb === -1 &&
    workspace.plan?.limits.dataSources.managed === true;

  return (
    <div className="min-h-screen bg-structure-50">
      <PokeNavbar />
      <div className="flex-grow p-6">
        <h1 className="mb-8 text-2xl font-bold">{workspace.name}</h1>
        <div className="flex justify-center">
          <div className="mx-2 w-1/3">
            <h2 className="text-md mb-4 font-bold">Plan:</h2>
            {isFullyUpgraded ? (
              <p className="mb-4 text-green-600">
                This workspace is fully upgraded.
              </p>
            ) : (
              <p className="mb-4 text-green-600">
                This workspace is not upgraded.
              </p>
            )}
            <JsonViewer value={workspace.plan} rootName={false} />
            <div>
              <div className="mt-4 flex-row">
                <Button
                  label="Downgrade"
                  type="secondaryWarning"
                  onClick={onDowngrade}
                  disabled={!isFullyUpgraded || workspaceHasManagedDataSources}
                />
                <Tooltip
                  label={"delete managed data sources first"}
                  position="below"
                >
                  <Button
                    label="Upgrade"
                    type="secondary"
                    onClick={onUpgrade}
                    disabled={isFullyUpgraded}
                  />
                </Tooltip>
              </div>
            </div>
            {isFullyUpgraded && workspaceHasManagedDataSources && (
              <span className="mx-2 w-1/3">
                <p className="mb-4 text-sm text-warning ">
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
                className="my-4 rounded-lg border-2 border-gray-200 p-4 shadow-lg"
              >
                <div className="flex items-center justify-between">
                  <h3 className="mb-2 text-lg font-semibold">{ds.name}</h3>
                  <Button
                    label="Delete"
                    type="secondaryWarning"
                    onClick={() => onDataSourcesDelete(ds.name)}
                  />
                </div>
                <p className="mb-2 text-sm text-gray-600">
                  {ds.connectorProvider ? "Managed - " : "Non-managed - "}{" "}
                  <span className="font-medium">
                    {documentCounts[ds.name] ?? 0}
                  </span>{" "}
                  documents
                </p>
                {dataSourcesSynchronizedAgo[ds.name] && (
                  <p className="mb-2 text-sm text-gray-600">
                    Synchronized {dataSourcesSynchronizedAgo[ds.name]} ago
                  </p>
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
