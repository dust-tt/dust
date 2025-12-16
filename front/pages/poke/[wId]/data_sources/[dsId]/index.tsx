import {
  Button,
  Chip,
  ContextItem,
  DocumentTextIcon,
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
import capitalize from "lodash/capitalize";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import type { ReactElement } from "react-markdown/lib/react-markdown";

import { ViewDataSourceTable } from "@app/components/poke/data_sources/view";
import { PluginList } from "@app/components/poke/plugins/PluginList";
import { PokePermissionTree } from "@app/components/poke/PokeConnectorPermissionsTree";
import PokeLayout from "@app/components/poke/PokeLayout";
import { SlackChannelPatternInput } from "@app/components/poke/PokeSlackChannelPatternInput";
import {
  PokeAlert,
  PokeAlertDescription,
} from "@app/components/poke/shadcn/ui/alert";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import config from "@app/lib/api/config";
import { useSubmitFunction } from "@app/lib/client/utils";
import { getDisplayNameForDocument } from "@app/lib/data_sources";
import { clientFetch } from "@app/lib/egress/client";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { getTemporalClientForConnectorsNamespace } from "@app/lib/temporal";
import { decodeSqids, timeAgoFrom } from "@app/lib/utils";
import logger from "@app/logger/logger";
import { usePokeDocuments, usePokeTables } from "@app/poke/swr";
import type {
  CoreAPIDataSource,
  DataSourceType,
  DataSourceViewType,
  NotionCheckUrlResponseType,
  NotionFindUrlResponseType,
  SlackAutoReadPattern,
  WorkspaceType,
  ZendeskFetchTicketResponseType,
} from "@app/types";
import {
  ConnectorsAPI,
  CoreAPI,
  isSlackAutoReadPatterns,
  normalizeError,
  safeParseJSON,
} from "@app/types";
import type { InternalConnectorType } from "@app/types/connectors/connectors_api";
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
  dataSourceViews: DataSourceViewType[];
  coreDataSource: CoreAPIDataSource;
  connector: InternalConnectorType | null;
  features: FeaturesType;
  temporalWorkspace: string;
  temporalRunningWorkflows: {
    workflowId: string;
    runId: string;
    status: string;
  }[];
}>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();

  const { dsId } = context.params ?? {};
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

  const dataSourceViews = await DataSourceViewResource.listForDataSources(
    auth,
    [dataSource]
  );

  if (coreDataSourceRes.isErr()) {
    return {
      notFound: true,
    };
  }

  let connector: InternalConnectorType | null = null;
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
      const temporalClient = await getTemporalClientForConnectorsNamespace();

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
      case "slack_bot":
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

  return {
    props: {
      owner,
      dataSource: dataSource.toJSON(),
      dataSourceViews: dataSourceViews.map((view) => view.toJSON()),
      coreDataSource: coreDataSourceRes.value.data_source,
      connector,
      features,
      temporalWorkspace: TEMPORAL_CONNECTORS_NAMESPACE,
      temporalRunningWorkflows: workflowInfos,
    },
  };
});

function FolderDisplay({
  owner,
  dataSource,
  onDisplayDocumentSource,
}: {
  owner: WorkspaceType;
  dataSource: DataSourceType;
  onDisplayDocumentSource: (documentId: string) => void;
}) {
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

  return (
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
                  Showing documents {offsetDocument + 1} - {lastDocument} of{" "}
                  {totalDocuments} documents
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
                      onClick={() => onDisplayDocumentSource(d.document_id)}
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
  );
}

