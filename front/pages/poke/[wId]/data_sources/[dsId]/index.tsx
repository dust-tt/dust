import {
  Button,
  Chip,
  ContextItem,
  DocumentTextIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  EyeIcon,
  Input,
  LockIcon,
  MagnifyingGlassIcon,
  SliderToggle,
  Spinner,
  TableIcon,
  Tooltip,
} from "@dust-tt/sparkle";
import { JsonViewer } from "@textea/json-viewer";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import type { ReactElement } from "react-markdown/lib/react-markdown";

import { ViewDataSourceTable } from "@app/components/poke/data_sources/view";
import { PluginList } from "@app/components/poke/plugins/PluginList";
import { PokePermissionTree } from "@app/components/poke/PokeConnectorPermissionsTree";
import PokeLayout from "@app/components/poke/PokeLayout";
import { SlackChannelPatternInput } from "@app/components/poke/PokeSlackChannelPatternInput";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import config from "@app/lib/api/config";
import { Authenticator } from "@app/lib/auth";
import { useSubmitFunction } from "@app/lib/client/utils";
import { getDisplayNameForDocument } from "@app/lib/data_sources";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { getTemporalConnectorsNamespaceConnection } from "@app/lib/temporal";
import { classNames, timeAgoFrom } from "@app/lib/utils";
import logger from "@app/logger/logger";
import { usePokeDocuments, usePokeTables } from "@app/poke/swr";
import type {
  ConnectorType,
  CoreAPIDataSource,
  DataSourceType,
  GroupType,
  NotionCheckUrlResponseType,
  NotionFindUrlResponseType,
  SlackAutoReadPattern,
  SlackbotWhitelistType,
  WorkspaceType,
  ZendeskFetchTicketResponseType,
} from "@app/types";
import {
  ConnectorsAPI,
  CoreAPI,
  isSlackAutoReadPatterns,
  safeParseJSON,
} from "@app/types";

const { TEMPORAL_CONNECTORS_NAMESPACE = "" } = process.env;

type FeaturesType = {
  slackBotEnabled: boolean;
  googleDrivePdfEnabled: boolean;
  googleDriveLargeFilesEnabled: boolean;
  microsoftPdfEnabled: boolean;
  microsoftLargeFilesEnabled: boolean;
  googleDriveCsvEnabled: boolean;
  microsoftCsvEnabled: boolean;
  githubCodeSyncEnabled: boolean;
  githubUseProxyEnabled: boolean;
  autoReadChannelPatterns: SlackAutoReadPattern[];
};

