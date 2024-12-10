import {
  Button,
  CloudArrowLeftRightIcon,
  Dialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import { useSendNotification } from "@dust-tt/sparkle";
import type {
  ConnectorProvider,
  ConnectorType,
  DataSourceType,
  DataSourceWithConnectorDetailsType,
  LightWorkspaceType,
  PlanType,
  Result,
  SpaceType,
  WorkspaceType,
} from "@dust-tt/types";
import { Err, isOAuthProvider, Ok, setupOAuthConnection } from "@dust-tt/types";
import { useRouter } from "next/router";
import { useState } from "react";

import { CreateConnectionConfirmationModal } from "@app/components/data_source/CreateConnectionConfirmationModal";
import { CreateOrUpdateConnectionSnowflakeModal } from "@app/components/data_source/CreateOrUpdateConnectionSnowflakeModal";
import {
  CONNECTOR_CONFIGURATIONS,
  getConnectorProviderLogoWithFallback,
  isConnectionIdRequiredForProvider,
  isConnectorProviderAllowedForPlan,
} from "@app/lib/connector_providers";
import { useSystemSpace } from "@app/lib/swr/spaces";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type { PostDataSourceRequestBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/data_sources";

export type DataSourceIntegration = {
  connectorProvider: ConnectorProvider;
  setupWithSuffix: string | null;
};

type AddConnectionMenuProps = {
  owner: WorkspaceType;
  plan: PlanType;
  existingDataSources: DataSourceWithConnectorDetailsType[];
  setIsProviderLoading: (provider: ConnectorProvider, value: boolean) => void;
  onCreated(dataSource: DataSourceType): void;
  integrations: DataSourceIntegration[];
};

export async function setupConnection({
  owner,
  provider,
  extraConfig,
}: {
  owner: LightWorkspaceType;
  provider: ConnectorProvider;
  extraConfig: Record<string, string>;
}): Promise<Result<string, Error>> {
  let connectionId: string;

  if (isOAuthProvider(provider)) {
    // OAuth flow
    const cRes = await setupOAuthConnection({
      dustClientFacingUrl: `${process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL}`,
      owner,
      provider,
      useCase: "connection",
      extraConfig,
    });
    if (!cRes.isOk()) {
      return cRes;
    }
    connectionId = cRes.value.connection_id;
  } else {
    return new Err(new Error(`Unknown provider ${provider}`));
  }

  return new Ok(connectionId);
}

export const AddConnectionMenu = ({
  owner,
  plan,
  existingDataSources,
  setIsProviderLoading,
  onCreated,
  integrations,
}: AddConnectionMenuProps) => {
  const sendNotification = useSendNotification();
  const [showUpgradePopup, setShowUpgradePopup] = useState<boolean>(false);
  const [showPreviewPopupForProvider, setShowPreviewPopupForProvider] =
    useState<{ isOpen: boolean; connector: ConnectorProvider | null }>({
      isOpen: false,
      connector: null,
    });
  const [showConfirmConnection, setShowConfirmConnection] = useState<{
    isOpen: boolean;
    integration: DataSourceIntegration | null;
  }>({
    isOpen: false,
    integration: null,
  });

  const router = useRouter();
  const { featureFlags } = useFeatureFlags({ workspaceId: owner.sId });

  const availableIntegrations = integrations.filter(
    (i) =>
      isConnectorProviderAllowedForPlan(plan, i.connectorProvider) &&
      isConnectionIdRequiredForProvider(i.connectorProvider)
  );

  const { systemSpace } = useSystemSpace({
    workspaceId: owner.sId,
  });

  if (!systemSpace) {
    return null;
  }

  const postDataSource = async ({
    owner,
    systemSpace,
    provider,
    connectionId,
    suffix,
  }: {
    owner: WorkspaceType;
    systemSpace: SpaceType;
    provider: ConnectorProvider;
    connectionId: string;
    suffix: string | null;
  }): Promise<Response> => {
    const res = await fetch(
      suffix
        ? `/api/w/${
            owner.sId
          }/spaces/${systemSpace.sId}/data_sources?suffix=${encodeURIComponent(suffix)}`
        : `/api/w/${owner.sId}/spaces/${systemSpace.sId}/data_sources`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider,
          connectionId,
          name: undefined,
          configuration: null,
        } satisfies PostDataSourceRequestBody),
      }
    );
    return res;
  };

  const handleOauthProviderManagedDataSource = async (
    provider: ConnectorProvider,
    suffix: string | null,
    extraConfig: Record<string, string>
  ) => {
    try {
      const connectionIdRes = await setupConnection({
        owner,
        provider,
        extraConfig,
      });
      if (connectionIdRes.isErr()) {
        throw connectionIdRes.error;
      }

      setShowConfirmConnection((prev) => ({
        isOpen: false,
        integration: prev.integration,
      }));
      setIsProviderLoading(provider, true);

      const res = await postDataSource({
        owner,
        systemSpace,
        provider,
        connectionId: connectionIdRes.value,
        suffix,
      });

      if (res.ok) {
        const createdManagedDataSource: {
          dataSource: DataSourceType;
          connector: ConnectorType;
        } = await res.json();
        onCreated(createdManagedDataSource.dataSource);
      } else {
        const responseText = await res.text();
        sendNotification({
          type: "error",
          title: `Failed to enable connection (${provider})`,
          description: `Got: ${responseText}`,
        });
      }
    } catch (e) {
      setShowConfirmConnection((prev) => ({
        isOpen: false,
        integration: prev.integration,
      }));
      sendNotification({
        type: "error",
        title: `Failed to enable connection (${provider})`,
      });
    } finally {
      setIsProviderLoading(provider, false);
    }
  };

  const handleCredentialProviderManagedDataSource = async ({
    connectionId,
    provider,
    suffix,
  }: {
    connectionId: string;
    provider: ConnectorProvider;
    suffix: string | null;
  }) => {
    return postDataSource({
      owner,
      systemSpace,
      provider,
      connectionId,
      suffix,
    });
  };

  const handleConnectionClick = (integration: DataSourceIntegration) => {
    const configuration =
      CONNECTOR_CONFIGURATIONS[integration.connectorProvider];

    const isBuilt =
      configuration.status === "built" ||
      (configuration.status === "rolling_out" &&
        !!configuration.rollingOutFlag &&
        featureFlags.includes(configuration.rollingOutFlag));
    const isProviderAllowed = isConnectorProviderAllowedForPlan(
      plan,
      configuration.connectorProvider
    );

    const existingDataSource = existingDataSources.find(
      (view) => view.connectorProvider === integration.connectorProvider
    );
    if (
      !existingDataSource ||
      !existingDataSource.connector ||
      integration.setupWithSuffix
    ) {
      if (!isProviderAllowed) {
        setShowUpgradePopup(true);
      } else {
        if (isBuilt) {
          setShowConfirmConnection({
            isOpen: true,
            integration,
          });
        } else {
          setShowPreviewPopupForProvider({
            isOpen: true,
            connector: integration.connectorProvider,
          });
        }
      }
    }
  };

  const { integration, isOpen } = showConfirmConnection || {};
  const connectorProvider = integration?.connectorProvider;

  return (
    availableIntegrations.length > 0 && (
      <>
        <Dialog
          isOpen={showUpgradePopup}
          onCancel={() => setShowUpgradePopup(false)}
          title={`${plan.name} plan`}
          onValidate={() => {
            void router.push(`/w/${owner.sId}/subscription`);
          }}
        >
          <p>Unlock this managed data source by upgrading your plan.</p>
        </Dialog>

        {connectorProvider === "snowflake" ? (
          <CreateOrUpdateConnectionSnowflakeModal
            owner={owner}
            connectorProviderConfiguration={
              CONNECTOR_CONFIGURATIONS[connectorProvider]
            }
            isOpen={isOpen}
            onClose={() =>
              setShowConfirmConnection((prev) => ({
                isOpen: false,
                integration: prev.integration,
              }))
            }
            createDatasource={(
              args: Omit<
                Parameters<typeof handleCredentialProviderManagedDataSource>[0],
                "suffix"
              >
            ) =>
              handleCredentialProviderManagedDataSource({
                ...args,
                suffix: integration?.setupWithSuffix ?? null,
              })
            }
            onSuccess={onCreated}
          />
        ) : (
          connectorProvider && (
            <CreateConnectionConfirmationModal
              connectorProviderConfiguration={
                CONNECTOR_CONFIGURATIONS[connectorProvider]
              }
              isOpen={isOpen}
              onClose={() =>
                setShowConfirmConnection((prev) => ({
                  isOpen: false,
                  integration: prev.integration,
                }))
              }
              onConfirm={(extraConfig: Record<string, string>) => {
                if (showConfirmConnection.integration) {
                  void handleOauthProviderManagedDataSource(
                    connectorProvider,
                    integration.setupWithSuffix,
                    extraConfig
                  );
                }
              }}
            />
          )
        )}
        <Dialog
          isOpen={showPreviewPopupForProvider.isOpen}
          title="Coming Soon!"
          validateLabel="Contact us"
          onValidate={() => {
            window.open(
              `mailto:support@dust.tt?subject=Early access to the ${showPreviewPopupForProvider.connector} connection`
            );
          }}
          onCancel={() => {
            setShowPreviewPopupForProvider((prev) => ({
              isOpen: false,
              connector: prev.connector,
            }));
          }}
        >
          Please email us at support@dust.tt for early access.
        </Dialog>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              label="Add Connections"
              variant="primary"
              icon={CloudArrowLeftRightIcon}
              size="sm"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {availableIntegrations.map((i) => (
              <DropdownMenuItem
                key={i.connectorProvider}
                label={CONNECTOR_CONFIGURATIONS[i.connectorProvider].name}
                icon={getConnectorProviderLogoWithFallback(i.connectorProvider)}
                onClick={() => {
                  handleConnectionClick(i);
                }}
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </>
    )
  );
};
