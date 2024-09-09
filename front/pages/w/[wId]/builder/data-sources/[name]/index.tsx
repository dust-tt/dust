import {
  BookOpenIcon,
  Button,
  Cog6ToothIcon,
  ContextItem,
  Dialog,
  DocumentTextIcon,
  GithubLogo,
  IntercomLogo,
  ListCheckIcon,
  LockIcon,
  Page,
  PencilSquareIcon,
  PlusIcon,
  Popup,
  ServerIcon,
  SlackLogo,
  SliderToggle,
  Tab,
} from "@dust-tt/sparkle";
import type {
  ConnectorProvider,
  DataSourceType,
  PlanType,
  PostDataSourceDocumentRequestBody,
  SubscriptionType,
  UpdateConnectorRequestBody,
  UserType,
  WorkspaceType,
} from "@dust-tt/types";
import type { ConnectorType } from "@dust-tt/types";
import type { APIError } from "@dust-tt/types";
import { CONNECTOR_TYPE_TO_MISMATCH_ERROR } from "@dust-tt/types";
import { assertNever, Err, Ok } from "@dust-tt/types";
import { ConnectorsAPI } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import * as React from "react";

import { ConnectorPermissionsModal } from "@app/components/ConnectorPermissionsModal";
import { PermissionTree } from "@app/components/ConnectorPermissionsTree";
import { DataSourceEditionModal } from "@app/components/data_source/DataSourceEditionModal";
import ConnectorSyncingChip from "@app/components/data_source/DataSourceSyncChip";
import { DocumentLimitPopup } from "@app/components/data_source/DocumentLimitPopup";
import { subNavigationBuild } from "@app/components/navigation/config";
import AppLayout from "@app/components/sparkle/AppLayout";
import { AppLayoutSimpleCloseTitle } from "@app/components/sparkle/AppLayoutTitle";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { setupConnection } from "@app/components/vaults/AddConnectionMenu";
import config from "@app/lib/api/config";
import { getDataSource } from "@app/lib/api/data_sources";
import { handleFileUploadToText } from "@app/lib/client/handle_file_upload";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { getDisplayNameForDocument, isWebsite } from "@app/lib/data_sources";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { useConnectorConfig } from "@app/lib/swr/connectors";
import {
  useDataSourceDocuments,
  useDataSourceTables,
} from "@app/lib/swr/data_sources";
import { ClientSideTracking } from "@app/lib/tracking/client";
import { timeAgoFrom } from "@app/lib/utils";
import logger from "@app/logger/logger";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  plan: PlanType;
  readOnly: boolean;
  isAdmin: boolean;
  isBuilder: boolean;
  dataSource: DataSourceType;
  connector: ConnectorType | null;
  standardView: boolean;
  dustClientFacingUrl: string;
  gaTrackingId: string;
  user: UserType;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const plan = auth.plan();
  const subscription = auth.subscription();
  const user = auth.user();

  if (!owner || !plan || !subscription || !user) {
    return {
      notFound: true,
    };
  }

  const dataSource = await getDataSource(auth, context.params?.name as string, {
    includeEditedBy: true,
  });

  if (!dataSource) {
    return {
      notFound: true,
    };
  }

  let connector: ConnectorType | null = null;
  if (dataSource.connectorId) {
    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );
    const connectorRes = await connectorsAPI.getConnector(
      dataSource.connectorId
    );
    if (connectorRes.isOk()) {
      connector = connectorRes.value;
    }
  }

  const readOnly = !auth.isBuilder();
  const isAdmin = auth.isAdmin();
  const isBuilder = auth.isBuilder();

  // `standardView` is used to force the presentation of a managed data source as a standard one so
  // that it can be explored.
  const standardView = !!context.query?.standardView;

  return {
    props: {
      owner,
      subscription,
      plan,
      readOnly,
      isAdmin,
      isBuilder,
      dataSource: dataSource.toJSON(),
      connector,
      standardView,
      dustClientFacingUrl: config.getClientFacingUrl(),
      gaTrackingId: config.getGaTrackingId(),
      user,
    },
  };
});

