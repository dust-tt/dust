import {
  Button,
  ContextItem,
  DocumentTextIcon,
  DropdownMenu,
  EyeIcon,
  Input,
  Page,
  SliderToggle,
} from "@dust-tt/sparkle";
import type {
  CoreAPIDataSource,
  DataSourceType,
  GroupType,
  NotionCheckUrlResponseType,
  NotionFindUrlResponseType,
  SlackbotWhitelistType,
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
import { SlackChannelPatternInput } from "@app/components/poke/PokeSlackChannelPatternInput";
import config from "@app/lib/api/config";
import { Authenticator } from "@app/lib/auth";
import { useSubmitFunction } from "@app/lib/client/utils";
import { getDisplayNameForDocument } from "@app/lib/data_sources";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { classNames, timeAgoFrom } from "@app/lib/utils";
import logger from "@app/logger/logger";
import { useDocuments } from "@app/poke/swr";

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
  autoReadChannelPattern: string | null;
};

export const getServerSideProps = withSuperUserAuthRequirements<{
  owner: WorkspaceType;
  dataSource: DataSourceType;
  coreDataSource: CoreAPIDataSource;
  connector: ConnectorType | null;
  features: FeaturesType;
  temporalWorkspace: string;
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

  const features: FeaturesType = {
    slackBotEnabled: false,
    googleDrivePdfEnabled: false,
    googleDriveLargeFilesEnabled: false,
    microsoftPdfEnabled: false,
    microsoftLargeFilesEnabled: false,
    googleDriveCsvEnabled: false,
    microsoftCsvEnabled: false,
    githubCodeSyncEnabled: false,
    autoReadChannelPattern: null,
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

        const autoReadChannelPattern = await connectorsAPI.getConnectorConfig(
          dataSource.connectorId,
          "autoReadChannelPattern"
        );
        if (autoReadChannelPattern.isErr()) {
          throw autoReadChannelPattern.error;
        }
        features.autoReadChannelPattern =
          autoReadChannelPattern.value.configValue;
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
  features,
  groupsForSlackBot,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const [limit] = useState(10);
  const [offset, setOffset] = useState(0);

  const { documents, total, isDocumentsLoading, isDocumentsError } =
    useDocuments(owner, dataSource, limit, offset);

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
    <div className="min-h-screen bg-structure-50">
      <PokeNavbar />
      <div className="mx-auto max-w-4xl">
        <div className="px-8 py-8"></div>
        <Page.Vertical align="stretch">
          <div className="flex flex-row gap-2">
            <Page.SectionHeader title={`${owner.name} → ${dataSource.name}`} />
          </div>

          <div className="flex flex-row gap-2 text-sm font-bold text-action-500">
            <Link href={`/poke/${owner.sId}`}>&laquo; workspace </Link>
            <div
              className="cursor-pointer"
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
            >
              🔒 search data
            </div>
          </div>

          <ViewDataSourceTable
            dataSource={dataSource}
            temporalWorkspace={temporalWorkspace}
            coreDataSource={coreDataSource}
            connector={connector}
          />

          {dataSource.connectorProvider === "slack" && (
            <>
              <ConfigToggle
                title="Slackbot enabled?"
                owner={owner}
                features={features}
                dataSource={dataSource}
                configKey="botEnabled"
                featureKey="slackBotEnabled"
              />
              <SlackWhitelistBot
                owner={owner}
                connectorId={connector?.id}
                groups={groupsForSlackBot}
              />
              <div className="border-material-200 mb-4 flex flex-grow flex-col rounded-lg border p-4">
                <SlackChannelPatternInput
                  initialValue={features.autoReadChannelPattern || ""}
                  owner={owner}
                  dataSource={dataSource}
                />
              </div>
            </>
          )}
          {dataSource.connectorProvider === "notion" && (
            <NotionUrlCheckOrFind owner={owner} dsId={dataSource.sId} />
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
            <ConfigToggle
              title="Code sync enabled?"
              owner={owner}
              features={features}
              dataSource={dataSource}
              configKey="codeSyncEnabled"
              featureKey="githubCodeSyncEnabled"
            />
          )}

          {!dataSource.connectorId && (
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
          )}
          <div className="border-material-200 mb-4 flex flex-grow flex-col rounded-lg border p-4">
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
                onDocumentViewClick={onDisplayDocumentSource}
                permissionFilter="read"
              />
            )}
          </div>
        </Page.Vertical>
      </div>
    </div>
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
          variant="secondary"
          label={"Check"}
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
          variant="secondary"
          label={"Find"}
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
                      <JsonViewer value={urlDetails.page} rootName={false} />
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
                      <JsonViewer value={urlDetails.db} rootName={false} />
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
        throw new Error("Failed to toggle slackbot.");
      }
      router.reload();
    } catch (e) {
      console.error(e);
      window.alert("An error occurred while toggling slackbot.");
    }
  });

  const value = features[featureKey] as boolean;

  return (
    <div className="mb-2 flex w-64 items-center justify-between rounded-md border px-2 py-2 text-sm text-gray-600">
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
            placeholder={`Bot or workflow name`}
            onChange={(e) => setBotName(e.target.value)}
            value={botName}
          />
        </div>
        <div>
          <DropdownMenu>
            <DropdownMenu.Button
              label={selectedGroupName ?? "Select a group"}
            />

            <DropdownMenu.Items width={220}>
              {groups.map((group) => (
                <DropdownMenu.Item
                  selected={selectedGroup === group.sId}
                  key={group.sId}
                  label={group.name}
                  onClick={() => setSelectedGroup(group.sId)}
                />
              ))}
            </DropdownMenu.Items>
          </DropdownMenu>
        </div>
        <Button
          variant="secondary"
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
          className="text-sm text-action-400"
        >
          list of whitelisted bots for this workspace
        </Link>
      </div>
    </div>
  );
}

export default DataSourcePage;
