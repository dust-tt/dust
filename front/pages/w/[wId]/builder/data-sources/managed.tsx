import {
  Avatar,
  BookOpenIcon,
  Button,
  Chip,
  CloudArrowLeftRightIcon,
  Cog6ToothIcon,
  ContentMessage,
  ContextItem,
  Hoverable,
  InformationCircleIcon,
  Modal,
  Page,
  Popup,
} from "@dust-tt/sparkle";
import type {
  ConnectorProvider,
  DataSourceType,
  Result,
  WhitelistableFeature,
  WorkspaceType,
} from "@dust-tt/types";
import type { PlanType, SubscriptionType } from "@dust-tt/types";
import type { ConnectorType } from "@dust-tt/types";
import {
  ConnectorsAPI,
  Err,
  isOAuthProvider,
  Ok,
  setupOAuthConnection,
} from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useContext, useEffect, useState } from "react";

import ConnectorSyncingChip from "@app/components/data_source/DataSourceSyncChip";
import { subNavigationBuild } from "@app/components/navigation/config";
import AppLayout from "@app/components/sparkle/AppLayout";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import config from "@app/lib/api/config";
import { getDataSources } from "@app/lib/api/data_sources";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { useAdmins } from "@app/lib/swr";
import { timeAgoFrom } from "@app/lib/utils";
import logger from "@app/logger/logger";
import type { PostManagedDataSourceRequestBody } from "@app/pages/api/w/[wId]/data_sources/managed";

const { GA_TRACKING_ID = "" } = process.env;

type DataSourceIntegration = {
  name: string;
  dataSourceName: string | null;
  connector: ConnectorType | null;
  fetchConnectorError: boolean;
  fetchConnectorErrorMessage?: string | null;
  status: "preview" | "built" | "rolling_out";
  rollingOutFlag: WhitelistableFeature | null;
  connectorProvider: ConnectorProvider;
  description: string;
  limitations: string | null;
  guideLink: string | null;
  synchronizedAgo: string | null;
  setupWithSuffix: string | null;
};

const REDIRECT_TO_EDIT_PERMISSIONS = [
  "confluence",
  "google_drive",
  "microsoft",
  "slack",
  "intercom",
];

