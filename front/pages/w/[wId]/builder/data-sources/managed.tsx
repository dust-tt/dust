import {
  Button,
  Chip,
  CloudArrowLeftRightIcon,
  Cog6ToothIcon,
  ContentMessage,
  ContextItem,
  DropdownMenu,
  InformationCircleIcon,
  Page,
  Popup,
} from "@dust-tt/sparkle";
import Nango from "@nangohq/frontend";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationAdmin } from "@app/components/sparkle/navigation";
import { getDataSources } from "@app/lib/api/data_sources";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { buildConnectionId } from "@app/lib/connector_connection_id";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import {
  connectorIsUsingNango,
  ConnectorProvider,
  ConnectorsAPI,
  ConnectorType,
} from "@app/lib/connectors_api";
import { githubAuth } from "@app/lib/github_auth";
import { timeAgoFrom } from "@app/lib/utils";
import { DataSourceType } from "@app/types/data_source";
import { PlanType } from "@app/types/plan";
import { UserType, WorkspaceType } from "@app/types/user";

const {
  GA_TRACKING_ID = "",
  NANGO_SLACK_CONNECTOR_ID = "",
  NANGO_NOTION_CONNECTOR_ID = "",
  NANGO_GOOGLE_DRIVE_CONNECTOR_ID = "",
  NANGO_INTERCOM_CONNECTOR_ID = "",
  NANGO_PUBLIC_KEY = "",
  GITHUB_APP_URL = "",
} = process.env;

type DataSourceIntegration = {
  name: string;
  dataSourceName: string | null;
  connector: ConnectorType | null;
  fetchConnectorError: boolean;
  fetchConnectorErrorMessage?: string | null;
  isBuilt: boolean;
  connectorProvider: ConnectorProvider;
  description: string;
  synchronizedAgo: string | null;
  setupWithSuffix: string | null;
};

const REDIRECT_TO_EDIT_PERMISSIONS = ["google_drive", "slack"];

export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  readOnly: boolean;
  isAdmin: boolean;
  integrations: DataSourceIntegration[];
  plan: PlanType;
  gaTrackingId: string;
  nangoConfig: {
    publicKey: string;
    slackConnectorId: string;
    notionConnectorId: string;
    googleDriveConnectorId: string;
    intercomConnectorId: string;
  };
  githubAppUrl: string;
}> = async (context) => {
  const session = await getSession(context.req, context.res);

  const user = await getUserFromSession(session);
  if (!user) {
    return {
      notFound: true,
    };
  }

  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();
  const plan = auth.plan();
  if (!owner || !plan) {
    return {
      notFound: true,
    };
  }

  const readOnly = !auth.isBuilder();
  const isAdmin = auth.isAdmin();

  const allDataSources = await getDataSources(auth);
  const managedDataSources = allDataSources.filter((ds) => ds.connectorId);

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
        const statusRes = await ConnectorsAPI.getConnector(mds.connectorId);
        if (statusRes.isErr()) {
          return {
            dataSourceName: mds.name,
            provider: mds.connectorProvider,
            connector: null,
            fetchConnectorError: true,
            fetchConnectorErrorMessage: statusRes.error.error.message,
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
      isBuilt: integration.isBuilt,
      description: integration.description,
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
        isBuilt: integration.isBuilt,
        description: integration.description,
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
      user,
      owner,
      readOnly,
      isAdmin,
      integrations,
      plan,
      gaTrackingId: GA_TRACKING_ID,
      nangoConfig: {
        publicKey: NANGO_PUBLIC_KEY,
        slackConnectorId: NANGO_SLACK_CONNECTOR_ID,
        notionConnectorId: NANGO_NOTION_CONNECTOR_ID,
        googleDriveConnectorId: NANGO_GOOGLE_DRIVE_CONNECTOR_ID,
        intercomConnectorId: NANGO_INTERCOM_CONNECTOR_ID,
      },
      githubAppUrl: GITHUB_APP_URL,
    },
  };
};

