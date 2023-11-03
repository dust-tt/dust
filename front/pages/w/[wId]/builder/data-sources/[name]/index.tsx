import {
  Button,
  Chip,
  Cog6ToothIcon,
  ContextItem,
  DocumentTextIcon,
  ListCheckIcon,
  LockIcon,
  Page,
  PencilSquareIcon,
  PlusIcon,
  Popup,
  SectionHeader,
  SlackLogo,
  SliderToggle,
} from "@dust-tt/sparkle";
import Nango from "@nangohq/frontend";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useContext, useEffect, useState } from "react";

import ConnectorPermissionsModal from "@app/components/ConnectorPermissionsModal";
import { PermissionTree } from "@app/components/ConnectorPermissionsTree";
import AppLayout from "@app/components/sparkle/AppLayout";
import { AppLayoutSimpleCloseTitle } from "@app/components/sparkle/AppLayoutTitle";
import { subNavigationAdmin } from "@app/components/sparkle/navigation";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { getDataSource } from "@app/lib/api/data_sources";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { buildConnectionId } from "@app/lib/connector_connection_id";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import {
  connectorIsUsingNango,
  ConnectorProvider,
  ConnectorsAPI,
  ConnectorType,
} from "@app/lib/connectors_api";
import { getDisplayNameForDocument } from "@app/lib/data_sources";
import { APIError } from "@app/lib/error";
import { githubAuth } from "@app/lib/github_auth";
import { useConnectorBotEnabled, useDocuments } from "@app/lib/swr";
import { timeAgoFrom } from "@app/lib/utils";
import { DataSourceType } from "@app/types/data_source";
import { PlanType } from "@app/types/plan";
import { UserType, WorkspaceType } from "@app/types/user";

