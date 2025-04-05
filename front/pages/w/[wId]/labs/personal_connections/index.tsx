import {
  Button,
  CloudArrowLeftRightIcon,
  Page,
  useSendNotification,
} from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

import { ConversationsNavigationProvider } from "@app/components/assistant/conversation/ConversationsNavigationProvider";
import { AssistantSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import AppLayout from "@app/components/sparkle/AppLayout";
import { default as config } from "@app/lib/api/config";
import { augmentDataSourceWithConnectorDetails } from "@app/lib/api/data_sources";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type {
  DataSourceType,
  DataSourceWithConnectorDetailsType,
  SubscriptionType,
  WithConnector,
  WorkspaceType,
} from "@app/types";
import { OAuthAPI, removeNulls, setupOAuthConnection } from "@app/types";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  dataSources: (DataSourceWithConnectorDetailsType & {
    personalConnection: string | undefined;
    oauthExtraConfig: {
      copy_related_credential_from_connection_id: string;
      client_id: string;
      instance_url: string;
    };
  })[];
}>(async (_context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();
  const user = auth.getNonNullableUser();

  if (!owner || !subscription || !user) {
    return {
      notFound: true,
    };
  }

  const dataSources = await DataSourceResource.listByConnectorProvider(
    auth,
    "salesforce"
  );

  const oauthApi = new OAuthAPI(config.getOAuthAPIConfig(), logger);

  const augmentedDataSources = removeNulls(
    await concurrentExecutor(
      dataSources,
      async (dataSource: DataSourceResource) => {
        const ds = dataSource.toJSON() as DataSourceType &
          WithConnector & { connectorProvider: "salesforce" };
        const augmentedDataSource =
          await augmentDataSourceWithConnectorDetails(ds);
        if (!augmentedDataSource.connector) {
          return null;
        }
        const personalConnection = await user.getMetadata(
          `connection_id_${ds.sId}`
        );
        const connectionRes = await oauthApi.getAccessToken({
          provider: ds.connectorProvider,
          connectionId: augmentedDataSource.connector.connectionId,
        });
        if (connectionRes.isErr()) {
          return null;
        }

        const clientId = connectionRes.value.connection.metadata
          .client_id as string;
        if (!clientId) {
          return null;
        }

        return {
          ...augmentedDataSource,
          personalConnection: personalConnection?.value ?? "",
          oauthExtraConfig: {
            copy_related_credential_from_connection_id:
              connectionRes.value.connection.connection_id,
            client_id: connectionRes.value.connection.metadata
              .client_id as string,
            instance_url: connectionRes.value.connection.metadata
              .instance_url as string,
          },
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

export default function SalesforceIndex({
  owner,
  subscription,
  dataSources,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const sendNotification = useSendNotification();
  const dataSource = dataSources[0];
  console.log(dataSource);
  const isConnected =
    dataSource.personalConnection && dataSource.personalConnection.length > 0;
  const [extraConfig, setExtraConfig] = useState<Record<string, string>>(
    dataSource.oauthExtraConfig
  );
  const router = useRouter();
  const [pkceLoadingStatus, setPkceLoadingStatus] = useState<
    "idle" | "loading" | "error"
  >("idle");

  useEffect(() => {
    async function generatePKCE() {
      if (!extraConfig.code_verifier && pkceLoadingStatus === "idle") {
        setPkceLoadingStatus("loading");
        try {
          const response = await fetch(
            `/api/oauth/pkce?domain=${extraConfig.instance_url}`,
            {
              method: "GET",
              headers: {
                "Content-Type": "application/json",
              },
            }
          );
          if (!response.ok) {
            throw new Error("Failed to generate PKCE challenge");
          }
          const { code_verifier, code_challenge } = await response.json();
          setExtraConfig((extraConfig) => ({
            ...extraConfig,
            code_verifier,
            code_challenge,
          }));
          setPkceLoadingStatus("idle");
        } catch (error) {
          console.error("Error generating PKCE challenge:", error);
          setPkceLoadingStatus("error");
        }
      }
    }

    void generatePKCE();
  }, [extraConfig.instance_url, extraConfig.code_verifier, pkceLoadingStatus]);

  const saveOAuthConnection = async (connectionId: string) => {
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

  const handleConnectionCreate = async () => {
    const cRes = await setupOAuthConnection({
      dustClientFacingUrl: `${process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL}`,
      owner,
      provider: "salesforce",
      useCase: "connection",
      extraConfig,
    });

    if (cRes.isErr()) {
      sendNotification({
        type: "error",
        title: "Failed to connect Salesforce",
        description: cRes.error.message,
      });
      return;
    }

    await saveOAuthConnection(cRes.value.connection_id);
  };

  return (
    <ConversationsNavigationProvider>
      <AppLayout
        subscription={subscription}
        owner={owner}
        pageTitle="Dust - Salesforce personal account"
        navChildren={<AssistantSidebarMenu owner={owner} />}
      >
        <Page>
          <Page.P>Connect to your Salesforce account</Page.P>
          <div>
            {!isConnected && (
              <Button
                label={isConnected ? "Connected" : "Connect Salesforce"}
                disabled={pkceLoadingStatus !== "idle"}
                size="sm"
                icon={CloudArrowLeftRightIcon}
                onClick={async () => {
                  await handleConnectionCreate();
                  router.reload();
                }}
              />
            )}
            {isConnected && (
              <Button
                label="Disconnect Salesforce"
                size="sm"
                icon={CloudArrowLeftRightIcon}
                onClick={async () => {
                  await saveOAuthConnection("");
                  router.reload();
                }}
              />
            )}
          </div>
        </Page>
      </AppLayout>
    </ConversationsNavigationProvider>
  );
}
