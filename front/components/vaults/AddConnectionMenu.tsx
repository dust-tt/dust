import {
  Button,
  CloudArrowLeftRightIcon,
  Dialog,
  DropdownMenu,
} from "@dust-tt/sparkle";
import type {
  ConnectorProvider,
  ConnectorType,
  DataSourceType,
  DataSourceWithConnectorDetailsType,
  LightWorkspaceType,
  PlanType,
  Result,
  WorkspaceType,
} from "@dust-tt/types";
import {
  Err,
  isConnectorProviderAllowed,
  isOAuthProvider,
  Ok,
  setupOAuthConnection,
} from "@dust-tt/types";
import { useRouter } from "next/router";
import { useContext, useState } from "react";

import { CreateConnectionConfirmationModal } from "@app/components/data_source/CreateConnectionConfirmationModal";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import {
  CONNECTOR_CONFIGURATIONS,
  getConnectorProviderLogoWithFallback,
  isConnectionIdRequiredForProvider,
  isConnectorProviderAllowedForPlan,
} from "@app/lib/connector_providers";
import type { PostManagedDataSourceRequestBody } from "@app/pages/api/w/[wId]/data_sources/managed";

export type DataSourceIntegration = {
  connectorProvider: ConnectorProvider;
  setupWithSuffix: string | null;
};

type AddConnectionMenuProps = {
  owner: WorkspaceType;
  plan: PlanType;
  existingDataSources: DataSourceWithConnectorDetailsType[];
  dustClientFacingUrl: string;
  setIsProviderLoading: (provider: ConnectorProvider, value: boolean) => void;
  onCreated(dataSource: DataSourceType): void;
  integrations: DataSourceIntegration[];
};

export async function setupConnection({
  dustClientFacingUrl,
  owner,
  provider,
}: {
  dustClientFacingUrl: string;
  owner: LightWorkspaceType;
  provider: ConnectorProvider;
}): Promise<Result<string, Error>> {
  let connectionId: string;

  if (isOAuthProvider(provider)) {
    // OAuth flow
    const cRes = await setupOAuthConnection({
      dustClientFacingUrl,
      owner,
      provider,
      useCase: "connection",
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
  dustClientFacingUrl,
  setIsProviderLoading,
  onCreated,
  integrations,
}: AddConnectionMenuProps) => {
  const sendNotification = useContext(SendNotificationsContext);
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

  const availableIntegrations = integrations.filter(
    (i) =>
      isConnectorProviderAllowedForPlan(plan, i.connectorProvider) &&
      isConnectionIdRequiredForProvider(i.connectorProvider)
  );

  const handleEnableManagedDataSource = async (
    provider: ConnectorProvider,
    suffix: string | null
  ) => {
    try {
      const connectionIdRes = await setupConnection({
        dustClientFacingUrl,
        owner,
        provider,
      });
      if (connectionIdRes.isErr()) {
        throw connectionIdRes.error;
      }

      setShowConfirmConnection((prev) => ({
        isOpen: false,
        integration: prev.integration,
      }));
      setIsProviderLoading(provider, true);

      const res = await fetch(
        suffix
          ? `/api/w/${
              owner.sId
            }/data_sources/managed?suffix=${encodeURIComponent(suffix)}`
          : `/api/w/${owner.sId}/data_sources/managed`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            provider,
            connectionId: connectionIdRes.value,
            name: undefined,
            configuration: null,
          } satisfies PostManagedDataSourceRequestBody),
        }
      );

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

  const handleConnectionClick = (integration: DataSourceIntegration) => {
    const configuration =
      CONNECTOR_CONFIGURATIONS[integration.connectorProvider];

    const isBuilt =
      configuration.status === "built" ||
      (configuration.status === "rolling_out" &&
        !!configuration.rollingOutFlag &&
        owner.flags.includes(configuration.rollingOutFlag));
    const isProviderAllowed = isConnectorProviderAllowed(
      configuration.connectorProvider,
      plan.limits.connections
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

        {showConfirmConnection.integration && (
          <CreateConnectionConfirmationModal
            owner={owner}
            connectorProviderConfiguration={
              CONNECTOR_CONFIGURATIONS[
                showConfirmConnection.integration.connectorProvider
              ]
            }
            isOpen={showConfirmConnection.isOpen}
            onClose={() =>
              setShowConfirmConnection((prev) => ({
                isOpen: false,
                integration: prev.integration,
              }))
            }
            onConfirm={async () => {
              if (showConfirmConnection.integration) {
                await handleEnableManagedDataSource(
                  showConfirmConnection.integration.connectorProvider,
                  showConfirmConnection.integration.setupWithSuffix
                );
              }
            }}
          />
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
          <DropdownMenu.Button>
            <Button
              label="Add Connections"
              variant="primary"
              icon={CloudArrowLeftRightIcon}
              size="sm"
            />
          </DropdownMenu.Button>
          <DropdownMenu.Items width={180}>
            {availableIntegrations.map((i) => (
              <DropdownMenu.Item
                key={i.connectorProvider}
                label={CONNECTOR_CONFIGURATIONS[i.connectorProvider].name}
                icon={getConnectorProviderLogoWithFallback(i.connectorProvider)}
                onClick={() => {
                  handleConnectionClick(i);
                }}
              />
            ))}
          </DropdownMenu.Items>
        </DropdownMenu>
      </>
    )
  );
};