export const getServerSideProps = withSuperUserAuthRequirements<{
  owner: WorkspaceType;
  dataSource: DataSourceType;
  coreDataSource: CoreAPIDataSource;
  connector: ConnectorType | null;
  features: FeaturesType;
  temporalWorkspace: string;
  temporalRunningWorkflows: {
    workflowId: string;
    runId: string;
    status: string;
  }[];
  groupsForSlackBot: GroupType[];
}>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();

  const { dsId } = context.params || {};
  if (typeof dsId !== "string") {
    return {
      notFound: true,
    };
  }

  const dataSource = await DataSourceResource.fetchById(auth, dsId, {
    includeEditedBy: true,
  });
  if (!dataSource) {
    return {
      notFound: true,
    };
  }

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  const coreDataSourceRes = await coreAPI.getDataSource({
    projectId: dataSource.dustAPIProjectId,
    dataSourceId: dataSource.dustAPIDataSourceId,
  });

  if (coreDataSourceRes.isErr()) {
    return {
      notFound: true,
    };
  }

  let connector: ConnectorType | null = null;
  const workflowInfos: { workflowId: string; runId: string; status: string }[] =
    [];
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
      const temporalClient = await getTemporalConnectorsNamespaceConnection();

      const res = temporalClient.workflow.list({
        query: `ExecutionStatus = 'Running' AND connectorId = ${connector.id}`,
      });

      for await (const infos of res) {
        workflowInfos.push({
          workflowId: infos.workflowId,
          runId: infos.runId,
          status: infos.status.name,
        });
      }
    }
  }

  const features: FeaturesType = {
    slackBotEnabled: false,
    googleDrivePdfEnabled: false,
    googleDriveLargeFilesEnabled: false,
    microsoftPdfEnabled: false,
    microsoftLargeFilesEnabled: false,
    googleDriveCsvEnabled: false,
    microsoftCsvEnabled: false,
    githubCodeSyncEnabled: false,
    githubUseProxyEnabled: false,
    autoReadChannelPatterns: [],
  };

  const connectorsAPI = new ConnectorsAPI(
    config.getConnectorsAPIConfig(),
    logger
  );
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

        const autoReadChannelPatternsRes =
          await connectorsAPI.getConnectorConfig(
            dataSource.connectorId,
            "autoReadChannelPatterns"
          );
        if (autoReadChannelPatternsRes.isErr()) {
          throw autoReadChannelPatternsRes.error;
        }

        const parsedAutoReadChannelPatternsRes = safeParseJSON(
          autoReadChannelPatternsRes.value.configValue
        );
        if (parsedAutoReadChannelPatternsRes.isErr()) {
          throw parsedAutoReadChannelPatternsRes.error;
        }

        if (
          !parsedAutoReadChannelPatternsRes.value ||
          !Array.isArray(parsedAutoReadChannelPatternsRes.value) ||
          !isSlackAutoReadPatterns(parsedAutoReadChannelPatternsRes.value)
        ) {
          throw new Error("Invalid auto read channel patterns");
        }

        features.autoReadChannelPatterns =
          parsedAutoReadChannelPatternsRes.value;
        break;

      case "google_drive":
        const gdrivePdfEnabledRes = await connectorsAPI.getConnectorConfig(
          dataSource.connectorId,
          "pdfEnabled"
        );
        if (gdrivePdfEnabledRes.isErr()) {
          throw gdrivePdfEnabledRes.error;
        }
        features.googleDrivePdfEnabled =
          gdrivePdfEnabledRes.value.configValue === "true";

        const gdriveCsvEnabledRes = await connectorsAPI.getConnectorConfig(
          dataSource.connectorId,
          "csvEnabled"
        );
        if (gdriveCsvEnabledRes.isErr()) {
          throw gdriveCsvEnabledRes.error;
        }
        features.googleDriveCsvEnabled =
          gdriveCsvEnabledRes.value.configValue === "true";

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

      case "microsoft":
        const microsoftPdfEnabledRes = await connectorsAPI.getConnectorConfig(
          dataSource.connectorId,
          "pdfEnabled"
        );
        if (microsoftPdfEnabledRes.isErr()) {
          throw microsoftPdfEnabledRes.error;
        }
        features.microsoftPdfEnabled =
          microsoftPdfEnabledRes.value.configValue === "true";

        const microsoftCsvEnabledRes = await connectorsAPI.getConnectorConfig(
          dataSource.connectorId,
          "csvEnabled"
        );
        if (microsoftCsvEnabledRes.isErr()) {
          throw microsoftCsvEnabledRes.error;
        }
        features.microsoftCsvEnabled =
          microsoftCsvEnabledRes.value.configValue === "true";

        const microsoftLargeFilesEnabledRes =
          await connectorsAPI.getConnectorConfig(
            dataSource.connectorId,
            "largeFilesEnabled"
          );
        if (microsoftLargeFilesEnabledRes.isErr()) {
          throw microsoftLargeFilesEnabledRes.error;
        }
        features.microsoftLargeFilesEnabled =
          microsoftLargeFilesEnabledRes.value.configValue === "true";
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

        const githubUseProxyRes = await connectorsAPI.getConnectorConfig(
          dataSource.connectorId,
          "useProxy"
        );
        if (githubUseProxyRes.isErr()) {
          throw githubUseProxyRes.error;
        }
        features.githubUseProxyEnabled =
          githubUseProxyRes.value.configValue === "true";
        break;
    }
  }

  // Getting groups that a Slack bot/workflow can be assigned to
  const authForSlackBot = await Authenticator.internalAdminForWorkspace(
    owner.sId
  );
  const groupsForSlackBot = (
    await GroupResource.listAllWorkspaceGroups(authForSlackBot)
  ).map((g) => g.toJSON());

  return {
    props: {
      owner,
      dataSource: dataSource.toJSON(),
      coreDataSource: coreDataSourceRes.value.data_source,
      connector,
      features,
      temporalWorkspace: TEMPORAL_CONNECTORS_NAMESPACE,
      temporalRunningWorkflows: workflowInfos,
      groupsForSlackBot,
    },
  };
});