const tabIds = ["documents", "tables"];

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
  const router = useRouter();

  type TabId = (typeof tabIds)[number];
  const [currentTab, setCurrentTab] = useState<TabId>("documents");
  const tabs = useMemo(
    () =>
      tabIds.map((tabId) => ({
        label: tabId.charAt(0).toUpperCase() + tabId.slice(1),
        id: tabId,
        current: currentTab === tabId,
      })),
    [currentTab]
  );

  useEffect(() => {
    if (router.query.tab === "tables") {
      setCurrentTab("tables");
      const newQuery = { ...router.query };
      delete newQuery.tab;
      void router.replace(
        {
          pathname: router.pathname,
          query: newQuery,
        },
        undefined,
        { shallow: true } // no reload
      );
    }
  }, [router]);

  return (
    <div className="pt-6">
      <Page.Vertical gap="xl" align="stretch">
        <Page.SectionHeader
          title={dataSource.name}
          description={
            "Use this page to view and upload documents and tables to your Folder."
          }
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

        <Tab tabs={tabs} setCurrentTab={setCurrentTab} />

        {currentTab === "documents" && (
          <DatasourceDocumentsTabView
            owner={owner}
            plan={plan}
            readOnly={readOnly}
            dataSource={dataSource}
            router={router}
          />
        )}
        {currentTab === "tables" && (
          <DatasourceTablesTabView
            owner={owner}
            readOnly={readOnly}
            dataSource={dataSource}
            router={router}
          />
        )}
      </Page.Vertical>
    </div>
  );
}

