import {
  Button,
  CloudArrowLeftRightIcon,
  CommandIcon,
  DataTable,
  Page,
  useSendNotification,
} from "@dust-tt/sparkle";
import type { CellContext } from "@tanstack/react-table";
import type { InferGetServerSidePropsType } from "next";

import { ConversationsNavigationProvider } from "@app/components/assistant/conversation/ConversationsNavigationProvider";
import AppLayout from "@app/components/sparkle/AppLayout";
import { augmentDataSourceWithConnectorDetails } from "@app/lib/api/data_sources";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { isManaged } from "@app/lib/data_sources";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { getPKCEConfig } from "@app/lib/utils/pkce";
import type {
  DataSourceType,
  DataSourceWithConnectorDetailsType,
  SubscriptionType,
  WorkspaceType,
} from "@app/types";
import {
  Err,
  isOAuthProvider,
  removeNulls,
  setupOAuthConnection,
} from "@app/types";

type DataSourceWithPersonalConnection = DataSourceWithConnectorDetailsType & {
  personalConnection: string | null;
};

type RowData = {
  dataSource: DataSourceWithPersonalConnection;
  onClick: () => void;
};

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  dataSources: DataSourceWithPersonalConnection[];
}>(async (_context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();
  const user = auth.getNonNullableUser();

  if (!owner || !subscription || !user) {
    return {
      notFound: true,
    };
  }

  const dataSources = await DataSourceResource.listByWorkspace(auth);

  // const oauthApi = new OAuthAPI(config.getOAuthAPIConfig(), logger);

  const augmentedDataSources = removeNulls(
    await concurrentExecutor(
      dataSources,
      async (dataSource: DataSourceResource) => {
        const ds = dataSource.toJSON();

        if (!isManaged(ds)) {
          return null;
        }

        // Only show salesforce for now
        if (ds.connectorProvider !== "salesforce") {
          return null;
        }

        const augmentedDataSource =
          await augmentDataSourceWithConnectorDetails(ds);
        if (!augmentedDataSource.connector) {
          return null;
        }
        const personalConnection = await dataSource.getPersonalConnection(auth);
        return {
          ...augmentedDataSource,
          personalConnection: personalConnection?.connectionId ?? null,
        };
      },
      { concurrency: 10 }
    )
  );

  if (augmentedDataSources.length === 0) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner,
      subscription,
      dataSources: augmentedDataSources,
    },
  };
});

export default function PersonalConnections({
  owner,
  subscription,
  dataSources,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const sendNotification = useSendNotification();

  const saveOAuthConnection = async (
    dataSource: DataSourceType,
    connectionId: string
  ) => {
    try {
      const response = await fetch(
        `/api/w/${owner.sId}/labs/personal_connections`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            connectionId,
            dataSourceId: dataSource.sId,
          }),
        }
      );
      if (!response.ok) {
        sendNotification({
          type: "error",
          title: "Failed to connect provider",
          description:
            "Could not connect to your salesforce account. Please try again.",
        });
      } else {
        sendNotification({
          type: "success",
          title: "Provider connected",
          description:
            "Your salesforce account has been connected successfully.",
        });
      }
      return response;
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Failed to connect provider",
        description:
          "Unexpected error trying to connect to your transcripts provider. Please try again. Error: " +
          error,
      });
    }
  };

  const deleteOAuthConnection = async (dataSource: DataSourceType) => {
    try {
      const response = await fetch(
        `/api/w/${owner.sId}/labs/personal_connections/${dataSource.sId}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      if (!response.ok) {
        sendNotification({
          type: "error",
          title: "Failed to connect provider",
          description:
            "Could not connect to your salesforce account. Please try again.",
        });
      } else {
        sendNotification({
          type: "success",
          title: "Provider connected",
          description:
            "Your salesforce account has been connected successfully.",
        });
      }
      return response;
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Failed to connect provider",
        description:
          "Unexpected error trying to connect to your transcripts provider. Please try again. Error: " +
          error,
      });
    }
  };

  const handleConnectionCreate = async (dataSource: DataSourceType) => {
    const provider = dataSource.connectorProvider;
    const { code_verifier, code_challenge } = await getPKCEConfig();
    if (isOAuthProvider(provider)) {
      const cRes = await setupOAuthConnection({
        dustClientFacingUrl: `${process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL}`,
        owner,
        provider,
        useCase: "personal_connection",
        extraConfig: {
          code_verifier,
          code_challenge,
        },
      });

      if (cRes.isErr()) {
        sendNotification({
          type: "error",
          title: "Failed to connect Salesforce",
          description: cRes.error.message,
        });
        return;
      }

      await saveOAuthConnection(dataSource, cRes.value.connection_id);
    } else {
      return new Err(new Error(`Unknown provider ${provider}`));
    }
  };

  const columns = [
    {
      id: "name",
      header: "Name",
      accessorFn: (row: RowData) =>
        CONNECTOR_CONFIGURATIONS[row.dataSource.connectorProvider].name,
    },
    {
      id: "actions",
      accessorKey: "dataSource",
      header: "",
      cell: (info: CellContext<RowData, DataSourceWithPersonalConnection>) => {
        const dataSource = info.getValue();
        const isConnected = dataSource.personalConnection !== null;

        return (
          <DataTable.CellContent>
            <div key={dataSource.sId}>
              {!isConnected && (
                <Button
                  label={`Connect ${dataSource.connectorProvider}`}
                  variant="outline"
                  className="flex-grow"
                  size="sm"
                  icon={CloudArrowLeftRightIcon}
                  onClick={async () => {
                    await handleConnectionCreate(dataSource);
                  }}
                />
              )}
              {isConnected && (
                <Button
                  label="Disconnect"
                  variant="outline"
                  size="sm"
                  icon={CloudArrowLeftRightIcon}
                  onClick={async () => {
                    await deleteOAuthConnection(dataSource);
                  }}
                />
              )}
            </div>
          </DataTable.CellContent>
        );
      },
      meta: {
        className: "w-56",
      },
    },
  ];

  const rows: RowData[] = dataSources.map((dataSource) => {
    return {
      dataSource,
      onClick: () => {},
    };
  });

  return (
    <ConversationsNavigationProvider>
      <AppLayout
        subscription={subscription}
        owner={owner}
        pageTitle="Dust - Personal connections"
      >
        <Page.Vertical gap="xl" align="stretch">
          <Page.Header
            title="Personal connecttion"
            icon={CommandIcon}
            description="Connect your personal accounts on data sources."
          />
          <DataTable data={rows} columns={columns} className="pb-4" />
        </Page.Vertical>
      </AppLayout>
    </ConversationsNavigationProvider>
  );
}
