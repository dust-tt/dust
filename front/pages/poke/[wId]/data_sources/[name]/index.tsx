import {
  Button,
  ContextItem,
  DocumentTextIcon,
  EyeIcon,
  Input,
  Page,
  SliderToggle,
} from "@dust-tt/sparkle";
import type {
  CoreAPIDataSource,
  DataSourceType,
  NotionCheckUrlResponseType,
} from "@dust-tt/types";
import type { WorkspaceType } from "@dust-tt/types";
import type { ConnectorType } from "@dust-tt/types";
import { ConnectorsAPI } from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";
import { JsonViewer } from "@textea/json-viewer";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

import { ViewDataSourceTable } from "@app/components/poke/data_sources/view";
import { PokePermissionTree } from "@app/components/poke/PokeConnectorPermissionsTree";
import PokeNavbar from "@app/components/poke/PokeNavbar";
import { getDataSource } from "@app/lib/api/data_sources";
import { useSubmitFunction } from "@app/lib/client/utils";
import { getDisplayNameForDocument } from "@app/lib/data_sources";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import { useDocuments } from "@app/lib/swr";
import { classNames, timeAgoFrom } from "@app/lib/utils";
import logger from "@app/logger/logger";

const { TEMPORAL_CONNECTORS_NAMESPACE = "" } = process.env;