export async function setupConnection({
  dustClientFacingUrl,
  owner,
  provider,
}: {
  dustClientFacingUrl: string;
  owner: WorkspaceType;
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

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  readOnly: boolean;
  isAdmin: boolean;
  integrations: DataSourceIntegration[];
  plan: PlanType;
  gaTrackingId: string;
  dustClientFacingUrl: string;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const plan = auth.plan();
  const subscription = auth.subscription();

  if (!owner || !plan || !subscription) {
    return {
      notFound: true,
    };
  }

  const readOnly = !auth.isBuilder();
  const isAdmin = auth.isAdmin();

  const allDataSources = await getDataSources(auth);
  const managedDataSources = allDataSources
    .filter((ds) => ds.connectorId)
    .filter((ds) => ds.connectorProvider !== "webcrawler");

  const managedConnector: {
    dataSourceName: string;
    provider: ConnectorProvider;
    connector: ConnectorType | null;
    fetchConnectorError: boolean;
    fetchConnectorErrorMessage: string | null;
  }[] = await Promise.all(
    managedDataSources.map(async (mds) => {
      if (!mds.connectorId || !mds.connectorProvider) {
        throw new Error(
          // Should never happen, but we need to make eslint happy
          "Unexpected empty `connectorId or `connectorProvider` for managed data sources"
        );
      }
      try {
        const connectorsAPI = new ConnectorsAPI(
          config.getConnectorsAPIConfig(),
          logger
        );
        const statusRes = await connectorsAPI.getConnector(mds.connectorId);
        if (statusRes.isErr()) {
          return {
            dataSourceName: mds.name,
            provider: mds.connectorProvider,
            connector: null,
            fetchConnectorError: true,
            fetchConnectorErrorMessage: statusRes.error.message,
          };
        }
        return {
          dataSourceName: mds.name,
          provider: mds.connectorProvider,
          connector: statusRes.value,
          fetchConnectorError: false,
          fetchConnectorErrorMessage: null,
        };
      } catch (e) {
        // Probably means `connectors` is down, we don't fail to avoid a 500 when just displaying
        // the datasources (eventual actions will fail but a 500 just at display is not desirable).
        // When that happens the managed data sources are shown as failed.
        return {
          dataSourceName: mds.name,
          provider: mds.connectorProvider,
          connector: null,
          fetchConnectorError: true,
          fetchConnectorErrorMessage: "Synchonization service is down",
        };
      }
    })
  );

  const integrations: DataSourceIntegration[] = managedConnector.map((mc) => {
    const integration = CONNECTOR_CONFIGURATIONS[mc.provider];
    return {
      name: integration.name,
      connectorProvider: integration.connectorProvider,
      status: integration.status,
      rollingOutFlag: integration.rollingOutFlag || null,
      description: integration.description,
      limitations: integration.limitations,
      guideLink: integration.guideLink,
      dataSourceName: mc.dataSourceName,
      connector: mc.connector,
      fetchConnectorError: mc.fetchConnectorError,
      fetchConnectorErrorMessage: mc.fetchConnectorErrorMessage,
      synchronizedAgo: mc.connector?.lastSyncSuccessfulTime
        ? timeAgoFrom(mc.connector.lastSyncSuccessfulTime)
        : null,
      setupWithSuffix: null,
    };
  });

  let setupWithSuffix: {
    connector: ConnectorProvider;
    suffix: string;
  } | null = null;
  if (
    context.query.setupWithSuffixConnector &&
    Object.keys(CONNECTOR_CONFIGURATIONS).includes(
      context.query.setupWithSuffixConnector as string
    ) &&
    context.query.setupWithSuffixSuffix &&
    typeof context.query.setupWithSuffixSuffix === "string"
  ) {
    setupWithSuffix = {
      connector: context.query.setupWithSuffixConnector as ConnectorProvider,
      suffix: context.query.setupWithSuffixSuffix,
    };
  }

  for (const key in CONNECTOR_CONFIGURATIONS) {
    if (
      !integrations.find(
        (i) => i.connectorProvider === (key as ConnectorProvider)
      ) ||
      setupWithSuffix?.connector === key
    ) {
      const integration = CONNECTOR_CONFIGURATIONS[key as ConnectorProvider];
      integrations.push({
        name: integration.name,
        connectorProvider: integration.connectorProvider,
        status: integration.status,
        rollingOutFlag: integration.rollingOutFlag || null,
        description: integration.description,
        limitations: integration.limitations,
        guideLink: integration.guideLink,
        dataSourceName: null,
        connector: null,
        fetchConnectorError: false,
        synchronizedAgo: null,
        setupWithSuffix:
          setupWithSuffix?.connector === key ? setupWithSuffix.suffix : null,
      });
    }
  }

  return {
    props: {
      owner,
      subscription,
      readOnly,
      isAdmin,
      integrations,
      plan,
      gaTrackingId: GA_TRACKING_ID,
      dustClientFacingUrl: config.getClientFacingUrl(),
    },
  };
});