const DataSourcePage = ({
  owner,
  dataSource,
  coreDataSource,
  connector,
  temporalWorkspace,
  temporalRunningWorkflows,
  features,
  groupsForSlackBot,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const [limit] = useState(10);
  const [offsetDocument, setOffsetDocument] = useState(0);
  const [offsetTable, setOffsetTable] = useState(0);

  const {
    documents,
    total: totalDocuments,
    isDocumentsLoading,
    isDocumentsError,
  } = usePokeDocuments(owner, dataSource, limit, offsetDocument);

  const { tables, total: totalTables } = usePokeTables(
    owner,
    dataSource,
    limit,
    offsetTable
  );

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

  let lastDocument = offsetDocument + limit;
  if (offsetDocument + limit > totalDocuments) {
    lastDocument = totalDocuments;
  }

  let lastTable = offsetTable + limit;
  if (offsetTable + limit > totalTables) {
    lastTable = totalTables;
  }

  const onDisplayDocumentSource = (documentId: string) => {
    if (
      window.confirm(
        "Are you sure you want to access this sensible user data? (Access will be logged)"
      )
    ) {
      window.open(
        `/poke/${owner.sId}/data_sources/${
          dataSource.sId
        }/view?documentId=${encodeURIComponent(documentId)}`
      );
    }
  };

  return (
    <>
      <h3 className="text-xl font-bold">
        Data Source: {dataSource.name} of workspace:{" "}
        <a href={`/poke/${owner.sId}`} className="text-highlight-500">
          {owner.name}
        </a>
      </h3>
      <p>
        The content source of truth is <b>connectors</b>.
      </p>

      <div className="flex flex-row gap-x-6">
        <ViewDataSourceTable
          dataSource={dataSource}
          temporalWorkspace={temporalWorkspace}
          coreDataSource={coreDataSource}
          connector={connector}
          temporalRunningWorkflows={temporalRunningWorkflows}
        />
        <div className="mt-4 flex grow flex-col gap-y-4">
          <PluginList
            pluginResourceTarget={{
              resourceId: dataSource.sId,
              resourceType: "data_sources",
              workspace: owner,
            }}
          />
          <div className="flex w-full items-center gap-3 p-4">
            <Button
              variant="outline"
              onClick={() => {
                if (
                  window.confirm(
                    "Are you sure you want to access this sensible user data? (Access will be logged)"
                  )
                ) {
                  void router.push(
                    `/poke/${owner.sId}/data_sources/${dataSource.sId}/search`
                  );
                }
              }}
              label="Search Data"
              icon={LockIcon}
            />
            {dataSource.connectorProvider === "slack" && (
              <ConfigToggle
                title="Slackbot enabled?"
                owner={owner}
                features={features}
                dataSource={dataSource}
                configKey="botEnabled"
                featureKey="slackBotEnabled"
              />
            )}
            {dataSource.connectorProvider === "notion" && (
              <NotionUrlCheckOrFind owner={owner} dsId={dataSource.sId} />
            )}
            {dataSource.connectorProvider === "zendesk" && (
              <ZendeskTicketCheck owner={owner} dsId={dataSource.sId} />
            )}
            {dataSource.connectorProvider === "google_drive" && (
              <>
                <ConfigToggle
                  title="PDF syncing enabled?"
                  owner={owner}
                  features={features}
                  dataSource={dataSource}
                  configKey="pdfEnabled"
                  featureKey="googleDrivePdfEnabled"
                />
                <ConfigToggle
                  title="CSV syncing enabled?"
                  owner={owner}
                  features={features}
                  dataSource={dataSource}
                  configKey="csvEnabled"
                  featureKey="googleDriveCsvEnabled"
                />

                <ConfigToggle
                  title="Large Files enabled?"
                  owner={owner}
                  features={features}
                  dataSource={dataSource}
                  configKey="largeFilesEnabled"
                  featureKey="googleDriveLargeFilesEnabled"
                />
              </>
            )}
            {dataSource.connectorProvider === "microsoft" && (
              <>
                <ConfigToggle
                  title="Pdf syncing enabled?"
                  owner={owner}
                  features={features}
                  dataSource={dataSource}
                  configKey="pdfEnabled"
                  featureKey="microsoftPdfEnabled"
                />
                <ConfigToggle
                  title="CSV syncing enabled?"
                  owner={owner}
                  features={features}
                  dataSource={dataSource}
                  configKey="csvEnabled"
                  featureKey="microsoftCsvEnabled"
                />
                <ConfigToggle
                  title="Large Files enabled?"
                  owner={owner}
                  features={features}
                  dataSource={dataSource}
                  configKey="largeFilesEnabled"
                  featureKey="microsoftLargeFilesEnabled"
                />
              </>
            )}
            {dataSource.connectorProvider === "github" && (
              <>
                <ConfigToggle
                  title="Code sync enabled?"
                  owner={owner}
                  features={features}
                  dataSource={dataSource}
                  configKey="codeSyncEnabled"
                  featureKey="githubCodeSyncEnabled"
                />
                <ConfigToggle
                  title="Use proxy?"
                  owner={owner}
                  features={features}
                  dataSource={dataSource}
                  configKey="useProxy"
                  featureKey="githubUseProxyEnabled"
                />
              </>
            )}
          </div>
          {dataSource.connectorProvider === "slack" && (
            <>
              <SlackWhitelistBot
                owner={owner}
                connectorId={connector?.id}
                groups={groupsForSlackBot}
              />
              <div className="border-material-200 mb-4 flex flex-grow flex-col rounded-lg border p-4">
                <SlackChannelPatternInput
                  initialValues={features.autoReadChannelPatterns || ""}
                  owner={owner}
                  dataSource={dataSource}
                />
              </div>
            </>
          )}
          {!dataSource.connectorId ? (
            <>
              <div className="mt-4 flex flex-row">
                <div className="flex flex-1">
                  <div className="flex flex-col">
                    <div className="flex flex-row">
                      <div className="flex flex-initial gap-x-2">
                        <Button
                          variant="ghost"
                          disabled={offsetDocument < limit}
                          onClick={() => {
                            if (offsetDocument >= limit) {
                              setOffsetDocument(offsetDocument - limit);
                            } else {
                              setOffsetDocument(0);
                            }
                          }}
                          label="Previous"
                        />
                        <Button
                          variant="ghost"
                          label="Next"
                          disabled={offsetDocument + limit >= totalDocuments}
                          onClick={() => {
                            if (offsetDocument + limit < totalDocuments) {
                              setOffsetDocument(offsetDocument + limit);
                            }
                          }}
                        />
                      </div>
                    </div>

                    <div className="mt-3 flex flex-auto pl-2 text-sm text-gray-700">
                      {totalDocuments > 0 && (
                        <span>
                          Showing documents {offsetDocument + 1} -{" "}
                          {lastDocument} of {totalDocuments} documents
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-material-200 mb-4 flex flex-grow flex-col rounded-lg border p-4">
                {documents.length > 0 ? (
                  <ContextItem.List>
                    {documents.map((d) => (
                      <ContextItem
                        key={d.document_id}
                        title={displayNameByDocId[d.document_id]}
                        visual={
                          <ContextItem.Visual
                            visual={({ className }) =>
                              DocumentTextIcon({
                                className:
                                  className +
                                  " text-muted-foreground dark:text-muted-foreground-night",
                              })
                            }
                          />
                        }
                        action={
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              icon={EyeIcon}
                              onClick={() =>
                                onDisplayDocumentSource(d.document_id)
                              }
                              tooltip="View"
                            />
                          </div>
                        }
                      >
                        <ContextItem.Description>
                          <div className="pt-2 text-sm text-muted-foreground">
                            {Math.floor(d.text_size / 1024)} kb,{" "}
                            {timeAgoFrom(d.timestamp)} ago
                          </div>
                        </ContextItem.Description>
                      </ContextItem>
                    ))}
                  </ContextItem.List>
                ) : (
                  <div className="mt-10 flex flex-col items-center justify-center text-sm text-gray-500">
                    <p>Empty</p>
                  </div>
                )}
              </div>

              <div className="mt-4 flex flex-row">
                <div className="flex flex-1">
                  <div className="flex flex-col">
                    <div className="flex flex-row">
                      <div className="flex flex-initial gap-x-2">
                        <Button
                          variant="ghost"
                          disabled={offsetTable < limit}
                          onClick={() => {
                            if (offsetTable >= limit) {
                              setOffsetTable(offsetTable - limit);
                            } else {
                              setOffsetTable(0);
                            }
                          }}
                          label="Previous"
                        />
                        <Button
                          variant="ghost"
                          label="Next"
                          disabled={offsetTable + limit >= totalTables}
                          onClick={() => {
                            if (offsetTable + limit < totalTables) {
                              setOffsetTable(offsetTable + limit);
                            }
                          }}
                        />
                      </div>
                    </div>

                    <div className="mt-3 flex flex-auto pl-2 text-sm text-gray-700">
                      {totalDocuments > 0 && (
                        <span>
                          Showing tables {offsetTable + 1} - {lastTable} of{" "}
                          {totalTables} tables
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-material-200 mb-4 flex flex-grow flex-col rounded-lg border p-4">
                {tables.length > 0 ? (
                  <ContextItem.List>
                    {tables.map((t) => (
                      <ContextItem
                        key={t.table_id}
                        title={t.name}
                        visual={
                          <ContextItem.Visual
                            visual={({ className }) =>
                              TableIcon({
                                className:
                                  className +
                                  " text-muted-foreground dark:text-muted-foreground-night",
                              })
                            }
                          />
                        }
                      >
                        <ContextItem.Description>
                          <div className="pt-2 text-sm text-muted-foreground">
                            {timeAgoFrom(t.timestamp)} ago
                          </div>
                        </ContextItem.Description>
                      </ContextItem>
                    ))}
                  </ContextItem.List>
                ) : (
                  <div className="mt-10 flex flex-col items-center justify-center text-sm text-gray-500">
                    <p>Empty</p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <PokePermissionTree
              owner={owner}
              dataSource={dataSource}
              onDocumentViewClick={onDisplayDocumentSource}
              permissionFilter="read"
            />
          )}
        </div>
      </div>
    </>
  );
};

DataSourcePage.getLayout = (
  page: ReactElement,
  { owner, dataSource }: { owner: WorkspaceType; dataSource: DataSourceType }
) => {
  return (
    <PokeLayout title={`${owner.name} - ${dataSource.name}`}>{page}</PokeLayout>
  );
};

async function handleCheckOrFindNotionUrl(
  url: string,
  wId: string,
  dsId: string,
  command: "check-url" | "find-url"
): Promise<NotionCheckUrlResponseType | NotionFindUrlResponseType | null> {
  const res = await fetch(`/api/poke/admin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      majorCommand: "notion",
      command,
      args: {
        url,
        wId,
        dsId,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    alert(
      `Failed to ${command} Notion URL: ${
        err.error?.connectors_error?.message
      }\n\n${JSON.stringify(err)}`
    );
    return null;
  }
  return res.json();
}

async function handleCheckZendeskTicket(
  args:
    | { brandId: number; ticketId: number; wId: string; dsId: string }
    | { ticketUrl: string; wId: string; dsId: string }
): Promise<ZendeskFetchTicketResponseType | null> {
  const res = await fetch(`/api/poke/admin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      majorCommand: "zendesk",
      command: "fetch-ticket",
      args,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    alert(
      `Failed to check Zendesk ticket: ${
        err.error?.connectors_error?.message
      }\n\n${JSON.stringify(err)}`
    );
    return null;
  }
  return res.json();
}

async function handleWhitelistBot({
  botName,
  wId,
  groupId,
  whitelistType,
}: {
  botName: string;
  wId: string;
  groupId: string;
  whitelistType: SlackbotWhitelistType;
}): Promise<void> {
  const res = await fetch(`/api/poke/admin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      majorCommand: "slack",
      command: "whitelist-bot",
      args: {
        botName,
        wId,
        groupId,
        whitelistType,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    alert(
      `Failed to whitelist bot: ${
        err.error?.connectors_error?.message
      }\n\n${JSON.stringify(err)}`
    );
    return;
  }
  alert("Bot whitelisted successfully");
}

function NotionUrlCheckOrFind({
  owner,
  dsId,
}: {
  owner: WorkspaceType;
  dsId: string;
}) {
  const { isDark } = useTheme();
  const [notionUrl, setNotionUrl] = useState("");
  const [urlDetails, setUrlDetails] = useState<
    NotionCheckUrlResponseType | NotionFindUrlResponseType | null
  >(null);
  const [command, setCommand] = useState<"check-url" | "find-url" | null>(
    "check-url"
  );

  return (
    <div className="mb-2 flex flex-col gap-2 rounded-md border px-2 py-2 text-sm text-gray-600">
      <div className="flex items-center gap-2">
        <div>Notion URL</div>
        <div className="grow">
          <Input
            placeholder="Notion URL"
            onChange={(e) => setNotionUrl(e.target.value)}
            value={notionUrl}
          />
        </div>
        <Button
          variant="outline"
          label="Check"
          onClick={async () => {
            setCommand("check-url");
            setUrlDetails(
              await handleCheckOrFindNotionUrl(
                notionUrl,
                owner.sId,
                dsId,
                "check-url"
              )
            );
          }}
        />
        <Button
          variant="outline"
          label="Find"
          onClick={async () => {
            setCommand("find-url");
            setUrlDetails(
              await handleCheckOrFindNotionUrl(
                notionUrl,
                owner.sId,
                dsId,
                "find-url"
              )
            );
          }}
        />
      </div>
      <div className="text-gray-800">
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
                    <>
                      <JsonViewer
                        theme={isDark ? "dark" : "light"}
                        value={urlDetails.page}
                        rootName={false}
                      />
                      {command === "find-url" && (
                        <div>
                          {urlDetails.page.parentType === "page" && (
                            <>
                              <span className="font-bold text-emerald-800">
                                Parent URL:
                              </span>
                              <span className="pl-2">
                                {` https://www.notion.so/${(
                                  urlDetails.page.parentId as string
                                ).replaceAll("-", "")}`}
                              </span>
                            </>
                          )}
                          {urlDetails.page.parentType === "database" && (
                            <>
                              <span className="font-bold text-emerald-800">
                                Parent URL:
                              </span>
                              <span className="pl-2">
                                {` https://www.notion.so/${(
                                  urlDetails.page.parentId as string
                                ).replaceAll("-", "")}`}
                              </span>
                            </>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <JsonViewer
                        theme={isDark ? "dark" : "light"}
                        value={urlDetails.db}
                        rootName={false}
                      />
                      {command === "find-url" && (
                        <div>
                          {urlDetails.db?.parentType === "page" && (
                            <>
                              <span className="font-bold text-emerald-800">
                                Parent URL:
                              </span>
                              <span className="pl-2">
                                {`https://www.notion.so/${(
                                  urlDetails.db?.parentId as string
                                ).replaceAll("-", "")}`}
                              </span>
                            </>
                          )}
                          {urlDetails.db?.parentType === "database" && (
                            <>
                              <span className="font-bold text-emerald-800">
                                Parent URL:
                              </span>
                              <span className="pl-2">
                                {` https://www.notion.so/${(
                                  urlDetails.db?.parentId as string
                                ).replaceAll("-", "")}`}
                              </span>
                            </>
                          )}
                        </div>
                      )}
                    </>
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

function ZendeskTicketCheck({
  owner,
  dsId,
}: {
  owner: WorkspaceType;
  dsId: string;
}) {
  const { isDark } = useTheme();
  const [brandId, setBrandId] = useState<number | null>(null);
  const [ticketId, setTicketId] = useState<number | null>(null);
  const [ticketUrl, setTicketUrl] = useState<string | null>(null);

  const [ticketDetails, setTicketDetails] =
    useState<ZendeskFetchTicketResponseType | null>(null);

  const [idsIsLoading, setIdsIsLoading] = useState(false);
  const [urlIsLoading, setUrlIsLoading] = useState(false);

  return (
    <div className="mb-2 flex flex-col gap-2 rounded-md border px-2 py-2 text-sm text-gray-600">
      <div className="ml-2 flex items-center gap-2">
        <div className="w-32">Brand / Ticket IDs</div>
        <div className="flex max-w-md grow items-center gap-4">
          <div className="flex-1">
            <Input
              type="number"
              placeholder="Brand ID"
              onChange={(e) => setBrandId(parseInt(e.target.value, 10))}
              value={brandId?.toString()}
            />
          </div>
          <div className="text-center text-gray-600">/</div>
          <div className="flex-1">
            <Input
              type="number"
              placeholder="Ticket ID"
              onChange={(e) => setTicketId(parseInt(e.target.value, 10))}
              value={ticketId?.toString()}
            />
          </div>
        </div>
        <Button
          variant="outline"
          icon={idsIsLoading ? Spinner : MagnifyingGlassIcon}
          label={idsIsLoading ? undefined : "Check"}
          disabled={!ticketId || !brandId || idsIsLoading}
          onClick={async () => {
            if (brandId && ticketId) {
              setIdsIsLoading(true);
              setTicketDetails(
                await handleCheckZendeskTicket({
                  brandId,
                  ticketId,
                  wId: owner.sId,
                  dsId,
                })
              );
              setIdsIsLoading(false);
            }
          }}
        />
      </div>
      <div className="ml-2 mt-4 flex items-center gap-2">
        <div className="w-32">Ticket URL</div>
        <div className="max-w-md flex-1 grow items-center gap-4">
          <Input
            type="text"
            placeholder="https://{subdomain}.zendesk.com/tickets/{ticket_id}"
            onChange={(e) => setTicketUrl(e.target.value)}
            value={ticketUrl ?? ""}
          />
        </div>
        <Button
          variant="outline"
          icon={urlIsLoading ? Spinner : MagnifyingGlassIcon}
          label={urlIsLoading ? undefined : "Check"}
          disabled={!ticketUrl || urlIsLoading}
          onClick={async () => {
            if (ticketUrl) {
              setUrlIsLoading(true);
              setTicketDetails(
                await handleCheckZendeskTicket({
                  ticketUrl,
                  wId: owner.sId,
                  dsId,
                })
              );
              setUrlIsLoading(false);
            }
          }}
        />
      </div>
      <div className="text-gray-800">
        {ticketDetails && (
          <div className="flex flex-col gap-2 rounded-md border pt-2 text-lg">
            <div className="mb-4 ml-4 mt-2 flex gap-2">
              <Tooltip
                label={
                  ticketDetails.isTicketOnDb
                    ? "The ticket is synced with Dust."
                    : "The ticket is not synced with Dust."
                }
                className="max-w-md"
                trigger={
                  <Chip
                    label={ticketDetails.isTicketOnDb ? "Synced" : "Not synced"}
                    color={ticketDetails.isTicketOnDb ? "purple" : "pink"}
                  />
                }
              />
              <Tooltip
                label={
                  ticketDetails.ticket
                    ? "The ticket can be found on Zendesk."
                    : ticketUrl
                      ? "The URL is malformed or does not lead to an existing ticket."
                      : "The ticket or the brand was not found."
                }
                className="max-w-md"
                trigger={
                  <Chip
                    label={ticketDetails.ticket ? "Found" : "Not Found"}
                    color={ticketDetails.ticket ? "emerald" : "warning"}
                  />
                }
              />
            </div>
            {ticketDetails.ticket && (
              <div className="ml-4 pt-2 text-xs text-muted-foreground">
                <div className="mb-1 font-bold">Details</div>
                <JsonViewer
                  theme={isDark ? "dark" : "light"}
                  value={ticketDetails.ticket}
                  rootName={false}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const ConfigToggle = ({
  title,
  owner,
  features,
  featureKey,
  configKey,
  dataSource,
}: {
  title: string;
  owner: WorkspaceType;
  features: FeaturesType;
  featureKey: keyof FeaturesType;
  configKey: string;
  dataSource: DataSourceType;
}) => {
  const router = useRouter();

  const { isSubmitting, submit: onToggle } = useSubmitFunction(async () => {
    try {
      const r = await fetch(
        `/api/poke/workspaces/${owner.sId}/data_sources/${dataSource.sId}/config`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            configKey,
            configValue: `${!features[featureKey]}`,
          }),
        }
      );
      if (!r.ok) {
        throw new Error(`Failed to toggle ${configKey}.`);
      }
      router.reload();
    } catch (e) {
      console.error(e);
      window.alert(`An error occurred while toggling ${configKey}.`);
    }
  });

  const value = features[featureKey] as boolean;

  return (
    <div className="flex w-64 items-center justify-between rounded-md border px-2 py-2 text-sm text-gray-600">
      <div>{title}</div>
      <SliderToggle
        selected={value}
        onClick={onToggle}
        disabled={isSubmitting}
      />
    </div>
  );
};

function SlackWhitelistBot({
  owner,
  connectorId,
  groups,
}: {
  owner: WorkspaceType;
  connectorId?: string;
  groups: GroupType[];
}) {
  const [botName, setBotName] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  const selectedGroupName = groups.find(
    (group) => group.sId === selectedGroup
  )?.name;

  return (
    <div className="mb-2 flex flex-col gap-2 rounded-md border px-2 py-2 text-sm text-gray-600">
      <div className="flex items-center gap-2">
        <div>Whitelist slack bot or workflow</div>
      </div>
      <div className="flex items-center gap-2">
        <div className="grow">
          <Input
            placeholder="Bot or workflow name"
            onChange={(e) => setBotName(e.target.value)}
            value={botName}
          />
        </div>
        <div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                label={selectedGroupName ?? "Select a group"}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuRadioGroup
                value={selectedGroup ?? undefined}
                onValueChange={setSelectedGroup}
              >
                {groups.map((group) => (
                  <DropdownMenuRadioItem
                    value={group.sId}
                    key={group.sId}
                    label={group.name}
                    className="p-1"
                  />
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Button
          variant="outline"
          label="Whitelist"
          onClick={async () => {
            if (!botName) {
              alert("Please enter a bot name");
              return;
            }
            if (!selectedGroup) {
              alert("Please select a group");
              return;
            }
            await handleWhitelistBot({
              botName,
              wId: owner.sId,
              groupId: selectedGroup,
              whitelistType: "summon_agent",
            });
            setBotName("");
          }}
        />
      </div>
      <div>
        See{" "}
        <Link
          href={`https://metabase.dust.tt/question/637-whitelisted-bots-given-connector?connectorId=${connectorId}`}
          target="_blank"
          className="text-sm text-highlight-400"
        >
          list of whitelisted bots for this workspace
        </Link>
      </div>
    </div>
  );
}

export default DataSourcePage;
