import {
  Button,
  ContextItem,
  DocumentTextIcon,
  EyeIcon,
  Page,
  SliderToggle,
} from "@dust-tt/sparkle";
import type { CoreAPIDataSource, DataSourceType } from "@dust-tt/types";
import type { WorkspaceType } from "@dust-tt/types";
import type { ConnectorType } from "@dust-tt/types";
import { ConnectorsAPI } from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";
import { JsonViewer } from "@textea/json-viewer";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

import PokeNavbar from "@app/components/poke/PokeNavbar";
import { getDataSource } from "@app/lib/api/data_sources";
import { Authenticator, getSession } from "@app/lib/auth";
import { useSubmitFunction } from "@app/lib/client/utils";
import { getDisplayNameForDocument } from "@app/lib/data_sources";
import { useDocuments } from "@app/lib/swr";
import { timeAgoFrom } from "@app/lib/utils";
import logger from "@app/logger/logger";

const { TEMPORAL_CONNECTORS_NAMESPACE = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  owner: WorkspaceType;
  dataSource: DataSourceType;
  coreDataSource: CoreAPIDataSource;
  connector: ConnectorType | null;
  features: {
    slackBotEnabled: boolean;
    googleDrivePdfEnabled: boolean;
    githubCodeSyncEnabled: boolean;
  };
  temporalWorkspace: string;
}> = async (context) => {
  const session = await getSession(context.req, context.res);
  const auth = await Authenticator.fromSuperUserSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();

  if (!owner || !auth.isDustSuperUser()) {
    return {
      notFound: true,
    };
  }

  const dataSourceName = context.params?.name;
  if (!dataSourceName || typeof dataSourceName !== "string") {
    return {
      notFound: true,
    };
  }

  const dataSource = await getDataSource(auth, dataSourceName);
  if (!dataSource) {
    return {
      notFound: true,
    };
  }

  const coreAPI = new CoreAPI(logger);
  const coreDataSourceRes = await coreAPI.getDataSource({
    projectId: dataSource.dustAPIProjectId,
    dataSourceId: dataSource.name,
  });

  if (coreDataSourceRes.isErr()) {
    return {
      notFound: true,
    };
  }

  let connector: ConnectorType | null = null;
  if (dataSource.connectorId) {
    const connectorsAPI = new ConnectorsAPI(logger);
    const connectorRes = await connectorsAPI.getConnector(
      dataSource.connectorId
    );
    if (connectorRes.isOk()) {
      connector = connectorRes.value;
    }
  }

  const features: {
    slackBotEnabled: boolean;
    googleDrivePdfEnabled: boolean;
    githubCodeSyncEnabled: boolean;
  } = {
    slackBotEnabled: false,
    googleDrivePdfEnabled: false,
    githubCodeSyncEnabled: false,
  };

  const connectorsAPI = new ConnectorsAPI(logger);
  if (dataSource.connectorId) {
    switch (dataSource.connectorProvider) {
      case "slack":
        const botEnabledRes = await connectorsAPI.getConnectorConfig(
          dataSource.connectorId,
          "botEnabled"
        );
        if (botEnabledRes.isErr()) {
          throw botEnabledRes.error;
        }
        features.slackBotEnabled = botEnabledRes.value.configValue === "true";
        break;
      case "google_drive":
        const gdrivePDFEnabledRes = await connectorsAPI.getConnectorConfig(
          dataSource.connectorId,
          "pdfEnabled"
        );
        if (gdrivePDFEnabledRes.isErr()) {
          throw gdrivePDFEnabledRes.error;
        }
        features.googleDrivePdfEnabled =
          gdrivePDFEnabledRes.value.configValue === "true";
        break;
      case "github":
        const githubConnectorEnabledRes =
          await connectorsAPI.getConnectorConfig(
            dataSource.connectorId,
            "codeSyncEnabled"
          );
        if (githubConnectorEnabledRes.isErr()) {
          throw githubConnectorEnabledRes.error;
        }
        features.githubCodeSyncEnabled =
          githubConnectorEnabledRes.value.configValue === "true";
        break;
    }
  }

  return {
    props: {
      owner,
      dataSource,
      coreDataSource: coreDataSourceRes.value.data_source,
      connector,
      features,
      temporalWorkspace: TEMPORAL_CONNECTORS_NAMESPACE,
    },
  };
};