function DatasourceDocumentsTabView({
  owner,
  plan,
  readOnly,
  dataSource,
  router,
}: {
  owner: WorkspaceType;
  plan: PlanType;
  readOnly: boolean;
  dataSource: DataSourceType;
  router: ReturnType<typeof useRouter>;
}) {
  const [limit] = useState(10);
  const [offset, setOffset] = useState(0);

  const {
    documents,
    total,
    isDocumentsLoading,
    isDocumentsError,
    mutateDocuments,
  } = useDataSourceDocuments(owner, dataSource, limit, offset);
  const [showDocumentsLimitPopup, setShowDocumentsLimitPopup] = useState(false);

  const [displayNameByDocId, setDisplayNameByDocId] = useState<
    Record<string, string>
  >({});
  const sendNotification = useContext(SendNotificationsContext);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [bulkFilesUploading, setBulkFilesUploading] = useState<null | {
    total: number;
    completed: number;
  }>(null);

  const handleUpsert = async (text: string, documentId: string) => {
    const body: PostDataSourceDocumentRequestBody = {
      timestamp: null,
      parents: null,
      section: {
        prefix: null,
        content: text,
        sections: [],
      },
      text: null,
      source_url: undefined,
      tags: [],
      light_document_output: true,
      upsert_context: null,
      async: false,
    };

    try {
      const res = await fetch(
        `/api/w/${owner.sId}/data_sources/${
          dataSource.name
        }/documents/${encodeURIComponent(documentId)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }
      );

      if (!res.ok) {
        let errMsg = "";
        try {
          const data = await res.json();
          errMsg = data.error.message;
        } catch (e) {
          errMsg = "An error occurred while uploading your document.";
        }
        return new Err(errMsg);
      }
    } catch (e) {
      return new Err("An error occurred while uploading your document.");
    }

    return new Ok(null);
  };

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
    <Page.Vertical align="stretch">
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
              <DocumentLimitPopup
                isOpen={showDocumentsLimitPopup}
                plan={plan}
                onClose={() => setShowDocumentsLimitPopup(false)}
                owner={owner}
              />

              <>
                <Dialog
                  onCancel={() => {
                    //no-op as we can't cancel file upload
                  }}
                  onValidate={() => {
                    //no-op as we can't cancel file upload
                  }}
                  // isSaving is always true since we are showing this Dialog while
                  // uploading files only
                  isSaving={true}
                  isOpen={bulkFilesUploading !== null}
                  title={`Uploading files`}
                >
                  {bulkFilesUploading && (
                    <>
                      Processing files {bulkFilesUploading.completed} /{" "}
                      {bulkFilesUploading.total}
                    </>
                  )}
                </Dialog>
                <input
                  className="hidden"
                  type="file"
                  accept=".txt, .pdf, .md, .csv"
                  ref={fileInputRef}
                  multiple={true}
                  onChange={async (e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      const files = e.target.files;
                      ClientSideTracking.trackMultiFilesUploadUsed({
                        fileCount: files.length,
                        workspaceId: owner.sId,
                      });
                      let i = 0;
                      for (const file of files) {
                        setBulkFilesUploading({
                          total: files.length,
                          completed: i++,
                        });
                        try {
                          const uploadRes = await handleFileUploadToText(file);
                          if (uploadRes.isErr()) {
                            sendNotification({
                              type: "error",
                              title: `Error uploading document ${file.name}`,
                              description: uploadRes.error.message,
                            });
                          } else {
                            const upsertRes = await handleUpsert(
                              uploadRes.value.content,
                              file.name
                            );
                            if (upsertRes.isErr()) {
                              sendNotification({
                                type: "error",
                                title: `Error uploading document ${file.name}`,
                                description: upsertRes.error,
                              });
                            }
                          }
                        } catch (e) {
                          sendNotification({
                            type: "error",
                            title: "Error uploading document",
                            description: `An error occurred while uploading your documents.`,
                          });
                        }
                      }
                      setBulkFilesUploading(null);
                      await mutateDocuments();
                    }
                  }}
                ></input>

                <Button
                  className="mr-2"
                  variant="secondary"
                  icon={PlusIcon}
                  label="Upload multiples files"
                  onClick={() => {
                    fileInputRef.current?.click();
                  }}
                />
              </>

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
            <p>No documents found for this Folder.</p>
            <p className="mt-2">You can add documents manually or by API.</p>
          </div>
        ) : null}
      </div>
    </Page.Vertical>
  );
}

function DatasourceTablesTabView({
  owner,
  readOnly,
  dataSource,
  router,
}: {
  owner: WorkspaceType;
  readOnly: boolean;
  dataSource: DataSourceType;
  router: ReturnType<typeof useRouter>;
}) {
  const { tables } = useDataSourceTables({
    workspaceId: owner.sId,
    dataSourceName: dataSource.name,
  });

  return (
    <>
      <Page.Vertical align="stretch">
        <div className="mt-16 flex flex-row">
          <div className="flex flex-1">
            <div className="flex flex-col">
              <div className="flex flex-row">
                <div className="flex flex-initial gap-x-2">
                  <Button variant="tertiary" disabled={true} label="Previous" />
                  <Button variant="tertiary" label="Next" disabled={true} />
                </div>
              </div>
            </div>
          </div>
          {readOnly ? null : (
            <div className="">
              <div className="relative mt-0 flex-none">
                <Button
                  variant="primary"
                  icon={PlusIcon}
                  label="Add table"
                  onClick={() => {
                    void router.push(
                      `/w/${owner.sId}/builder/data-sources/${dataSource.name}/tables/upsert`
                    );
                  }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="py-8">
          <ContextItem.List>
            {tables.map((t, index) => (
              <ContextItem
                key={index}
                title={`${t.name} (${t.data_source_id})`}
                visual={
                  <ContextItem.Visual
                    visual={({ className }) =>
                      ServerIcon({
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
                          }/tables/upsert?tableId=${encodeURIComponent(
                            t.table_id
                          )}`
                        );
                      }}
                      label="Edit"
                      labelVisible={false}
                    />
                  </Button.List>
                }
              ></ContextItem>
            ))}
          </ContextItem.List>
          {tables.length == 0 ? (
            <div className="mt-10 flex flex-col items-center justify-center text-sm text-gray-500">
              <p>No tables found for this Folder.</p>
              <p className="mt-2">
                Tables let you create assistants that can query structured data
                from uploaded CSV files. You can add tables manually by clicking
                on the &quot;Add&nbsp;table&quot; button.
              </p>
            </div>
          ) : null}
        </div>
      </Page.Vertical>
    </>
  );
}

