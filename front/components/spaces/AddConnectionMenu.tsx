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
import { clientFetch } from "@app/lib/egress";
import { useSystemSpace } from "@app/lib/swr/spaces";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import {
  trackEvent,
  TRACKING_ACTIONS,
  TRACKING_AREAS,
  withTracking,
} from "@app/lib/tracking";
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
}): Promise<
  Result<{ connectionId: string; relatedCredentialId?: string }, Error>
> {
  if (!isOAuthProvider(provider)) {
    return new Err(new Error(`Unknown provider ${provider}`));
  }

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

  return new Ok({
    connectionId: cRes.value.connection_id,
    relatedCredentialId:
      cRes.value.related_credential_id === null
        ? undefined
        : cRes.value.related_credential_id,
  });
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
      extraConfig,
    }: {
      connectionId: string;
      provider: ConnectorProvider;
      suffix: string | null;
      extraConfig: Record<string, string>;
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
        extraConfig,
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
    relatedCredentialId,
    suffix,
    extraConfig,
  }: {
    owner: WorkspaceType;
    systemSpace: SpaceType;
    provider: ConnectorProvider;
    connectionId: string;
    relatedCredentialId?: string;
    suffix: string | null;
    extraConfig: Record<string, string>;
  }): Promise<Response> => {
    const res = await clientFetch(
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
          relatedCredentialId,
          name: undefined,
          configuration: null,
          extraConfig,
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
      const connectionRes = await setupConnection({
        owner,
        provider,
        extraConfig,
      });
      if (connectionRes.isErr()) {
        throw connectionRes.error;
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
        connectionId: connectionRes.value.connectionId,
        relatedCredentialId: connectionRes.value.relatedCredentialId,
        suffix,
        extraConfig,
      });

      if (res.ok) {
        const createdManagedDataSource: {
          dataSource: DataSourceType;
          connector: ConnectorType;
        } = await res.json();
        trackEvent({
          area: TRACKING_AREAS.DATA_SOURCES,
          object: "connection",
          action: TRACKING_ACTIONS.CREATE,
          extra: {
            provider,
            data_source_id: createdManagedDataSource.dataSource.sId,
          },
        });
        onCreated(createdManagedDataSource.dataSource);
        // Track data source creation with ID
        trackEvent({
          area: TRACKING_AREAS.DATA_SOURCES,
          object: "create",
          action: "success",
          extra: {
            data_source_id: createdManagedDataSource.dataSource.sId,
            provider: provider,
          },
        });
      } else {
        const error = await res.json();
        const errorMessage =
          error?.error?.connectors_error?.message ??
          error?.error?.message ??
          undefined;

        sendNotification({
          type: "error",
          title: `Failed to enable connection (${provider})`,
          description: errorMessage,
        });
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
                      "suffix" | "extraConfig"
                    >
                  ) =>
                    handleCredentialProviderManagedDataSource({
                      ...args,
                      suffix: integration?.setupWithSuffix ?? null,
                      extraConfig: {}, // No extra config needed for BigQuery
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
                      "suffix" | "extraConfig"
                    >
                  ) =>
                    handleCredentialProviderManagedDataSource({
                      ...args,
                      suffix: integration?.setupWithSuffix ?? null,
                      extraConfig: {}, // No extra config needed for Snowflake
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
            case "microsoft_bot":
            case "slack_bot":
            case "discord_bot":
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
              onClick={withTracking(
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
                onClick={withTracking(
                  TRACKING_AREAS.DATA_SOURCES,
                  "provider_select",
                  () => handleConnectionClick(i),
                  { provider: i.connectorProvider }
                )}
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </>
    )
  );
};