const DataSourcePage = ({
  owner,
  dataSource,
  coreDataSource,
  connector,
  temporalWorkspace,
  features,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const [limit] = useState(10);
  const [offset, setOffset] = useState(0);

  const { documents, total, isDocumentsLoading, isDocumentsError } =
    useDocuments(owner, dataSource, limit, offset, true);

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

  const { submit: onSlackbotToggle } = useSubmitFunction(async () => {
    try {
      const r = await fetch(
        `/api/poke/workspaces/${owner.sId}/data_sources/managed-slack/config`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            configKey: "botEnabled",
            botEnabled: `${!features.slackBotEnabled}`,
          }),
        }
      );
      if (!r.ok) {
        throw new Error("Failed to toggle slackbot.");
      }
      router.reload();
    } catch (e) {
      console.error(e);
      window.alert("An error occurred while toggling slackbot.");
    }
  });

  const { submit: onGdrivePDFToggle } = useSubmitFunction(async () => {
    try {
      const r = await fetch(
        `/api/poke/workspaces/${owner.sId}/data_sources/managed-google_drive/config`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            configKey: "pdfEnabled",
            configValue: `${!features.googleDrivePdfEnabled}`,
          }),
        }
      );
      if (!r.ok) {
        throw new Error("Failed to toggle Gdrive PDF sync.");
      }
      router.reload();
    } catch (e) {
      console.error(e);
      window.alert("Failed to toggle Gdrive PDF sync.");
    }
  });

  const { submit: onGithubCodeSyncToggle } = useSubmitFunction(async () => {
    try {
      const r = await fetch(
        `/api/poke/workspaces/${owner.sId}/data_sources/managed-github/config`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            configKey: "codeSyncEnabled",
            configValue: `${!features.githubCodeSyncEnabled}`,
          }),
        }
      );
      if (!r.ok) {
        throw new Error("Failed to toggle slackbot.");
      }
      router.reload();
    } catch (e) {
      console.error(e);
      window.alert("An error occurred while toggling slackbot.");
    }
  });

  return (
    <div className="min-h-screen bg-structure-50">
      <PokeNavbar />
      <div className="mx-auto max-w-4xl">
        <div className="px-8 py-8"></div>
        <Page.Vertical align="stretch">
          <Page.SectionHeader title={`${dataSource.name}`} />
          <div className="text-sm font-bold text-action-500">
            <Link href={`/poke/${owner.sId}`}>&laquo; workspace</Link>
          </div>

          {dataSource.connectorId && (
            <div className="flex flex-col text-sm text-action-500">
              <Link
                href={`https://cloud.temporal.io/namespaces/${temporalWorkspace}/workflows?query=connectorId%3D%22${dataSource.connectorId}%22`}
              >
                Temporal: ConnectorId
              </Link>
              <Link
                href={`https://app.datadoghq.eu/logs?query=service%3Acore%20%22DSSTAT%20Finished%20searching%20Qdrant%20documents%22%20%22${coreDataSource.qdrant_collection}%22%20&cols=host%2Cservice&index=%2A&messageDisplay=inline&refresh_mode=sliding&stream_sort=desc&view=spans&viz=stream&live=true`}
              >
                Datadog: DSSTAT Qdrant search logs
              </Link>
            </div>
          )}

          <div className="my-4 flex flex-col gap-y-4">
            <JsonViewer value={dataSource} rootName={false} />
            <JsonViewer value={coreDataSource} rootName={false} />
            <JsonViewer value={connector} rootName={false} />
          </div>

          {dataSource.connectorProvider === "slack" && (
            <div className="mb-2 flex w-64 items-center justify-between rounded-md border px-2 py-2 text-sm text-gray-600">
              <div>Slackbot enabled?</div>
              <SliderToggle
                selected={features.slackBotEnabled}
                onClick={onSlackbotToggle}
              />
            </div>
          )}
          {dataSource.connectorProvider === "google_drive" && (
            <div className="mb-2 flex w-64 items-center justify-between rounded-md border px-2 py-2 text-sm text-gray-600">
              <div>PDF syncing enabled?</div>
              <SliderToggle
                selected={features.googleDrivePdfEnabled}
                onClick={onGdrivePDFToggle}
              />
            </div>
          )}
          {dataSource.connectorProvider === "github" && (
            <div className="mb-2 flex w-64 items-center justify-between rounded-md border px-2 py-2 text-sm text-gray-600">
              <div>Code sync enabled?</div>
              <SliderToggle
                selected={features.githubCodeSyncEnabled}
                onClick={onGithubCodeSyncToggle}
              />
            </div>
          )}

          <div>
            <p className="mb-2 text-sm font-bold text-gray-600">
              Last Sync Start:{" "}
              {connector?.lastSyncStartTime ? (
                timeAgoFrom(connector?.lastSyncStartTime)
              ) : (
                <span className="text-warning-500">never</span>
              )}
            </p>
            <p className="mb-2 text-sm font-bold text-gray-600">
              Last Sync Finish:{" "}
              {connector?.lastSyncFinishTime ? (
                timeAgoFrom(connector?.lastSyncFinishTime)
              ) : (
                <span className="text-warning-500">never</span>
              )}
            </p>
            <p className="mb-2 text-sm font-bold text-gray-600">
              Last Sync Status:{" "}
              {connector?.lastSyncStatus ? (
                connector?.lastSyncStatus
              ) : (
                <span className="text-warning-500">N/A</span>
              )}
            </p>
            <p className="mb-2 text-sm font-bold text-gray-600">
              Last Sync Success:{" "}
              {connector?.lastSyncSuccessfulTime ? (
                <span className="text-green-600">
                  {timeAgoFrom(connector?.lastSyncSuccessfulTime)}
                </span>
              ) : (
                <span className="text-warning-600">"Never"</span>
              )}
            </p>
          </div>

          <div className="mt-4 flex flex-row">
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
                      Showing documents {offset + 1} - {last} of {total}{" "}
                      documents
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="pb-8 pt-2">
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
                        icon={EyeIcon}
                        onClick={() => {
                          window.confirm(
                            "Are you sure you want to access this sensible user data? (Access will be logged)"
                          );
                          void router.push(
                            `/poke/${owner.sId}/data_sources/${
                              dataSource.name
                            }/view?documentId=${encodeURIComponent(
                              d.document_id
                            )}`
                          );
                        }}
                        label="View"
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
                <p>Empty</p>
              </div>
            ) : null}
          </div>
        </Page.Vertical>
      </div>
    </div>
  );
};

export default DataSourcePage;
