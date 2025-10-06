import {
  Button,
  CloudArrowLeftRightIcon,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import { useCallback, useState } from "react";

import { CreateConnectionOAuthModal } from "@app/components/data_source/CreateConnectionOAuthModal";
import { CreateOrUpdateConnectionBigQueryModal } from "@app/components/data_source/CreateOrUpdateConnectionBigQueryModal";
import { CreateOrUpdateConnectionSnowflakeModal } from "@app/components/data_source/CreateOrUpdateConnectionSnowflakeModal";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useSendNotification } from "@app/hooks/useNotification";
import {
  CONNECTOR_CONFIGURATIONS,
  getConnectorProviderLogoWithFallback,
  isConnectionIdRequiredForProvider,
  isConnectorProviderAllowedForPlan,
} from "@app/lib/connector_providers";
import { useSystemSpace } from "@app/lib/swr/spaces";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import { trackClick, TRACKING_AREAS, trackingProps } from "@app/lib/tracking";
import type { PostDataSourceRequestBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/data_sources";
import type {
  ConnectorProvider,
  ConnectorType,
  DataSourceType,
  LightWorkspaceType,
  OAuthUseCase,
  PlanType,
  Result,
  SpaceType,
  WorkspaceType,
} from "@app/types";
import {
  assertNever,
  Err,
  isOAuthProvider,
  Ok,
  setupOAuthConnection,
} from "@app/types";

export type DataSourceIntegration = {
  connectorProvider: ConnectorProvider;
  setupWithSuffix: string | null;
};

type AddConnectionMenuProps = {
  owner: WorkspaceType;
  plan: PlanType;
  setIsProviderLoading: (provider: ConnectorProvider, value: boolean) => void;
  onCreated(dataSource: DataSourceType): void;
  integrations: DataSourceIntegration[];
};

export async function setupConnection({
  owner,
  provider,
  useCase = "connection",
  extraConfig,
}: {
  owner: LightWorkspaceType;
  provider: ConnectorProvider;
  useCase?: OAuthUseCase;
  extraConfig: Record<string, string>;
}): Promise<Result<string, Error>> {
  let connectionId: string;

  if (isOAuthProvider(provider)) {
    // OAuth flow
    const cRes = await setupOAuthConnection({
      dustClientFacingUrl: `${process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL}`,
      owner,
      provider,
      useCase,
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
  const { isDark } = useTheme();
  const { featureFlags } = useFeatureFlags({ workspaceId: owner.sId });
  const { systemSpace } = useSystemSpace({ workspaceId: owner.sId });

  const handleOnClose = useCallback(
    () =>
      setShowConfirmConnection((prev) => ({
        isOpen: false,
        integration: prev.integration,
      })),
    []
  );

  const handleCredentialProviderManagedDataSource = useCallback(
    async ({
      connectionId,
      provider,
      suffix,
    }: {
      connectionId: string;
      provider: ConnectorProvider;
      suffix: string | null;
    }) => {
      if (!systemSpace) {
        throw new Error("System space is required");
      }

      return postDataSource({
        owner,
        systemSpace,
        provider,
        connectionId,
        suffix,
      });
    },
    [owner, systemSpace]
  );

  // Filter available integrations.
  const availableIntegrations = integrations.filter((i) => {
    const hide = CONNECTOR_CONFIGURATIONS[i.connectorProvider].hide;
    const rolloutFlag =
      CONNECTOR_CONFIGURATIONS[i.connectorProvider].rollingOutFlag;
    const hasFlag = rolloutFlag && featureFlags.includes(rolloutFlag);

    return (
      isConnectorProviderAllowedForPlan(
        plan,
        i.connectorProvider,
        featureFlags
      ) &&
      isConnectionIdRequiredForProvider(i.connectorProvider) &&
      // If the connector is hidden, it should only be shown if the feature flag is enabled.
      (!hide || hasFlag)
    );
  });

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

      if (!systemSpace) {
        throw new Error("System space is required");
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

  const handleConnectionClick = (integration: DataSourceIntegration) => {
    const configuration =
      CONNECTOR_CONFIGURATIONS[integration.connectorProvider];

    let isBuilt = configuration.status === "built";

    if (
      configuration.status === "rolling_out" &&
      !!configuration.rollingOutFlag
    ) {
      isBuilt = featureFlags.includes(configuration.rollingOutFlag);
    }

    const isProviderAllowed = isConnectorProviderAllowedForPlan(
      plan,
      configuration.connectorProvider,
      featureFlags
    );

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
  };

  if (!systemSpace) {
    return null;
  }

  const { integration, isOpen } = showConfirmConnection || {};
  const connectorProvider = integration?.connectorProvider;

  return (
    availableIntegrations.length > 0 && (
      <>
        <Dialog
          open={showUpgradePopup}
          onOpenChange={(open) => {
            if (!open) {
              setShowUpgradePopup(false);
            }
          }}
        >
          <DialogContent size="md" isAlertDialog>
            <DialogHeader hideButton>
              <DialogTitle>${plan.name} plan</DialogTitle>
            </DialogHeader>
            <DialogContainer>
              Unlock this managed data source by upgrading your plan.
            </DialogContainer>
            <DialogFooter
              leftButtonProps={{
                label: "Cancel",
                variant: "outline",
              }}
              rightButtonProps={{
                label: "Validate",
                variant: "primary",
                onClick: () => {
                  void router.push(`/w/${owner.sId}/subscription`);
                },
              }}
            />
          </DialogContent>
        </Dialog>

        {[connectorProvider].map((c) => {
          switch (c) {
            case "bigquery":
              return (
                <CreateOrUpdateConnectionBigQueryModal
                  key={`bigquery-${isOpen}`}
                  owner={owner}
                  connectorProviderConfiguration={CONNECTOR_CONFIGURATIONS[c]}
                  isOpen={isOpen}
                  onClose={handleOnClose}
                  createDatasource={(
                    args: Omit<
                      Parameters<
                        typeof handleCredentialProviderManagedDataSource
                      >[0],
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
              );
            case "snowflake":
              return (
                <CreateOrUpdateConnectionSnowflakeModal
                  key={`snowflake-${isOpen}`}
                  owner={owner}
                  connectorProviderConfiguration={CONNECTOR_CONFIGURATIONS[c]}
                  isOpen={isOpen}
                  onClose={handleOnClose}
                  createDatasource={(
                    args: Omit<
                      Parameters<
                        typeof handleCredentialProviderManagedDataSource
                      >[0],
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
              );
            case "github":
            case "confluence":
            case "google_drive":
            case "intercom":
            case "notion":
            case "slack":
            case "microsoft":
            case "zendesk":
            case "salesforce":
            case "webcrawler":
            case "gong":
              return (
                <CreateConnectionOAuthModal
                  key={`${c}-${isOpen}`}
                  connectorProviderConfiguration={CONNECTOR_CONFIGURATIONS[c]}
                  isOpen={isOpen}
                  onClose={handleOnClose}
                  onConfirm={(extraConfig: Record<string, string>) => {
                    if (showConfirmConnection.integration) {
                      void handleOauthProviderManagedDataSource(
                        c,
                        integration?.setupWithSuffix ?? null,
                        extraConfig
                      );
                    }
                  }}
                />
              );
            case "slack_bot":
            case undefined:
              return null;
            default:
              assertNever(c);
          }
        })}

        <Dialog
          open={showPreviewPopupForProvider.isOpen}
          onOpenChange={(open) => {
            if (!open) {
              setShowPreviewPopupForProvider((prev) => ({
                isOpen: false,
                connector: prev.connector,
              }));
            }
          }}
        >
          <DialogContent size="md">
            <DialogHeader>
              <DialogTitle>Coming Soon!</DialogTitle>
              <DialogDescription>
                Please email us at support@dust.tt for early access.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter
              leftButtonProps={{
                label: "Cancel",
                variant: "outline",
                onClick: () => {
                  setShowPreviewPopupForProvider((prev) => ({
                    isOpen: false,
                    connector: prev.connector,
                  }));
                },
              }}
              rightButtonProps={{
                label: "Contact us",
                variant: "highlight",
                onClick: () => {
                  window.open(
                    `mailto:support@dust.tt?subject=Early access to the ${showPreviewPopupForProvider.connector} connection`
                  );
                },
              }}
            />
          </DialogContent>
        </Dialog>

        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              label="Add Connections"
              variant="primary"
              icon={CloudArrowLeftRightIcon}
              size="sm"
              {...trackClick(
                TRACKING_AREAS.DATA_SOURCES,
                "add_connection_menu"
              )}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {availableIntegrations.map((i) => (
              <DropdownMenuItem
                key={i.connectorProvider}
                label={CONNECTOR_CONFIGURATIONS[i.connectorProvider].name}
                icon={getConnectorProviderLogoWithFallback({
                  provider: i.connectorProvider,
                  isDark,
                })}
                {...trackingProps(
                  TRACKING_AREAS.DATA_SOURCES,
                  "provider_select",
                  "click",
                  { provider: i.connectorProvider }
                )}
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