const DataSourcePage = ({
  owner,
  dataSource,
  dataSourceViews,
  coreDataSource,
  connector,
  temporalWorkspace,
  temporalRunningWorkflows,
  features,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const router = useRouter();

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
        Data Source {dataSource.name} in workspace{" "}
        <a href={`/poke/${owner.sId}`} className="text-highlight-500">
          {owner.name}
        </a>
      </h3>
      {dataSource.connectorProvider === "notion" && (
        <PokeAlert variant="destructive" className="my-4">
          <PokeAlertDescription>
            Please read{" "}
            <a
              href="http://go/poke-notion"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold underline hover:no-underline"
            >
              go/poke-notion
            </a>{" "}
            before using any Notion plugin!
          </PokeAlertDescription>
        </PokeAlert>
      )}
      {dataSource.connectorProvider && (
        <p>
          The data displayed here is fetched from <b>connectors</b>, please
          refer to the method{" "}
          {capitalize(dataSource.connectorProvider)
            .replace(/_\w/g, (char) => char.toUpperCase())
            .replace("_", "")}
          ConnectorManager.retrievePermissions
        </p>
      )}

      <div className="flex flex-row gap-x-6">
        <ViewDataSourceTable
          dataSource={dataSource}
          dataSourceViews={dataSourceViews}
          owner={owner}
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
            {[
              "bigquery",
              "microsoft",
              "notion",
              "salesforce",
              "snowflake",
              "google_drive",
            ].includes(dataSource.connectorProvider ?? "") ||
            !dataSource.connectorProvider ? (
              <Button
                variant="outline"
                onClick={() => {
                  if (
                    window.confirm(
                      "Are you sure you want to access this sensitive user data? (Access will be logged)"
                    )
                  ) {
                    void router.push(
                      `/poke/${owner.sId}/data_sources/${dataSource.sId}/query`
                    );
                  }
                }}
                label="Query Data"
                icon={LockIcon}
              />
            ) : null}
            {dataSource.connectorProvider === "notion" && (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Are you sure you want to access this sensitive user data? (Access will be logged)"
                      )
                    ) {
                      void router.push(
                        `/poke/${owner.sId}/data_sources/${dataSource.sId}/notion-requests`
                      );
                    }
                  }}
                  label="Notion Requests"
                  icon={LockIcon}
                />
                <NotionUrlCheckOrFind owner={owner} dsId={dataSource.sId} />
              </>
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
          {["slack", "slack_bot"].includes(
            dataSource.connectorProvider ?? ""
          ) && (
            <div className="border-material-200 mb-4 flex flex-grow flex-col rounded-lg border p-4">
              <SlackChannelPatternInput
                initialValues={features.autoReadChannelPatterns || ""}
                owner={owner}
                dataSource={dataSource}
              />
            </div>
          )}
          {!dataSource.connectorId ? (
            <FolderDisplay
              owner={owner}
              dataSource={dataSource}
              onDisplayDocumentSource={onDisplayDocumentSource}
            />
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
  const res = await clientFetch(`/api/poke/admin`, {
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
    | { brandId: number | null; ticketId: number; wId: string; dsId: string }
    | { ticketUrl: string; wId: string; dsId: string }
): Promise<ZendeskFetchTicketResponseType | null> {
  const res = await clientFetch(`/api/poke/admin`, {
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
  const [command, setCommand] = useState<
    "check-url" | "find-url" | "parent-chain" | null
  >("check-url");
  const [parentChainResult, setParentChainResult] = useState<string | null>(
    null
  );
  const [isLoadingParentChain, setIsLoadingParentChain] = useState(false);

  const handleParentChain = async () => {
    setCommand("parent-chain");
    setUrlDetails(null);
    setParentChainResult(null);
    setIsLoadingParentChain(true);

    try {
      // Extract Notion ID from URL
      // Handle both full URLs (https://www.notion.so/Block-child-page-28cd1abaf14f80a4bfd4c51ba853d732)
      // and just IDs (28cd1abaf14f80a4bfd4c51ba853d732)
      let notionId = notionUrl.trim();

      // If it's a full URL, extract the last part
      if (notionId.includes("notion.so/")) {
        const urlParts = notionId.split("/").filter((p) => p);
        notionId = urlParts[urlParts.length - 1];
      }

      // Handle URLs with query parameters
      if (notionId.includes("?")) {
        notionId = notionId.split("?")[0];
      }

      // Extract the ID part (last 32 hex characters)
      // For URLs like "Block-child-page-28cd1abaf14f80a4bfd4c51ba853d732"
      // we want to extract "28cd1abaf14f80a4bfd4c51ba853d732"
      const idMatch = notionId.match(/([a-f0-9]{32})$/i);
      if (idMatch) {
        notionId = idMatch[1];
      } else {
        // If no 32-char hex string found, try removing all dashes and using the whole string
        notionId = notionId.replaceAll("-", "");
      }

      // Format as UUID
      const formattedId = `${notionId.slice(0, 8)}-${notionId.slice(8, 12)}-${notionId.slice(12, 16)}-${notionId.slice(16, 20)}-${notionId.slice(20)}`;

      const chain: string[] = [];
      let currentId = formattedId;
      let currentType: "page_id" | "database_id" | "block_id" | null =
        "block_id";
      let reachedWorkspace = false;

      // Start with trying pages, then databases
      while (!reachedWorkspace && chain.length < 20) {
        try {
          const apiType =
            currentType === "page_id"
              ? "pages"
              : currentType === "database_id"
                ? "databases"
                : "blocks";

          const res = await clientFetch(`/api/poke/admin`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              majorCommand: "notion",
              command: "api-request",
              args: {
                wId: owner.sId,
                dsId: dsId,
                url: `${apiType}/${currentId}`,
                method: "GET",
              },
            }),
          });

          if (!res.ok) {
            chain.push(`${currentId} error: ${res.statusText}`);
            break;
          }

          const result = await res.json();
          const responseData = result.data;
          let title = "";

          if (result.status !== 200) {
            chain.push(`${currentId} error: ${responseData.message}`);
          } else if (apiType === "pages") {
            // Find the first property with type "title"
            const properties = responseData.properties ?? {};
            let titleProp = null;
            for (const key in properties) {
              if (properties[key]?.type === "title") {
                titleProp = properties[key];
                break;
              }
            }
            title = titleProp?.title?.[0]?.plain_text ?? "Untitled";
            chain.push(`${currentId} page: ${title}`);
          } else if (apiType === "databases") {
            title = responseData.title?.[0]?.plain_text ?? "Untitled";
            chain.push(`${currentId} DB: ${title}`);
          } else if (apiType === "blocks") {
            const blockType = responseData.type ?? "unknown";
            chain.push(`${currentId} block: ${blockType}`);
          }

          // Check if we reached workspace
          if (responseData.parent?.type === "workspace") {
            chain.push("workspace");
            reachedWorkspace = true;
            break;
          }

          // Get parent info
          currentType = responseData.parent?.type;
          if (responseData.parent?.page_id) {
            currentId = responseData.parent.page_id;
          } else if (responseData.parent?.database_id) {
            currentId = responseData.parent.database_id;
          } else if (responseData.parent?.block_id) {
            currentId = responseData.parent.block_id;
          } else {
            break;
          }
        } catch (err) {
          chain.push(`${currentId} error: ${normalizeError(err).message}`);
          break;
        }
      }

      // Reverse and add indentation based on depth
      const reversedChain = chain.reverse();
      const indentedChain = reversedChain.map((item, index) => {
        const indent = "  ".repeat(index);
        return `${indent}${item}`;
      });

      setParentChainResult(indentedChain.join("\n"));
    } catch (err) {
      setParentChainResult(`Error: ${normalizeError(err).message}`);
    } finally {
      setIsLoadingParentChain(false);
    }
  };

  return (
    <div className="mb-2 flex flex-col gap-2 rounded-md border px-2 py-2 text-sm text-muted-foreground dark:text-muted-foreground-night">
      <div className="flex items-center gap-2 px-2 pt-2">
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
        <Button
          variant="outline"
          label={isLoadingParentChain ? "Loading..." : "Parent Chain"}
          disabled={isLoadingParentChain}
          onClick={handleParentChain}
        />
      </div>
      <div className="text-muted-foreground dark:text-muted-foreground-night">
        {urlDetails && (
          <div className="text-md flex flex-col gap-2 rounded-md p-4 pt-2">
            <Chip
              label={(() => {
                if (urlDetails.page) {
                  return "Page found";
                }
                if (urlDetails.db) {
                  return "Database found";
                }
                return "Not found";
              })()}
              color={urlDetails.page || urlDetails.db ? "success" : "warning"}
            />
            {/* eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing */}
            {(urlDetails.page || urlDetails.db) && (
              <div>
                <span>
                  {urlDetails.page ? (
                    <>
                      <JsonViewer
                        theme={isDark ? "dark" : "light"}
                        value={decodeSqids(urlDetails.page)}
                        rootName={false}
                      />
                      {command === "find-url" && (
                        <div className="pt-4">
                          {urlDetails.page.parentType === "page" && (
                            <>
                              <span className="font-bold text-success">
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
                              <span className="font-bold text-success">
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
                        value={decodeSqids(urlDetails.db)}
                        rootName={false}
                      />
                      {command === "find-url" && (
                        <div>
                          {urlDetails.db?.parentType === "page" && (
                            <>
                              <span className="font-bold text-success">
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
                              <span className="font-bold text-success">
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
        {command === "parent-chain" && parentChainResult && (
          <div className="text-md flex flex-col gap-2 rounded-md p-4 pt-2">
            <Chip label="Parent Chain" color="success" />
            <div className="whitespace-pre-wrap font-mono text-sm">
              {parentChainResult}
            </div>
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
          disabled={!ticketId || idsIsLoading}
          onClick={async () => {
            if (ticketId) {
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
                    color={ticketDetails.isTicketOnDb ? "success" : "info"}
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
                    color={ticketDetails.ticket ? "success" : "warning"}
                  />
                }
              />
              {ticketDetails.ticket && (
                <Tooltip
                  label={
                    ticketDetails.shouldSyncTicket.reason ??
                    "Looking at its state, the ticket should be synced with Dust."
                  }
                  className="max-w-md"
                  trigger={
                    <Chip
                      label={
                        ticketDetails.shouldSyncTicket.shouldSync
                          ? "Should be synced"
                          : "Should not be synced"
                      }
                      color={
                        ticketDetails.shouldSyncTicket.shouldSync
                          ? "success"
                          : "info"
                      }
                    />
                  }
                />
              )}
            </div>
            {ticketDetails.ticket && (
              <div className="ml-4 pt-2 text-xs text-muted-foreground">
                <div className="mb-1 font-bold">Details</div>
                <JsonViewer
                  theme={isDark ? "dark" : "light"}
                  value={decodeSqids(ticketDetails.ticket)}
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
      const r = await clientFetch(
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

export default DataSourcePage;