function SlackBotEnableView({
  owner,
  readOnly,
  isAdmin,
  dataSource,
  plan,
}: {
  owner: WorkspaceType;
  readOnly: boolean;
  isAdmin: boolean;
  dataSource: DataSourceType;
  plan: PlanType;
}) {
  const { configValue, mutateConfig } = useConnectorConfig({
    owner,
    dataSource,
    configKey: "botEnabled",
  });
  const botEnabled = configValue === "true";

  const sendNotification = useContext(SendNotificationsContext);
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showNoSlackBotPopup, setShowNoSlackBotPopup] = useState(false);

  const handleSetBotEnabled = async (botEnabled: boolean) => {
    setLoading(true);
    const res = await fetch(
      `/api/w/${owner.sId}/data_sources/${dataSource.name}/managed/config/botEnabled`,
      {
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
        body: JSON.stringify({ configValue: botEnabled.toString() }),
      }
    );
    if (res.ok) {
      await mutateConfig();
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
          <div className="relative">
            <SliderToggle
              size="xs"
              onClick={async () => {
                if (!plan.limits.assistant.isSlackBotAllowed) {
                  setShowNoSlackBotPopup(true);
                } else {
                  await handleSetBotEnabled(!botEnabled);
                }
              }}
              selected={botEnabled}
              disabled={readOnly || !isAdmin || loading}
            />
            <Popup
              show={showNoSlackBotPopup}
              className="absolute bottom-8 right-0"
              chipLabel={`${plan.name} plan`}
              description="Your plan does not allow for the Slack bot to be enabled. Upgrade your plan to chat with Dust assistants on Slack."
              buttonLabel="Check Dust plans"
              buttonClick={() => {
                void router.push(`/w/${owner.sId}/subscription`);
              }}
              onClose={() => {
                setShowNoSlackBotPopup(false);
              }}
            />
          </div>
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

function GithubCodeEnableView({
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
  const { configValue, mutateConfig } = useConnectorConfig({
    owner,
    dataSource,
    configKey: "codeSyncEnabled",
  });
  const codeSyncEnabled = configValue === "true";

  const sendNotification = useContext(SendNotificationsContext);
  const [loading, setLoading] = useState(false);

  const handleSetCodeSyncEnabled = async (codeSyncEnabled: boolean) => {
    setLoading(true);
    const res = await fetch(
      `/api/w/${owner.sId}/data_sources/${dataSource.name}/managed/config/codeSyncEnabled`,
      {
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
        body: JSON.stringify({ configValue: codeSyncEnabled.toString() }),
      }
    );
    if (res.ok) {
      await mutateConfig();
      setLoading(false);
    } else {
      setLoading(false);
      const err = (await res.json()) as { error: APIError };
      sendNotification({
        type: "error",
        title: "Failed to enable GitHub code sync",
        description: err.error.message,
      });
    }
    return true;
  };

  return (
    <ContextItem.List>
      <ContextItem
        title="Code Synchronization"
        visual={<ContextItem.Visual visual={GithubLogo} />}
        action={
          <div className="relative">
            <SliderToggle
              size="xs"
              onClick={async () => {
                await handleSetCodeSyncEnabled(!codeSyncEnabled);
              }}
              selected={codeSyncEnabled}
              disabled={readOnly || !isAdmin || loading}
            />
          </div>
        }
      >
        <ContextItem.Description>
          <div className="text-element-700">
            Your GitHub repositories code is synced with Dust every 8h.
          </div>
        </ContextItem.Description>
      </ContextItem>
    </ContextItem.List>
  );
}

function IntercomConfigView({
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
  const configKey = "intercomConversationsNotesSyncEnabled";
  const { configValue: syncNotesConfig, mutateConfig: mutateSyncNotesConfig } =
    useConnectorConfig({
      owner,
      dataSource,
      configKey,
    });
  const isSyncNotesEnabled = syncNotesConfig === "true";

  const sendNotification = useContext(SendNotificationsContext);
  const [loading, setLoading] = useState(false);

  const handleSetNewConfig = async (configValue: boolean) => {
    setLoading(true);
    const res = await fetch(
      `/api/w/${owner.sId}/data_sources/${dataSource.name}/managed/config/${configKey}`,
      {
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
        body: JSON.stringify({ configValue: configValue.toString() }),
      }
    );
    if (res.ok) {
      await mutateSyncNotesConfig();
      setLoading(false);
    } else {
      setLoading(false);
      const err = (await res.json()) as { error: APIError };
      sendNotification({
        type: "error",
        title: "Failed to edit Intercom Configuration",
        description: err.error.message,
      });
    }
    return true;
  };

  return (
    <ContextItem.List>
      <ContextItem
        title="Sync Intercom Notes from conversations"
        visual={<ContextItem.Visual visual={IntercomLogo} />}
        action={
          <div className="relative">
            <SliderToggle
              size="xs"
              onClick={async () => {
                await handleSetNewConfig(!isSyncNotesEnabled);
              }}
              selected={isSyncNotesEnabled}
              disabled={readOnly || !isAdmin || loading}
            />
          </div>
        }
      >
        <ContextItem.Description>
          <div className="text-element-700">
            If activated, Dust will also sync the notes from the conversations
            you've selected.
          </div>
        </ContextItem.Description>
      </ContextItem>
    </ContextItem.List>
  );
}

interface ConnectorUiConfig {
  displayAddDataButton: boolean;
  displayEditionModal: boolean;
  displayManageConnectionButton: boolean;
  addDataWithConnection: boolean;
  displayWebcrawlerSettingsButton: boolean;
  guideLink: string | null;
  postPermissionsUpdateMessage?: string;
}

function getRenderingConfigForConnectorProvider(
  connectorProvider: ConnectorProvider
): ConnectorUiConfig {
  const commonConfig = {
    addDataWithConnection: false,
    displayAddDataButton: true,
    displayManageConnectionButton: true,
    displayWebcrawlerSettingsButton: false,
  };

  switch (connectorProvider) {
    case "confluence":
    case "google_drive":
    case "microsoft":
      return {
        ...commonConfig,
        displayEditionModal: true,
        guideLink: CONNECTOR_CONFIGURATIONS[connectorProvider].guideLink,
      };

    case "slack":
    case "intercom":
      return {
        ...commonConfig,
        displayEditionModal: false,
        guideLink: CONNECTOR_CONFIGURATIONS[connectorProvider].guideLink,
      };
    case "notion":
      return {
        ...commonConfig,
        addDataWithConnection: true,
        displayEditionModal: true,
        displayManageConnectionButton: false,
        guideLink: CONNECTOR_CONFIGURATIONS[connectorProvider].guideLink,
        postPermissionsUpdateMessage:
          "We've taken your edits into account. Notion permission edits may take up to 24 hours to be reflected on your workspace.",
      };
    case "github":
      return {
        ...commonConfig,
        addDataWithConnection: true,
        displayEditionModal: true,
        displayManageConnectionButton: false,
        guideLink: CONNECTOR_CONFIGURATIONS[connectorProvider].guideLink,
      };
    case "webcrawler":
      return {
        addDataWithConnection: false,
        displayAddDataButton: false,
        displayEditionModal: false,
        displayManageConnectionButton: false,
        displayWebcrawlerSettingsButton: true,
        guideLink: CONNECTOR_CONFIGURATIONS[connectorProvider].guideLink,
      };
    default:
      assertNever(connectorProvider);
  }
}

function ManagedDataSourceView({
  owner,
  readOnly,
  isAdmin,
  isBuilder,
  dataSource,
  connector,
  dustClientFacingUrl,
  plan,
  user,
}: {
  owner: WorkspaceType;
  readOnly: boolean;
  isAdmin: boolean;
  isBuilder: boolean;
  dataSource: DataSourceType;
  connector: ConnectorType;
  dustClientFacingUrl: string;
  plan: PlanType;
  user: UserType;
}) {
  const router = useRouter();

  const sendNotification = useContext(SendNotificationsContext);

  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [showEditionModal, setShowEditionModal] = useState(false);

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
        body: JSON.stringify({
          connectionId: newConnectionId,
        } satisfies UpdateConnectorRequestBody),
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
      error: `Failed to update the permissions of the Data Source: (contact support@dust.tt for assistance)`,
    };
  };

  const {
    displayEditionModal,
    displayManageConnectionButton,
    addDataWithConnection,
    displayAddDataButton,
    displayWebcrawlerSettingsButton,
    guideLink,
    postPermissionsUpdateMessage,
  } = getRenderingConfigForConnectorProvider(connectorProvider);

  const [
    postPermissionsUpdateDialogIsOpen,
    setPostPermissionsUpdateDialogIsOpen,
  ] = useState(false);

  const handleUpdatePermissions = async () => {
    if (!connector) {
      console.error("No connector");
      return;
    }
    const provider = connector.type;

    const connectionIdRes = await setupConnection({
      dustClientFacingUrl,
      owner,
      provider,
    });
    if (connectionIdRes.isErr()) {
      sendNotification({
        type: "error",
        title: "Failed to update the permissions of the Data Source",
        description: connectionIdRes.error.message,
      });
      return;
    }

    const updateRes = await updateConnectorConnectionId(
      connectionIdRes.value,
      provider
    );
    if (updateRes.error) {
      sendNotification({
        type: "error",
        title: "Failed to update the permissions of the Data Source",
        description: updateRes.error,
      });
      return;
    }

    // If the update permission was successful show the post permission update dialog.
    postPermissionsUpdateMessage && setPostPermissionsUpdateDialogIsOpen(true);
  };

  return (
    <>
      {postPermissionsUpdateMessage && (
        <Dialog
          isOpen={postPermissionsUpdateDialogIsOpen}
          onCancel={() => setPostPermissionsUpdateDialogIsOpen(false)}
          onValidate={() => {
            setPostPermissionsUpdateDialogIsOpen(false);
          }}
          title="Permissions updated"
        >
          <span>{postPermissionsUpdateMessage}</span>
        </Dialog>
      )}
      <div className="flex flex-col pt-4">
        <div className="flex flex-row items-end">
          <Page.Header
            title={(() => {
              switch (connectorProvider) {
                case "confluence":
                case "slack":
                case "google_drive":
                case "github":
                case "notion":
                case "intercom":
                case "microsoft":
                  return `Manage Dust connection to ${CONNECTOR_CONFIGURATIONS[connectorProvider].name}`;
                case "webcrawler":
                  return `Manage Website`;
                default:
                  assertNever(connectorProvider);
              }
            })()}
            icon={CONNECTOR_CONFIGURATIONS[connectorProvider].logoComponent}
          />
          {isAdmin && displayManageConnectionButton ? (
            <Button
              className="ml-auto"
              label="Manage connection"
              variant="tertiary"
              icon={LockIcon}
              disabled={readOnly || !isAdmin}
              onClick={() => {
                if (displayEditionModal) {
                  setShowEditionModal(true);
                } else {
                  void handleUpdatePermissions();
                }
              }}
            />
          ) : (
            <></>
          )}
          {isBuilder && displayWebcrawlerSettingsButton ? (
            <Link
              className="ml-auto"
              href={`/w/${owner.sId}/builder/data-sources/${encodeURIComponent(
                dataSource.name
              )}/edit-public-url`}
            >
              <Button
                label="Settings"
                variant="tertiary"
                icon={LockIcon}
                disabled={readOnly || !isBuilder}
              />
            </Link>
          ) : (
            <></>
          )}
        </div>
        <div className="pt-2">
          <ConnectorSyncingChip
            initialState={connector}
            workspaceId={connector.workspaceId}
            dataSourceId={connector.dataSourceId}
          />
        </div>

        {isAdmin && (
          <>
            <div className="flex flex-col pb-4 pt-8">
              <Button.List>
                {displayAddDataButton && (
                  <Button
                    label={`${addDataWithConnection ? "Add / Remove data, manage permissions" : "Add / Remove data"}`}
                    variant="primary"
                    icon={ListCheckIcon}
                    disabled={readOnly}
                    onClick={() => {
                      if (!addDataWithConnection) {
                        setShowPermissionModal(true);
                      } else if (displayEditionModal) {
                        setShowEditionModal(true);
                      } else {
                        void handleUpdatePermissions();
                      }
                    }}
                  />
                )}
                {guideLink && (
                  <Button
                    label="Read our guide"
                    variant="tertiary"
                    icon={BookOpenIcon}
                    onClick={() => {
                      window.open(guideLink, "_blank");
                    }}
                  />
                )}
              </Button.List>
              <div className="pt-2 text-sm font-normal text-element-700">
                {(() => {
                  switch (connectorProvider) {
                    case "confluence":
                    case "google_drive":
                    case "slack":
                    case "github":
                    case "notion":
                    case "intercom":
                    case "microsoft":
                      return (
                        <>
                          Selected resources will be accessible to all members
                          of the workspace.
                          <br />
                          Changes may impact existing assistants.
                        </>
                      );
                    case "webcrawler":
                      return null;
                    default:
                      assertNever(connectorProvider);
                  }
                })()}
              </div>
            </div>

            {connectorProvider === "slack" && (
              <SlackBotEnableView
                {...{ owner, readOnly, isAdmin, dataSource, plan }}
              />
            )}
            {connectorProvider === "github" && (
              <GithubCodeEnableView
                {...{ owner, readOnly, isAdmin, dataSource }}
              />
            )}
            {connectorProvider === "intercom" && (
              <IntercomConfigView
                {...{ owner, readOnly, isAdmin, dataSource }}
              />
            )}
          </>
        )}

        <div className="pb-6 pt-2">
          <div className="border-t border-structure-200" />
        </div>

        <div className="flex flex-col gap-y-3">
          <Page.SectionHeader title="Synchronized data" />

          <div className="pb-8">
            <PermissionTree
              isSearchEnabled={false}
              owner={owner}
              dataSource={dataSource}
              permissionFilter="read"
              showExpand={CONNECTOR_CONFIGURATIONS[connectorProvider]?.isNested}
              viewType="documents"
            />
          </div>
        </div>
        <DataSourceEditionModal
          isOpen={showEditionModal}
          onClose={() => setShowEditionModal(false)}
          dataSource={dataSource}
          owner={owner}
          user={user}
          onEditPermissionsClick={() => {
            void handleUpdatePermissions();
          }}
          dustClientFacingUrl={dustClientFacingUrl}
        />
        <ConnectorPermissionsModal
          owner={owner}
          connector={connector}
          dataSource={dataSource}
          isOpen={showPermissionModal}
          onClose={() => setShowPermissionModal(false)}
          setShowEditionModal={setShowEditionModal}
          handleUpdatePermissions={handleUpdatePermissions}
          plan={plan}
          readOnly={false}
          isAdmin={isAdmin}
        />
      </div>
    </>
  );
}

export default function DataSourceView({
  owner,
  subscription,
  plan,
  readOnly,
  isAdmin,
  isBuilder,
  dataSource,
  connector,
  standardView,
  dustClientFacingUrl,
  gaTrackingId,
  user,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();

  return (
    <AppLayout
      subscription={subscription}
      owner={owner}
      gaTrackingId={gaTrackingId}
      subNavigation={subNavigationBuild({
        owner,
        current: dataSource.connectorId
          ? "data_sources_managed"
          : "data_sources_static",
      })}
      titleChildren={
        <AppLayoutSimpleCloseTitle
          title={`Manage ${dataSource.connectorId ? "Connection" : "Folder"}`}
          onClose={() => {
            if (dataSource.connectorId) {
              if (isWebsite(dataSource)) {
                void router.push(
                  `/w/${owner.sId}/builder/data-sources/public-urls`
                );
              } else {
                void router.push(
                  `/w/${owner.sId}/builder/data-sources/managed`
                );
              }
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
            isBuilder,
            dataSource,
            connector,
            dustClientFacingUrl,
            plan,
            user,
          }}
        />
      ) : (
        <StandardDataSourceView
          {...{
            owner,
            plan,
            readOnly: readOnly || standardView,
            dataSource,
          }}
        />
      )}
    </AppLayout>
  );
}