export const getServerSideProps = withSuperUserAuthRequirements<{
  owner: WorkspaceType;
  dataSource: DataSourceType;
  coreDataSource: CoreAPIDataSource;
  connector: ConnectorType | null;
  features: {
    slackBotEnabled: boolean;
    googleDrivePdfEnabled: boolean;
    googleDriveLargeFilesEnabled: boolean;
    githubCodeSyncEnabled: boolean;
  };
  temporalWorkspace: string;
}>(async (context, auth) => {
  const owner = auth.workspace();

  if (!owner) {
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

  const dataSource = await getDataSource(auth, dataSourceName, {
    includeEditedBy: true,
  });
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
    googleDriveLargeFilesEnabled: boolean;
    githubCodeSyncEnabled: boolean;
  } = {
    slackBotEnabled: false,
    googleDrivePdfEnabled: false,
    googleDriveLargeFilesEnabled: false,
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

        const gdriveLargeFilesEnabledRes =
          await connectorsAPI.getConnectorConfig(
            dataSource.connectorId,
            "largeFilesEnabled"
          );
        if (gdriveLargeFilesEnabledRes.isErr()) {
          throw gdriveLargeFilesEnabledRes.error;
        }
        features.googleDriveLargeFilesEnabled =
          gdriveLargeFilesEnabledRes.value.configValue === "true";
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
});

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
            configValue: `${!features.slackBotEnabled}`,
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
        throw new Error("Failed to toggle Google Drive PDF sync.");
      }
      router.reload();
    } catch (e) {
      console.error(e);
      window.alert("Failed to toggle Google Drive PDF sync.");
    }
  });

  const { submit: onGdriveLargeFilesToggle } = useSubmitFunction(async () => {
    try {
      const r = await fetch(
        `/api/poke/workspaces/${owner.sId}/data_sources/managed-google_drive/config`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            configKey: "largeFilesEnabled",
            configValue: `${!features.googleDriveLargeFilesEnabled}`,
          }),
        }
      );
      if (!r.ok) {
        throw new Error("Failed to toggle Google Drive Large Files sync.");
      }
      router.reload();
    } catch (e) {
      console.error(e);
      window.alert("Failed to toggle Google Drive Large Files sync.");
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

  const onDisplayDocumentSource = (documentId: string) => {
    if (
      window.confirm(
        "Are you sure you want to access this sensible user data? (Access will be logged)"
      )
    ) {
      void router.push(
        `/poke/${owner.sId}/data_sources/${
          dataSource.name
        }/view?documentId=${encodeURIComponent(documentId)}`
      );
    }
  };

  const [notionUrlToCheck, setNotionUrlToCheck] = useState("");

  return (
    <div className="min-h-screen bg-structure-50">
      <PokeNavbar />
      <div className="mx-auto max-w-4xl">
        <div className="px-8 py-8"></div>
        <Page.Vertical align="stretch">
          <div className="flex flex-row gap-2">
            <Page.SectionHeader title={`${dataSource.name}`} />
            <div
              className="cursor-pointer text-sm text-action-500"
              onClick={() => {
                if (
                  window.confirm(
                    "Are you sure you want to access this sensible user data? (Access will be logged)"
                  )
                ) {
                  void router.push(
                    `/poke/${owner.sId}/data_sources/${dataSource.name}/search`
                  );
                }
              }}
            >
              search
            </div>
          </div>

          <div className="text-sm font-bold text-action-500">
            <Link href={`/poke/${owner.sId}`}>&laquo; workspace</Link>
          </div>

          <ViewDataSourceTable
            dataSource={dataSource}
            temporalWorkspace={temporalWorkspace}
            coreDataSource={coreDataSource}
            connector={connector}
          />

          {dataSource.connectorProvider === "slack" && (
            <div className="mb-2 flex w-64 items-center justify-between rounded-md border px-2 py-2 text-sm text-gray-600">
              <div>Slackbot enabled?</div>
              <SliderToggle
                selected={features.slackBotEnabled}
                onClick={onSlackbotToggle}
              />
            </div>
          )}
          {dataSource.connectorProvider === "notion" && (
            <NotionUrlChecker
              notionUrlToCheck={notionUrlToCheck}
              setNotionUrlToCheck={setNotionUrlToCheck}
              owner={owner}
            />
          )}
          {dataSource.connectorProvider === "google_drive" && (
            <>
              <div className="mb-2 flex w-64 items-center justify-between rounded-md border px-2 py-2 text-sm text-gray-600">
                <div>PDF syncing enabled?</div>
                <SliderToggle
                  selected={features.googleDrivePdfEnabled}
                  onClick={onGdrivePDFToggle}
                />
              </div>
              <div className="mb-2 flex w-64 items-center justify-between rounded-md border px-2 py-2 text-sm text-gray-600">
                <div>Large Files enabled?</div>
                <SliderToggle
                  selected={features.googleDriveLargeFilesEnabled}
                  onClick={onGdriveLargeFilesToggle}
                />
              </div>
            </>
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

          <div className="mt-4 flex flex-row">
            {!dataSource.connectorId && (
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
            )}
          </div>

          <div className="pb-8 pt-2">
            {!dataSource.connectorId ? (
              <>
                {" "}
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
                            onClick={() =>
                              onDisplayDocumentSource(d.document_id)
                            }
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
              </>
            ) : (
              <PokePermissionTree
                owner={owner}
                dataSource={dataSource}
                displayDocumentSource={onDisplayDocumentSource}
                permissionFilter="read"
              />
            )}
          </div>
        </Page.Vertical>
      </div>
    </div>
  );
};

async function handleCheckNotionUrl(
  url: string,
  wId: string
): Promise<NotionCheckUrlResponseType | null> {
  const res = await fetch(`/api/poke/admin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      majorCommand: "notion",
      command: "check-url",
      args: {
        url,
        wId,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    alert(
      `Failed to check Notion URL: ${
        err.error?.connectors_error?.message
      }\n\n${JSON.stringify(err)}`
    );
    return null;
  }
  return res.json();
}

function NotionUrlChecker({
  notionUrlToCheck,
  setNotionUrlToCheck,
  owner,
}: {
  notionUrlToCheck: string;
  setNotionUrlToCheck: (value: string) => void;
  owner: WorkspaceType;
}) {
  const [urlDetails, setUrlDetails] =
    useState<NotionCheckUrlResponseType | null>(null);
  return (
    <div className="mb-2 flex flex-col gap-2 rounded-md border px-2 py-2 text-sm text-gray-600">
      <div className="flex items-center gap-2 ">
        <div>Check Notion URL</div>
        <div className="grow">
          <Input
            placeholder="Notion URL"
            onChange={setNotionUrlToCheck}
            value={notionUrlToCheck}
            name={""}
          />
        </div>
        <Button
          variant="secondary"
          label="Check"
          onClick={async () =>
            setUrlDetails(
              await handleCheckNotionUrl(notionUrlToCheck, owner.sId)
            )
          }
        />
      </div>
      <div className="text-gray-800">
        <p>
          Check if we have access to the Notion URL, if it's a page or a DB, and
          provide a few details.
        </p>
        {urlDetails && (
          <div className="flex flex-col gap-2 rounded-md border pt-2 text-lg">
            <span
              className={classNames(
                "font-bold",
                urlDetails.page || urlDetails.db
                  ? "text-emerald-800"
                  : "text-red-800"
              )}
            >
              {(() => {
                if (urlDetails.page) {
                  return "Page found";
                }
                if (urlDetails.db) {
                  return "Database found";
                }
                return "Not found";
              })()}
            </span>
            {(urlDetails.page || urlDetails.db) && (
              <div>
                <span className="font-bold">Details:</span>{" "}
                <span>
                  {urlDetails.page ? (
                    <JsonViewer value={urlDetails.page} rootName={false} />
                  ) : (
                    <JsonViewer value={urlDetails.db} rootName={false} />
                  )}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default DataSourcePage;
