import {
  Button,
  Cog6ToothIcon,
  ContextItem,
  PlusIcon,
  SectionHeader,
  SlackLogo,
  SliderToggle,
} from "@dust-tt/sparkle";
import Nango from "@nangohq/frontend";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import Link from "next/link";
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
import {
  getDisplayNameForDocument,
  getProviderLogoPathForDataSource,
} from "@app/lib/data_sources";
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

  const [displayNameByDocId, setDisplayNameByDocId] = useState<
    Record<string, string>
  >({});

  const documentPoviderIconPath = getProviderLogoPathForDataSource(dataSource);

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
    <div className="flex flex-col">
      <SectionHeader
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
            <div className="mt-0 flex-none">
              <Button
                variant="primary"
                icon={PlusIcon}
                label="Document"
                onClick={() => {
                  // Enforce plan limits: DataSource documents count.
                  if (
                    plan.limits.dataSources.documents.count != -1 &&
                    total >= plan.limits.dataSources.documents.count
                  ) {
                    window.alert(
                      "Data Sources are limited to 32 documents on our free plan. Contact team@dust.tt if you want to increase this limit."
                    );
                    return;
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

      <div className="mt-8 overflow-hidden pb-8">
        <ul role="list" className="space-y-4">
          {documents.map((d) => (
            <li
              key={d.document_id}
              className="group rounded border border-gray-300 px-2 px-4"
            >
              <Link
                href={`/w/${owner.sId}/builder/data-sources/${
                  dataSource.name
                }/upsert?documentId=${encodeURIComponent(d.document_id)}`}
                className="block"
              >
                <div className="mx-2 py-4">
                  <div className="grid grid-cols-5 items-center justify-between">
                    <div className="col-span-4">
                      <div className="flex">
                        {documentPoviderIconPath ? (
                          <div className="mr-1.5 mt-1 flex h-4 w-4 flex-initial">
                            <img src={documentPoviderIconPath}></img>
                          </div>
                        ) : null}
                        <p className="truncate text-base font-bold text-action-600">
                          {displayNameByDocId[d.document_id]}
                        </p>
                      </div>
                    </div>
                    <div className="col-span-1">
                      <div className="ml-2 flex flex-row">
                        <div className="flex flex-1"></div>
                        <div className="mt-0 flex items-center">
                          <p className="text-sm text-gray-500">
                            {timeAgoFrom(d.timestamp)} ago
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex justify-between">
                    <div className="flex flex-initial">
                      <p className="text-sm text-gray-300">
                        {Math.floor(d.text_size / 1024)} kb / {d.chunk_count}{" "}
                        chunks{" "}
                      </p>
                    </div>
                  </div>
                </div>
              </Link>
            </li>
          ))}
          {documents.length == 0 ? (
            <div className="mt-10 flex flex-col items-center justify-center text-sm text-gray-500">
              <p>No documents found for this Data Source.</p>
              <p className="mt-2">
                You can upload documents manually or by API.
              </p>
            </div>
          ) : null}
        </ul>
      </div>
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
        window.alert(updateRes.error);
      }
    } else if (provider === "github") {
      const installationId = await githubAuth(githubAppUrl).catch((e) => {
        console.error(e);
      });

      if (!installationId) {
        window.alert(
          "Failed to update the Github permissions. Please contact-us at team@dust.tt"
        );
      } else {
        const updateRes = await updateConnectorConnectionId(
          installationId,
          provider
        );
        if (updateRes.error) {
          window.alert(updateRes.error);
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
        onEditPermission={() => {
          void handleUpdatePermissions();
        }}
      />
      <div className="flex flex-col">
        <SectionHeader
          title={`Managed ${CONNECTOR_CONFIGURATIONS[connectorProvider].name} Data Source`}
          description={
            synchronizedTimeAgo
              ? `Last Sync ~ ${synchronizedTimeAgo}`
              : `Synchronizing ${
                  connector.firstSyncProgress
                    ? `(${connector.firstSyncProgress})`
                    : ""
                }`
          }
        />
        <div className="flex flex-row py-8">
          <div className="flex flex-1"></div>
          <Button.List>
            <Button
              label="Search"
              variant="secondary"
              onClick={() => {
                void router.push(
                  `/w/${owner.sId}/builder/data-sources/${dataSource.name}/search`
                );
              }}
            />
            {isAdmin && (
              <Button
                label="Edit permissions"
                variant="secondary"
                onClick={() => {
                  if (["slack", "google_drive"].includes(connectorProvider)) {
                    setShowPermissionModal(true);
                  } else {
                    void handleUpdatePermissions();
                  }
                }}
              />
            )}
          </Button.List>
        </div>

        {connectorProvider === "slack" && (
          <SlackBotEnableView {...{ owner, readOnly, isAdmin, dataSource }} />
        )}

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