export default function DataSourcesView({
  user,
  owner,
  readOnly,
  isAdmin,
  integrations,
  plan,
  gaTrackingId,
  nangoConfig,
  githubAppUrl,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const planConnectionsLimits = plan.limits.connections;
  const [localIntegrations, setLocalIntegrations] = useState(integrations);

  const [isLoadingByProvider, setIsLoadingByProvider] = useState<
    Record<ConnectorProvider, boolean | undefined>
  >({} as Record<ConnectorProvider, boolean | undefined>);
  const [showUpgradePopupForProvider, setShowUpgradePopupForProvider] =
    useState<ConnectorProvider | null>(null);
  const [showPreviewPopupForProvider, setShowPreviewPopupForProvider] =
    useState<ConnectorProvider | null>(null);
  const handleEnableManagedDataSource = async (
    provider: ConnectorProvider,
    suffix: string | null
  ) => {
    try {
      let connectionId: string;
      if (connectorIsUsingNango(provider)) {
        // nango-based connectors
        const nangoConnectorId = {
          slack: nangoConfig.slackConnectorId,
          notion: nangoConfig.notionConnectorId,
          google_drive: nangoConfig.googleDriveConnectorId,
          intercom: nangoConfig.intercomConnectorId,
        }[provider];
        const nango = new Nango({ publicKey: nangoConfig.publicKey });
        const newConnectionId = buildConnectionId(owner.sId, provider);
        const {
          connectionId: nangoConnectionId,
        }: { providerConfigKey: string; connectionId: string } =
          await nango.auth(nangoConnectorId, newConnectionId);
        connectionId = nangoConnectionId;
      } else if (provider === "github") {
        const installationId = await githubAuth(githubAppUrl);
        connectionId = installationId;
      } else {
        throw new Error(`Unknown provider ${provider}`);
      }

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
            connectionId,
          }),
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
        window.alert(
          `Failed to enable ${provider} Data Source: ${responseText}`
        );
      }
    } catch (e) {
      window.alert(`Failed to enable ${provider} data source`);
      console.error(`Failed to enable ${provider} data source`, e);
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
      user={user}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="settings"
      subNavigation={subNavigationAdmin({
        owner,
        current: "data_sources_managed",
      })}
    >
      <Page.Vertical gap="xl" align="stretch">
        <Page.Header
          title="Connections"
          icon={CloudArrowLeftRightIcon}
          description="Manage connections to your products and the real-time data feeds Dust has access to."
        />
        {owner.role !== "admin" && (
          <ContentMessage title="Roles">
            Only Admins can activate and manage Connections.
          </ContentMessage>
        )}
        <ContextItem.List>
          {localIntegrations.map((ds) => {
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
                            default:
                              ((p: never) => {
                                throw new Error(
                                  `Unknown connector provider ${p}`
                                );
                              })(ds.connectorProvider);
                          }

                          if (isDataSourceAllowedInPlan && ds.isBuilt) {
                            await handleEnableManagedDataSource(
                              ds.connectorProvider as ConnectorProvider,
                              ds.setupWithSuffix
                            );
                          } else if (isDataSourceAllowedInPlan && !ds.isBuilt) {
                            setShowPreviewPopupForProvider(
                              ds.connectorProvider
                            );
                          } else {
                            setShowUpgradePopupForProvider(
                              ds.connectorProvider as ConnectorProvider
                            );
                          }
                          return;
                        };
                        const label = !ds.isBuilt
                          ? "Preview"
                          : !isLoadingByProvider[
                              ds.connectorProvider as ConnectorProvider
                            ] && !ds.fetchConnectorError
                          ? "Connect"
                          : "Connecting...";
                        if (!ds || !ds.connector) {
                          return (
                            <>
                              {ds.connectorProvider !== "google_drive" && (
                                <Button
                                  variant="primary"
                                  icon={
                                    ds.isBuilt
                                      ? CloudArrowLeftRightIcon
                                      : InformationCircleIcon
                                  }
                                  disabled={disabled}
                                  onClick={onClick}
                                  label={label}
                                />
                              )}
                              {ds.connectorProvider === "google_drive" && (
                                <DropdownMenu>
                                  <DropdownMenu.Button>
                                    <Button
                                      variant="primary"
                                      label={label}
                                      disabled={disabled}
                                      icon={
                                        ds.isBuilt
                                          ? CloudArrowLeftRightIcon
                                          : InformationCircleIcon
                                      }
                                    />
                                  </DropdownMenu.Button>
                                  <DropdownMenu.Items
                                    origin="topRight"
                                    width={350}
                                  >
                                    <div className="flex flex-col gap-y-4 p-4">
                                      <div className="flex flex-col gap-y-2">
                                        <div className="grow text-sm font-medium text-element-800">
                                          Disclosure
                                        </div>
                                        <div className="text-sm font-normal text-element-700">
                                          Dust's use of information received
                                          from the Google APIs will adhere to{" "}
                                          <Link
                                            className="s-text-action-500"
                                            href="https://developers.google.com/terms/api-services-user-data-policy#additional_requirements_for_specific_api_scopes"
                                          >
                                            Google API Services User Data Policy
                                          </Link>
                                          , including the Limited Use
                                          requirements.
                                        </div>
                                      </div>

                                      <div className="flex flex-col gap-y-2">
                                        <div className="grow text-sm font-medium text-element-800">
                                          Notice on data processing
                                        </div>
                                        <div className="text-sm font-normal text-element-700">
                                          By connecting Google Drive, you
                                          acknowledge and agree that within your
                                          Google Drive, the data contained in
                                          the files and folders that you choose
                                          to synchronize with Dust will be
                                          transmitted to third-party entities,
                                          including but not limited to
                                          Artificial Intelligence (AI) model
                                          providers, for the purpose of
                                          processing and analysis. This process
                                          is an integral part of the
                                          functionality of our service and is
                                          subject to the terms outlined in our
                                          Privacy Policy and Terms of Service.
                                        </div>
                                      </div>
                                      <div className="flex justify-center">
                                        <DropdownMenu.Button>
                                          <Button
                                            variant="secondary"
                                            icon={CloudArrowLeftRightIcon}
                                            disabled={disabled}
                                            onClick={onClick}
                                            label="Acknowledge and Connect"
                                          />
                                        </DropdownMenu.Button>
                                      </div>
                                    </div>
                                  </DropdownMenu.Items>
                                </DropdownMenu>
                              )}
                            </>
                          );
                        } else {
                          return (
                            <Button
                              variant="secondary"
                              icon={Cog6ToothIcon}
                              disabled={
                                !ds.isBuilt ||
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
                      description="Please email us at team@dust.tt for early access."
                      buttonLabel="Contact us"
                      buttonClick={() => {
                        window.open(
                          "mailto:team@dust.tt?subject=Intersted in the Intercom connection"
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
                      } else if (ds.connector.errorType) {
                        return (
                          <Chip color="warning">
                            Oops! It seems that our access to your account has
                            been revoked. Please re-authorize this Data Source
                            to keep your data up to date on Dust.
                          </Chip>
                        );
                      } else if (!ds.connector.lastSyncSuccessfulTime) {
                        return (
                          <Chip color="amber" isBusy>
                            Synchronizing
                            {ds.connector?.firstSyncProgress
                              ? ` (${ds.connector?.firstSyncProgress})`
                              : null}
                          </Chip>
                        );
                      } else {
                        return (
                          <Chip color="slate">
                            Last Sync ~ {ds.synchronizedAgo} ago
                          </Chip>
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
        <Page.Vertical>
          <Page.SectionHeader title="Limitations" />
          <Page.P>
            <span className="font-bold">Slack</span>: Dust doesn't take into
            account external files or content behind a url.
          </Page.P>
          <Page.P>
            <span className="font-bold">Notion</span>: Dust doesn't take into
            account external files or content behind a url.
          </Page.P>
          <Page.P>
            <span className="font-bold">Google Drive</span>: Dust doesn't take
            into account files with more than 750Kb of extracted text. By
            default, Dust doesn't take into account .pdf files. Email us at
            team@dust.tt to include .pdf files.
          </Page.P>
          <Page.P>
            <span className="font-bold">Github</span>: Dust only gathers data
            from issues, discussions, and top-level pull requests comments (but
            not in-code comments in pull requests, nor the actual source code or
            other Github data).
          </Page.P>
        </Page.Vertical>
      </Page.Vertical>
    </AppLayout>
  );
}