function ConfirmationModal({
  dataSource,
  show,
  onClose,
  onConfirm,
}: {
  dataSource: DataSourceIntegration;
  show: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [isLoading, setIsLoading] = useState(false);

  return (
    <Modal
      isOpen={show}
      title={`Connect ${dataSource.name}`}
      onClose={onClose}
      hasChanged={false}
      variant="side-sm"
    >
      <div className="pt-8">
        <Page.Vertical gap="lg" align="stretch">
          <div className="flex flex-col gap-y-2">
            <div className="grow text-sm font-medium text-element-800">
              Important
            </div>
            <div className="text-sm font-normal text-element-700">
              Resources shared with Dust will be made available to the entire
              workspace{" "}
              <span className="font-medium">
                irrespective of their granular permissions
              </span>{" "}
              on {dataSource.name}.
            </div>
          </div>

          {dataSource.limitations && (
            <div className="flex flex-col gap-y-2">
              <div className="grow text-sm font-medium text-element-800">
                Limitations
              </div>
              <div className="text-sm font-normal text-element-700">
                {dataSource.limitations}
              </div>
            </div>
          )}

          {dataSource.connectorProvider === "google_drive" && (
            <>
              <div className="flex flex-col gap-y-2">
                <div className="grow text-sm font-medium text-element-800">
                  Disclosure
                </div>
                <div className="text-sm font-normal text-element-700">
                  Dust's use of information received from the Google APIs will
                  adhere to{" "}
                  <Link
                    className="s-text-action-500"
                    href="https://developers.google.com/terms/api-services-user-data-policy#additional_requirements_for_specific_api_scopes"
                  >
                    Google API Services User Data Policy
                  </Link>
                  , including the Limited Use requirements.
                </div>
              </div>

              <div className="flex flex-col gap-y-2">
                <div className="grow text-sm font-medium text-element-800">
                  Notice on data processing
                </div>
                <div className="text-sm font-normal text-element-700">
                  By connecting Google Drive, you acknowledge and agree that
                  within your Google Drive, the data contained in the files and
                  folders that you choose to synchronize with Dust will be
                  transmitted to third-party entities, including but not limited
                  to Artificial Intelligence (AI) model providers, for the
                  purpose of processing and analysis. This process is an
                  integral part of the functionality of our service and is
                  subject to the terms outlined in our Privacy Policy and Terms
                  of Service.
                </div>
              </div>
            </>
          )}

          <div className="flex justify-center pt-2">
            <Button.List isWrapping={true}>
              <Button
                variant="primary"
                size="md"
                icon={CloudArrowLeftRightIcon}
                onClick={() => {
                  setIsLoading(true);
                  onConfirm();
                }}
                disabled={isLoading}
                label={
                  isLoading
                    ? "Connecting..."
                    : dataSource.connectorProvider === "google_drive"
                      ? "Acknowledge and Connect"
                      : "Connect"
                }
              />
              {dataSource.guideLink && (
                <Button
                  label="Read our guide"
                  size="md"
                  variant="tertiary"
                  icon={BookOpenIcon}
                  onClick={() => {
                    if (dataSource.guideLink) {
                      window.open(dataSource.guideLink, "_blank");
                    }
                  }}
                />
              )}
            </Button.List>
          </div>
        </Page.Vertical>
      </div>
    </Modal>
  );
}

export default function DataSourcesView({
  owner,
  subscription,
  readOnly,
  isAdmin,
  integrations,
  plan,
  gaTrackingId,
  dustClientFacingUrl,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const sendNotification = useContext(SendNotificationsContext);

  const planConnectionsLimits = plan.limits.connections;
  const [localIntegrations, setLocalIntegrations] = useState(integrations);

  const [isLoadingByProvider, setIsLoadingByProvider] = useState<
    Record<ConnectorProvider, boolean | undefined>
  >({} as Record<ConnectorProvider, boolean | undefined>);
  const [showUpgradePopupForProvider, setShowUpgradePopupForProvider] =
    useState<ConnectorProvider | null>(null);
  const [showPreviewPopupForProvider, setShowPreviewPopupForProvider] =
    useState<ConnectorProvider | null>(null);
  const [showConfirmConnection, setShowConfirmConnection] =
    useState<DataSourceIntegration | null>(null);

  const [showAdminsModal, setShowAdminsModal] = useState(false);
  const { admins, isAdminsLoading } = useAdmins(owner);

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

      setShowConfirmConnection(null);
      setIsLoadingByProvider((prev) => ({ ...prev, [provider]: true }));

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
        setLocalIntegrations((prev) =>
          prev.map((ds) => {
            return ds.connector === null && ds.connectorProvider == provider
              ? {
                  ...ds,
                  connector: createdManagedDataSource.connector,
                  setupWithSuffix: null,
                  dataSourceName: createdManagedDataSource.dataSource.name,
                }
              : ds;
          })
        );
        if (REDIRECT_TO_EDIT_PERMISSIONS.includes(provider)) {
          void router.push(
            `/w/${owner.sId}/builder/data-sources/${createdManagedDataSource.dataSource.name}?edit_permissions=true`
          );
        }
      } else {
        const responseText = await res.text();
        sendNotification({
          type: "error",
          title: `Failed to enable connection (${provider})`,
          description: `Got: ${responseText}`,
        });
      }
    } catch (e) {
      setShowConfirmConnection(null);
      sendNotification({
        type: "error",
        title: `Failed to enable connection (${provider})`,
      });
    } finally {
      setIsLoadingByProvider((prev) => ({ ...prev, [provider]: false }));
    }
  };

  useEffect(() => {
    setLocalIntegrations(localIntegrations);
  }, [localIntegrations]);

  const router = useRouter();

  return (
    <AppLayout
      subscription={subscription}
      owner={owner}
      gaTrackingId={gaTrackingId}
      subNavigation={subNavigationBuild({
        owner,
        current: "data_sources_managed",
      })}
    >
      {!isAdmin && (
        <Modal
          isOpen={showAdminsModal}
          title="Administrators"
          onClose={() => setShowAdminsModal(false)}
          hasChanged={false}
          variant="side-sm"
        >
          <div className="flex flex-col gap-5 pt-6 text-sm text-element-700">
            <Page.SectionHeader
              title="Administrators"
              description={`${owner.name} has the following administrators:`}
            />
            {isAdminsLoading ? (
              <div className="flex animate-pulse items-center justify-center gap-3 border-t border-structure-200 bg-structure-50 py-2 text-xs sm:text-sm">
                <div className="hidden sm:block">
                  <Avatar size="xs" />
                </div>
                <div className="flex grow flex-col gap-1 sm:flex-row sm:gap-3">
                  <div className="font-medium text-element-900">Loading...</div>
                  <div className="grow font-normal text-element-700"></div>
                </div>
              </div>
            ) : (
              <div className="s-w-full">
                {admins.map((admin) => {
                  return (
                    <div
                      key={`member-${admin.id}`}
                      className="flex items-center justify-center gap-3 border-t border-structure-200 p-2 text-xs sm:text-sm"
                    >
                      <div className="hidden sm:block">
                        <Avatar
                          visual={admin.image}
                          name={admin.fullName}
                          size="sm"
                        />
                      </div>
                      <div className="flex grow flex-col gap-1 sm:flex-row sm:gap-3">
                        <div className="font-medium text-element-900">
                          {admin.fullName}
                        </div>
                        <div className="grow font-normal text-element-700">
                          {admin.email}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Modal>
      )}
      {showConfirmConnection && (
        <ConfirmationModal
          dataSource={showConfirmConnection}
          show={true}
          onClose={() => setShowConfirmConnection(null)}
          onConfirm={async () => {
            await handleEnableManagedDataSource(
              showConfirmConnection.connectorProvider as ConnectorProvider,
              showConfirmConnection.setupWithSuffix
            );
          }}
        />
      )}
      <Page.Vertical gap="xl" align="stretch">
        <Page.Header
          title="Connections"
          icon={CloudArrowLeftRightIcon}
          description="Manage connections to your products and the real-time data feeds Dust has access to."
        />
        {!isAdmin && (
          <ContentMessage title="How are connections managed?">
            <b>Workspace administrators</b> control access to connections for
            all members.{" "}
            <Hoverable
              variant="primary"
              onClick={() => setShowAdminsModal(true)}
            >
              View the list of administrators here.
            </Hoverable>
          </ContentMessage>
        )}
        <ContextItem.List>
          {localIntegrations
            .filter(
              (ds) => !CONNECTOR_CONFIGURATIONS[ds.connectorProvider].hide
            )
            .sort((a, b) => {
              if (a.status === b.status) {
                return a.name.localeCompare(b.name);
              }

              if (a.status === "built") {
                return -1;
              }

              if (b.status === "built") {
                return 1;
              }

              if (a.status === "rolling_out") {
                return -1;
              }

              if (b.status === "rolling_out") {
                return 1;
              }

              return 0;
            })
            .map((ds) => {
              const isBuilt =
                ds.status === "built" ||
                (ds.status === "rolling_out" &&
                  ds.rollingOutFlag &&
                  owner.flags.includes(ds.rollingOutFlag));
              return (
                <ContextItem
                  key={
                    ds.dataSourceName ||
                    `managed-to-connect-${ds.connectorProvider}`
                  }
                  title={ds.name}
                  visual={
                    <ContextItem.Visual
                      visual={
                        CONNECTOR_CONFIGURATIONS[ds.connectorProvider]
                          .logoComponent
                      }
                    />
                  }
                  action={
                    <div className="relative">
                      <Button.List>
                        {(() => {
                          const disabled =
                            isLoadingByProvider[
                              ds.connectorProvider as ConnectorProvider
                            ] || !isAdmin;

                          const onClick = async () => {
                            let isDataSourceAllowedInPlan: boolean;

                            switch (ds.connectorProvider) {
                              case "confluence":
                                isDataSourceAllowedInPlan =
                                  planConnectionsLimits.isConfluenceAllowed;
                                break;
                              case "slack":
                                isDataSourceAllowedInPlan =
                                  planConnectionsLimits.isSlackAllowed;
                                break;
                              case "notion":
                                isDataSourceAllowedInPlan =
                                  planConnectionsLimits.isNotionAllowed;
                                break;
                              case "github":
                                isDataSourceAllowedInPlan =
                                  planConnectionsLimits.isGithubAllowed;
                                break;
                              case "google_drive":
                                isDataSourceAllowedInPlan =
                                  planConnectionsLimits.isGoogleDriveAllowed;
                                break;
                              case "intercom":
                                isDataSourceAllowedInPlan =
                                  planConnectionsLimits.isIntercomAllowed;
                                break;
                              case "microsoft":
                                isDataSourceAllowedInPlan = true;
                                break;
                              case "webcrawler":
                                // Web crawler connector is not displayed on this web page.
                                isDataSourceAllowedInPlan = false;
                                break;
                              default:
                                ((p: never) => {
                                  throw new Error(
                                    `Unknown connector provider ${p}`
                                  );
                                })(ds.connectorProvider);
                            }

                            if (!isDataSourceAllowedInPlan) {
                              setShowUpgradePopupForProvider(
                                ds.connectorProvider as ConnectorProvider
                              );
                            } else {
                              if (isBuilt) {
                                setShowConfirmConnection(ds);
                              } else {
                                setShowPreviewPopupForProvider(
                                  ds.connectorProvider
                                );
                              }
                            }
                            return;
                          };

                          const label = !isBuilt
                            ? "Preview"
                            : !isLoadingByProvider[
                                  ds.connectorProvider as ConnectorProvider
                                ] && !ds.fetchConnectorError
                              ? "Connect"
                              : "Connecting...";

                          if (!ds || !ds.connector) {
                            return (
                              <Button
                                variant="primary"
                                icon={
                                  isBuilt
                                    ? CloudArrowLeftRightIcon
                                    : InformationCircleIcon
                                }
                                disabled={disabled}
                                onClick={onClick}
                                label={label}
                              />
                            );
                          } else {
                            return (
                              <Button
                                variant="secondary"
                                icon={Cog6ToothIcon}
                                disabled={
                                  !isBuilt ||
                                  isLoadingByProvider[
                                    ds.connectorProvider as ConnectorProvider
                                  ] ||
                                  // Can't manage or view if not (admin or not readonly (ie builder)).
                                  !(isAdmin || !readOnly)
                                }
                                onClick={() => {
                                  void router.push(
                                    `/w/${owner.sId}/builder/data-sources/${ds.dataSourceName}`
                                  );
                                }}
                                label={isAdmin ? "Manage" : "View"}
                              />
                            );
                          }
                        })()}
                      </Button.List>
                      <Popup
                        show={
                          showUpgradePopupForProvider === ds.connectorProvider
                        }
                        className="absolute bottom-8 right-0"
                        chipLabel={`${plan.name} plan`}
                        description="Unlock this managed data source by upgrading your plan."
                        buttonLabel="Check Dust plans"
                        buttonClick={() => {
                          void router.push(`/w/${owner.sId}/subscription`);
                        }}
                        onClose={() => {
                          setShowUpgradePopupForProvider(null);
                        }}
                      />
                      <Popup
                        show={
                          showPreviewPopupForProvider === ds.connectorProvider
                        }
                        className="absolute bottom-8 right-0"
                        chipLabel="Coming Soon!"
                        description="Please email us at support@dust.tt for early access."
                        buttonLabel="Contact us"
                        buttonClick={() => {
                          window.open(
                            `mailto:support@dust.tt?subject=Early access to the ${ds.name} connection`
                          );
                        }}
                        onClose={() => {
                          setShowPreviewPopupForProvider(null);
                        }}
                      />
                    </div>
                  }
                >
                  {ds && ds.connector && (
                    <div className="mb-1 mt-2">
                      {(() => {
                        if (ds.fetchConnectorError) {
                          return (
                            <Chip color="warning">
                              Error loading the connector. Try again in a few
                              minutes.
                            </Chip>
                          );
                        } else {
                          return (
                            <ConnectorSyncingChip
                              initialState={ds.connector}
                              workspaceId={ds.connector.workspaceId}
                              dataSourceName={ds.connector.dataSourceName}
                            />
                          );
                        }
                      })()}
                    </div>
                  )}
                  <ContextItem.Description>
                    <div className="text-sm text-element-700">
                      {ds.description}
                    </div>
                  </ContextItem.Description>
                </ContextItem>
              );
            })}
        </ContextItem.List>
      </Page.Vertical>
    </AppLayout>
  );
}
