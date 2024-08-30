import { Button, Dialog, DropdownMenu, PlusIcon } from "@dust-tt/sparkle";
import type {
  ConnectorProvider,
  ConnectorType,
  DataSourceType,
  DataSourceWithConnectorDetailsType,
  PlanType,
  WorkspaceType,
} from "@dust-tt/types";
import {
  CONNECTOR_PROVIDERS,
  isConnectorProviderAllowed,
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
import { setupConnection } from "@app/pages/w/[wId]/builder/data-sources/managed";

const REDIRECT_TO_EDIT_PERMISSIONS = [
  "confluence",
  "google_drive",
  "microsoft",
  "slack",
  "intercom",
];

type AddConnectionMenuProps = {
  owner: WorkspaceType;
  plan: PlanType;
  existingDataSources: DataSourceWithConnectorDetailsType[];
  dustClientFacingUrl: string;
  setIsProviderLoading: (provider: ConnectorProvider, value: boolean) => void;
};

export const AddConnectionMenu = ({
  owner,
  plan,
  existingDataSources,
  dustClientFacingUrl,
  setIsProviderLoading,
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
    connector: ConnectorProvider | null;
  }>({
    isOpen: false,
    connector: null,
  });

  const router = useRouter();
  const allConnectors = CONNECTOR_PROVIDERS.filter(
    (f) =>
      isConnectorProviderAllowedForPlan(plan, f) &&
      isConnectionIdRequiredForProvider(f)
  );

  const nonSetUpConnectors = allConnectors.filter((connectorProvider) =>
    existingDataSources.every(
      (view) => view.connectorProvider !== connectorProvider
    )
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
        connector: prev.connector,
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
        //TODO(GROUPS-UI): redirect to new modal to edit permissions
        void router.push(
          `/w/${owner.sId}/builder/data-sources/${createdManagedDataSource.dataSource.name}` +
            (REDIRECT_TO_EDIT_PERMISSIONS.includes(provider)
              ? `?edit_permissions=true`
              : "")
        );
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
        connector: prev.connector,
      }));
      sendNotification({
        type: "error",
        title: `Failed to enable connection (${provider})`,
      });
    } finally {
      setIsProviderLoading(provider, false);
    }
  };

  const handleConnectionClick = (connectorProvider: ConnectorProvider) => {
    const configuration = CONNECTOR_CONFIGURATIONS[connectorProvider];

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
      (view) => view.connectorProvider === connectorProvider
    );
    if (!existingDataSource || !existingDataSource.connector) {
      if (!isProviderAllowed) {
        setShowUpgradePopup(true);
      } else {
        if (isBuilt) {
          setShowConfirmConnection({
            isOpen: true,
            connector: connectorProvider,
          });
        } else {
          setShowPreviewPopupForProvider({
            isOpen: true,
            connector: connectorProvider,
          });
        }
      }
    }
  };

  return (
    nonSetUpConnectors.length > 0 && (
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

        {showConfirmConnection.connector && (
          <CreateConnectionConfirmationModal
            connectorProviderConfiguration={
              CONNECTOR_CONFIGURATIONS[showConfirmConnection.connector]
            }
            isOpen={showConfirmConnection.isOpen}
            onClose={() =>
              setShowConfirmConnection((prev) => ({
                isOpen: false,
                connector: prev.connector,
              }))
            }
            onConfirm={async () => {
              if (showConfirmConnection.connector) {
                await handleEnableManagedDataSource(
                  showConfirmConnection.connector,
                  null // suffix
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
              icon={PlusIcon}
              size="sm"
            />
          </DropdownMenu.Button>
          <DropdownMenu.Items width={180}>
            {nonSetUpConnectors.map((connectorProvider) => (
              <DropdownMenu.Item
                key={connectorProvider}
                label={CONNECTOR_CONFIGURATIONS[connectorProvider].name}
                icon={getConnectorProviderLogoWithFallback(connectorProvider)}
                onClick={() => {
                  handleConnectionClick(connectorProvider);
                }}
              />
            ))}
          </DropdownMenu.Items>
        </DropdownMenu>
      </>
    )
  );
};