const {
  GA_TRACKING_ID = "",
  NANGO_SLACK_CONNECTOR_ID = "",
  NANGO_NOTION_CONNECTOR_ID = "",
  NANGO_GOOGLE_DRIVE_CONNECTOR_ID = "",
  NANGO_PUBLIC_KEY = "",
  GITHUB_APP_URL = "",
} = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  plan: PlanType;
  readOnly: boolean;
  isAdmin: boolean;
  dataSource: DataSourceType;
  connector: ConnectorType | null;
  standardView: boolean;
  nangoConfig: {
    publicKey: string;
    slackConnectorId: string;
    notionConnectorId: string;
    googleDriveConnectorId: string;
  };
  githubAppUrl: string;
  gaTrackingId: string;
}> = async (context) => {
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);
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

  const dataSource = await getDataSource(auth, context.params?.name as string);
  if (!dataSource) {
    return {
      notFound: true,
    };
  }

  let connector: ConnectorType | null = null;
  if (dataSource.connectorId) {
    const connectorRes = await ConnectorsAPI.getConnector(
      dataSource.connectorId
    );
    if (connectorRes.isOk()) {
      connector = connectorRes.value;
    }
  }

  const readOnly = !auth.isBuilder();
  const isAdmin = auth.isAdmin();

  // `standardView` is used to force the presentation of a managed data source as a standard one so
  // that it can be explored.
  const standardView = !!context.query?.standardView;

  return {
    props: {
      user,
      owner,
      plan,
      readOnly,
      isAdmin,
      dataSource,
      connector,
      standardView,
      nangoConfig: {
        publicKey: NANGO_PUBLIC_KEY,
        slackConnectorId: NANGO_SLACK_CONNECTOR_ID,
        notionConnectorId: NANGO_NOTION_CONNECTOR_ID,
        googleDriveConnectorId: NANGO_GOOGLE_DRIVE_CONNECTOR_ID,
      },
      githubAppUrl: GITHUB_APP_URL,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

function StandardDataSourceView({
  owner,
  plan,
  readOnly,
  dataSource,
}: {
  owner: WorkspaceType;
  plan: PlanType;
  readOnly: boolean;
  dataSource: DataSourceType;
}) {
  const [limit] = useState(10);
  const [offset, setOffset] = useState(0);

  const { documents, total, isDocumentsLoading, isDocumentsError } =
    useDocuments(owner, dataSource, limit, offset);
  const [showDocumentsLimitPopup, setShowDocumentsLimitPopup] = useState(false);

  const [displayNameByDocId, setDisplayNameByDocId] = useState<
    Record<string, string>
  >({});

  const router = useRouter();

  useEffect(() => {
    if (!isDocumentsLoading && !isDocumentsError) {
      setDisplayNameByDocId(
        documents.reduce(
          (acc, doc) =>
            Object.assign(acc, {
              [doc.document_id]: getDisplayNameForDocument(doc),
            }),
          {}
        )
      );
    }
    if (isDocumentsError) {
      setDisplayNameByDocId({});
    }
  }, [documents, isDocumentsLoading, isDocumentsError]);

  let last = offset + limit;
  if (offset + limit > total) {
    last = total;
  }

  return (
    <div className="pt-6">
      <Page.Vertical align="stretch">
        <Page.SectionHeader
          title={`Data Source ${dataSource.name}`}
          description="Use this page to view and upload documents to your data source."
          action={
            readOnly
              ? undefined
              : {
                  label: "Settings",
                  variant: "tertiary",
                  icon: Cog6ToothIcon,
                  onClick: () => {
                    void router.push(
                      `/w/${owner.sId}/builder/data-sources/${dataSource.name}/settings`
                    );
                  },
                }
          }
        />

        <div className="mt-16 flex flex-row">
          <div className="flex flex-1">
            <div className="flex flex-col">
              <div className="flex flex-row">
                <div className="flex flex-initial gap-x-2">
                  <Button
                    variant="tertiary"
                    disabled={offset < limit}
                    onClick={() => {
                      if (offset >= limit) {
                        setOffset(offset - limit);
                      } else {
                        setOffset(0);
                      }
                    }}
                    label="Previous"
                  />
                  <Button
                    variant="tertiary"
                    label="Next"
                    disabled={offset + limit >= total}
                    onClick={() => {
                      if (offset + limit < total) {
                        setOffset(offset + limit);
                      }
                    }}
                  />
                </div>
              </div>

              <div className="mt-3 flex flex-auto pl-2 text-sm text-gray-700">
                {total > 0 && (
                  <span>
                    Showing documents {offset + 1} - {last} of {total} documents
                  </span>
                )}
              </div>
            </div>
          </div>

          {readOnly ? null : (
            <div className="">
              <div className="relative mt-0 flex-none">
                <Popup
                  show={showDocumentsLimitPopup}
                  chipLabel="Free plan"
                  description="You have reached the limit of documents per data source for the free plan. Upgrade to a paid plan to add more documents."
                  buttonLabel="Check Dust plans"
                  buttonClick={() => {
                    void router.push(`/w/${owner.sId}/subscription`);
                  }}
                  onClose={() => {
                    setShowDocumentsLimitPopup(false);
                  }}
                  className="absolute bottom-8 right-0"
                />

                <Button
                  variant="primary"
                  icon={PlusIcon}
                  label="Add document"
                  onClick={() => {
                    // Enforce plan limits: DataSource documents count.
                    if (
                      plan.limits.dataSources.documents.count != -1 &&
                      total >= plan.limits.dataSources.documents.count
                    ) {
                      setShowDocumentsLimitPopup(true);
                    } else {
                      void router.push(
                        `/w/${owner.sId}/builder/data-sources/${dataSource.name}/upsert`
                      );
                    }
                  }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="py-8">
          <ContextItem.List>
            {documents.map((d) => (
              <ContextItem
                key={d.document_id}
                title={displayNameByDocId[d.document_id]}
                visual={
                  <ContextItem.Visual
                    visual={({ className }) =>
                      DocumentTextIcon({
                        className: className + " text-element-600",
                      })
                    }
                  />
                }
                action={
                  <Button.List>
                    <Button
                      variant="secondary"
                      icon={PencilSquareIcon}
                      onClick={() => {
                        void router.push(
                          `/w/${owner.sId}/builder/data-sources/${
                            dataSource.name
                          }/upsert?documentId=${encodeURIComponent(
                            d.document_id
                          )}`
                        );
                      }}
                      label="Edit"
                      labelVisible={false}
                    />
                  </Button.List>
                }
              >
                <ContextItem.Description>
                  <div className="pt-2 text-sm text-element-700">
                    {Math.floor(d.text_size / 1024)} kb,{" "}
                    {timeAgoFrom(d.timestamp)} ago
                  </div>
                </ContextItem.Description>
              </ContextItem>
            ))}
          </ContextItem.List>
          {documents.length == 0 ? (
            <div className="mt-10 flex flex-col items-center justify-center text-sm text-gray-500">
              <p>No documents found for this Data Source.</p>
              <p className="mt-2">You can add documents manually or by API.</p>
            </div>
          ) : null}
        </div>
      </Page.Vertical>
    </div>
  );
}

function SlackBotEnableView({
  owner,
  readOnly,
  isAdmin,
  dataSource,
}: {
  owner: WorkspaceType;
  readOnly: boolean;
  isAdmin: boolean;
  dataSource: DataSourceType;
}) {
  const { botEnabled, mutateBotEnabled } = useConnectorBotEnabled({
    owner: owner,
    dataSource,
  });

  const sendNotification = useContext(SendNotificationsContext);

  const [loading, setLoading] = useState(false);

  const handleSetBotEnabled = async (botEnabled: boolean) => {
    setLoading(true);
    const res = await fetch(
      `/api/w/${owner.sId}/data_sources/${dataSource.name}/managed/bot_enabled`,
      {
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
        body: JSON.stringify({ botEnabled }),
      }
    );
    if (res.ok) {
      await mutateBotEnabled();
      setLoading(false);
    } else {
      setLoading(false);
      const err = (await res.json()) as { error: APIError };
      sendNotification({
        type: "error",
        title: "Failed to enable the Slack bot",
        description: err.error.message,
      });
    }
    return true;
  };

  return (
    <ContextItem.List>
      <ContextItem
        title="Slack Bot"
        visual={<ContextItem.Visual visual={SlackLogo} />}
        action={
          <SliderToggle
            size="sm"
            onClick={async () => {
              await handleSetBotEnabled(!botEnabled);
            }}
            selected={botEnabled || false}
            disabled={readOnly || !isAdmin || loading}
          />
        }
      >
        <ContextItem.Description>
          <div className="text-element-700">
            You can ask questions to your assistants directly from Slack by
            mentioning @Dust.
          </div>
        </ContextItem.Description>
      </ContextItem>
    </ContextItem.List>
  );
}

const CONNECTOR_TYPE_TO_HELPER_TEXT: Record<ConnectorProvider, string> = {
  notion: "Explore the Notion pages and databases Dust has access to.",
  google_drive: "Google Drive folders and files Dust has access to.",
  slack: "Slack channels synchronized with Dust:",
  github: "GitHub repositories Dust has access to.",
};

const CONNECTOR_TYPE_TO_MISMATCH_ERROR: Record<ConnectorProvider, string> = {
  slack: `You cannot select another Slack Team.\nPlease contact us at team@dust.tt if you initially selected the wrong Team.`,
  notion:
    "You cannot select another Notion Workspace.\nPlease contact us at team@dust.tt if you initially selected a wrong Workspace.",
  github:
    "You cannot select another Github Organization.\nPlease contact us at team@dust.tt if you initially selected a wrong Organization.",
  google_drive:
    "You cannot select another Google Drive Domain.\nPlease contact us at team@dust.tt if you initially selected a wrong shared Drive.",
};

function ManagedDataSourceView({
  owner,
  readOnly,
  isAdmin,
  dataSource,
  connector,
  nangoConfig,
  githubAppUrl,
}: {
  owner: WorkspaceType;
  readOnly: boolean;
  isAdmin: boolean;
  dataSource: DataSourceType;
  connector: ConnectorType;
  nangoConfig: {
    publicKey: string;
    slackConnectorId: string;
    notionConnectorId: string;
    googleDriveConnectorId: string;
  };
  githubAppUrl: string;
}) {
  const router = useRouter();

  const sendNotification = useContext(SendNotificationsContext);

  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [synchronizedTimeAgo, setSynchronizedTimeAgo] = useState<string | null>(
    null
  );

  const connectorProvider = dataSource.connectorProvider;
  if (!connectorProvider) {
    throw new Error("Connector provider is not defined");
  }

  useEffect(() => {
    if (
      typeof router.query.edit_permissions === "string" &&
      router.query.edit_permissions === "true"
    ) {
      // The edit_permissions flag directs users to the permissions editor modal.
      // To prevent it from reopening on page refresh,
      // we remove the flag from the URL and then display the modal.
      router
        .push(`/w/${owner.sId}/builder/data-sources/${dataSource.name}`)
        .then(() => {
          setShowPermissionModal(true);
        })
        .catch(console.error);
    }
  }, [dataSource.name, owner.sId, router]);

  useEffect(() => {
    if (connector.lastSyncSuccessfulTime)
      setSynchronizedTimeAgo(timeAgoFrom(connector.lastSyncSuccessfulTime));
  }, [connector.lastSyncSuccessfulTime]);

  const handleUpdatePermissions = async () => {
    if (!connector) {
      console.error("No connector");
      return;
    }
    const provider = connector.type;

    if (connectorIsUsingNango(provider)) {
      const nangoConnectorId = {
        slack: nangoConfig.slackConnectorId,
        notion: nangoConfig.notionConnectorId,
        google_drive: nangoConfig.googleDriveConnectorId,
      }[provider];

      const nango = new Nango({ publicKey: nangoConfig.publicKey });

      const newConnectionId = buildConnectionId(owner.sId, provider);
      await nango.auth(nangoConnectorId, newConnectionId);

      const updateRes = await updateConnectorConnectionId(
        newConnectionId,
        provider
      );
      if (updateRes.error) {
        sendNotification({
          type: "error",
          title: "Failed to update the permissions of the Data Source",
          description: updateRes.error,
        });
      }
    } else if (provider === "github") {
      const installationId = await githubAuth(githubAppUrl).catch((e) => {
        console.error(e);
      });

      if (!installationId) {
        sendNotification({
          type: "error",
          title: "Failed to update the Github permissions",
          description: "Please contact-us at team@dust.tt",
        });
      } else {
        const updateRes = await updateConnectorConnectionId(
          installationId,
          provider
        );
        if (updateRes.error) {
          sendNotification({
            type: "error",
            title: "Failed to update the permissions of the Data Source",
            description: updateRes.error,
          });
        }
      }
    }
  };

  const updateConnectorConnectionId = async (
    newConnectionId: string,
    provider: string
  ) => {
    const res = await fetch(
      `/api/w/${owner.sId}/data_sources/${dataSource.name}/managed/update`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ connectionId: newConnectionId }),
      }
    );

    if (res.ok) {
      return { success: true, error: null };
    }

    const jsonErr = await res.json();
    const error = jsonErr.error;

    if (error.type === "connector_oauth_target_mismatch") {
      return {
        success: false,
        error: CONNECTOR_TYPE_TO_MISMATCH_ERROR[provider as ConnectorProvider],
      };
    }
    return {
      success: false,
      error: `Failed to update the permissions of the Data Source: (contact team@dust.tt for assistance)`,
    };
  };

  return (
    <>
      <ConnectorPermissionsModal
        owner={owner}
        connector={connector}
        dataSource={dataSource}
        isOpen={showPermissionModal}
        setOpen={setShowPermissionModal}
      />
      <div className="flex flex-col pt-4">
        <Page.Header
          title={`Manage Dust access to ${CONNECTOR_CONFIGURATIONS[connectorProvider].name}`}
          icon={CONNECTOR_CONFIGURATIONS[connectorProvider].logoComponent}
        />
        <div className="pt-2">
          {(() => {
            if (connector.errorType) {
              return (
                <Chip color="warning">
                  Oops! It seems that our access to your account has been
                  revoked. Please re-authorize this Data Source to keep your
                  data up to date on Dust.
                </Chip>
              );
            } else if (!connector.lastSyncSuccessfulTime) {
              return (
                <Chip color="amber" isBusy>
                  Synchronizing
                  {connector?.firstSyncProgress
                    ? ` (${connector?.firstSyncProgress})`
                    : null}
                </Chip>
              );
            } else {
              return (
                <Chip color="slate">Last Sync ~ {synchronizedTimeAgo} ago</Chip>
              );
            }
          })()}
        </div>

        {isAdmin && (
          <>
            <div className="flex flex-row py-8">
              <Button.List>
                {(() => {
                  switch (connectorProvider) {
                    case "slack":
                    case "google_drive":
                      return (
                        <>
                          <Button
                            label="Add / Remove data"
                            variant="primary"
                            icon={ListCheckIcon}
                            disabled={readOnly || !isAdmin}
                            onClick={() => {
                              setShowPermissionModal(true);
                            }}
                          />
                          <Button
                            label="Manage permissions"
                            variant="secondary"
                            icon={LockIcon}
                            disabled={readOnly || !isAdmin}
                            onClick={() => {
                              void handleUpdatePermissions();
                            }}
                          />
                        </>
                      );
                    case "notion":
                    case "github":
                      return (
                        <Button
                          label="Add / Remove data, manage permissions"
                          variant="primary"
                          icon={ListCheckIcon}
                          onClick={() => {
                            void handleUpdatePermissions();
                          }}
                        />
                      );
                    default:
                      ((p: never) => {
                        throw new Error(`Unknown connector provider ${p}`);
                      })(connectorProvider);
                  }
                })()}
              </Button.List>
            </div>

            {connectorProvider === "slack" && (
              <SlackBotEnableView
                {...{ owner, readOnly, isAdmin, dataSource }}
              />
            )}
          </>
        )}

        <div className="pt-6">
          <div className="border-t border-structure-200" />
        </div>

        <div className="flex flex-col gap-y-8">
          <SectionHeader
            title="Synchronized data"
            description={CONNECTOR_TYPE_TO_HELPER_TEXT[connectorProvider]}
          />

          <div className="pb-8">
            <PermissionTree
              owner={owner}
              dataSource={dataSource}
              permissionFilter="read"
              showExpand={CONNECTOR_CONFIGURATIONS[connectorProvider]?.isNested}
            />
          </div>
        </div>
      </div>
    </>
  );
}

export default function DataSourceView({
  user,
  owner,
  plan,
  readOnly,
  isAdmin,
  dataSource,
  connector,
  standardView,
  nangoConfig,
  githubAppUrl,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();

  return (
    <AppLayout
      user={user}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="settings"
      subNavigation={subNavigationAdmin({
        owner,
        current: dataSource.connectorId
          ? "data_sources_managed"
          : "data_sources_static",
      })}
      titleChildren={
        <AppLayoutSimpleCloseTitle
          title={`Manage Data Source`}
          onClose={() => {
            if (dataSource.connectorId) {
              void router.push(`/w/${owner.sId}/builder/data-sources/managed`);
            } else {
              void router.push(`/w/${owner.sId}/builder/data-sources/static`);
            }
          }}
        />
      }
      hideSidebar={true}
    >
      {!standardView && dataSource.connectorId && connector ? (
        <ManagedDataSourceView
          {...{
            owner,
            readOnly,
            isAdmin,
            dataSource,
            connector,
            nangoConfig,
            githubAppUrl,
          }}
        />
      ) : (
        <StandardDataSourceView
          {...{ owner, plan, readOnly: readOnly || standardView, dataSource }}
        />
      )}
    </AppLayout>
  );
}
