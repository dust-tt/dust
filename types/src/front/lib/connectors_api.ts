import { ConnectorsAPIError, isConnectorsAPIError } from "../../connectors/api";
import {
  CreateConnectorOAuthRequestBody,
  CreateConnectorUrlRequestBody,
} from "../../connectors/api_handlers/create_connector";
import { UpdateConnectorRequestBody } from "../../connectors/api_handlers/update_connector";
import { WebCrawlerConfigurationType } from "../../connectors/webcrawler";
import { ConnectorProvider } from "../../front/data_source";
import { Err, Ok, Result } from "../../front/lib/result";
import { LoggerInterface } from "../../shared/logger";

const {
  CONNECTORS_API = "http://127.0.0.1:3002",
  DUST_CONNECTORS_SECRET = "",
} = process.env;

export type ConnectorsAPIResponse<T> = Result<T, ConnectorsAPIError>;
export type ConnectorSyncStatus = "succeeded" | "failed";
const CONNECTORS_ERROR_TYPES = [
  "oauth_token_revoked",
  "third_party_internal_error",
  "webcrawling_error",
] as const;

export type ConnectorErrorType = (typeof CONNECTORS_ERROR_TYPES)[number];
export function isConnectorError(val: string): val is ConnectorErrorType {
  return (CONNECTORS_ERROR_TYPES as unknown as string[]).includes(val);
}

export const CONNECTOR_PROVIDERS_USING_NANGO = [
  "confluence",
  "google_drive",
  "intercom",
  "notion",
  "slack",
] as const;
type ConnectorProviderUsingNango =
  (typeof CONNECTOR_PROVIDERS_USING_NANGO)[number];

export function connectorIsUsingNango(
  provider: string
): provider is ConnectorProviderUsingNango {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return CONNECTOR_PROVIDERS_USING_NANGO.includes(provider as any);
}

export type ConnectorType = {
  id: string;
  type: ConnectorProvider;
  workspaceId: string;
  dataSourceName: string;

  lastSyncStatus?: ConnectorSyncStatus;
  lastSyncStartTime?: number;
  lastSyncFinishTime?: number;
  lastSyncSuccessfulTime?: number;
  firstSuccessfulSyncTime?: number;
  firstSyncProgress?: string;
  errorType?: ConnectorErrorType;
};

/**
 * This type represents the permission associated with a ContentNode. For now the only
 * permission we handle is read. but we could have more complex permissions in the future.
 */
export type ConnectorPermission = "read" | "write" | "read_write" | "none";
export type ContentNodeType = "file" | "folder" | "database" | "channel";

/**
 * A ContentNode represents a connector related node. As an example:
 * - Notion: Top-level pages (possibly manually added lower level ones)
 * - Github: repositories
 * - Slack: channels
 * - GoogleDrive: shared drive or sub-folders of shared drives.
 *
 * `internalId` and `parentInternalId` are internal opaque identifiers that
 * should enable reconstructing the tree structure of the resources.
 *
 * Those ids must be aligned with those used in the "parents" field of data
 * sources documents, to enable search filter on documents based on their
 * parents, see the
 *
 * The convention to use for internal ids are to always use the externally
 * provided id when possible (e.g. Notion page id, Github repository id,
 * etc...). When not possible, such as for Github issues whose id is not
 * workspace-unique, a custom function to create a unique id is created, and
 * used both in the parents field management code and the connectors node
 * code.
 */
export type ContentNode = {
  provider: ConnectorProvider;
  internalId: string;
  parentInternalId: string | null;
  type: ContentNodeType;
  title: string;
  titleWithParentsContext?: string;
  sourceUrl: string | null;
  expandable: boolean;
  preventSelection?: boolean;
  permission: ConnectorPermission;
  dustDocumentId: string | null;
  lastUpdatedAt: number | null;
};

export type GoogleDriveFolderType = {
  id: string;
  name: string;
  parent: string | null;
  children: string[];
};

export type GoogleDriveSelectedFolderType = GoogleDriveFolderType & {
  selected: boolean;
};

export class ConnectorsAPI {
  _logger: LoggerInterface;
  constructor(logger: LoggerInterface) {
    this._logger = logger;
  }

  async createConnector(
    provider: ConnectorProvider,
    workspaceId: string,
    workspaceAPIKey: string,
    dataSourceName: string,
    connectorParams:
      | CreateConnectorOAuthRequestBody
      | CreateConnectorUrlRequestBody
  ): Promise<ConnectorsAPIResponse<ConnectorType>> {
    const res = await fetch(
      `${CONNECTORS_API}/connectors/create/${encodeURIComponent(provider)}`,
      {
        method: "POST",
        headers: this.getDefaultHeaders(),
        body: JSON.stringify({
          workspaceId,
          workspaceAPIKey,
          dataSourceName,
          connectorParams,
        }),
      }
    );

    return this._resultFromResponse(res);
  }

  async updateConnector({
    connectorId,
    params,
  }: {
    connectorId: string;
    params: UpdateConnectorRequestBody;
  }): Promise<ConnectorsAPIResponse<{ connectorId: string }>> {
    const res = await fetch(
      `${CONNECTORS_API}/connectors/update/${encodeURIComponent(connectorId)}`,
      {
        method: "POST",
        headers: this.getDefaultHeaders(),
        body: JSON.stringify(params),
      }
    );

    return this._resultFromResponse(res);
  }

  async stopConnector(
    connectorId: string
  ): Promise<ConnectorsAPIResponse<undefined>> {
    const res = await fetch(
      `${CONNECTORS_API}/connectors/stop/${encodeURIComponent(connectorId)}`,
      {
        method: "POST",
        headers: this.getDefaultHeaders(),
      }
    );

    return this._resultFromResponse(res);
  }

  async resumeConnector(
    connectorId: string
  ): Promise<ConnectorsAPIResponse<undefined>> {
    const res = await fetch(
      `${CONNECTORS_API}/connectors/resume/${encodeURIComponent(connectorId)}`,
      {
        method: "POST",
        headers: this.getDefaultHeaders(),
      }
    );

    return this._resultFromResponse(res);
  }

  async syncConnector(
    connectorId: string
  ): Promise<ConnectorsAPIResponse<{ workflowId: string }>> {
    const res = await fetch(
      `${CONNECTORS_API}/connectors/sync/${encodeURIComponent(connectorId)}`,
      {
        method: "POST",
        headers: this.getDefaultHeaders(),
      }
    );

    return this._resultFromResponse(res);
  }

  async deleteConnector(
    connectorId: string,
    force = false
  ): Promise<ConnectorsAPIResponse<{ success: true }>> {
    const res = await fetch(
      `${CONNECTORS_API}/connectors/delete/${encodeURIComponent(
        connectorId
      )}?force=${force ? "true" : "false"}`,
      {
        method: "DELETE",
        headers: this.getDefaultHeaders(),
      }
    );

    return this._resultFromResponse(res);
  }

  async getConnectorPermissions({
    connectorId,
    parentId,
    filterPermission,
  }: {
    connectorId: string;
    parentId?: string;
    filterPermission?: ConnectorPermission;
  }): Promise<ConnectorsAPIResponse<{ resources: ContentNode[] }>> {
    let url = `${CONNECTORS_API}/connectors/${encodeURIComponent(
      connectorId
    )}/permissions?`;
    if (parentId) {
      url += `&parentId=${encodeURIComponent(parentId)}`;
    }
    if (filterPermission) {
      url += `&filterPermission=${encodeURIComponent(filterPermission)}`;
    }

    const res = await fetch(url, {
      method: "GET",
      headers: this.getDefaultHeaders(),
    });

    return this._resultFromResponse(res);
  }

  async setConnectorPermissions({
    connectorId,
    resources,
  }: {
    connectorId: string;
    resources: { internalId: string; permission: ConnectorPermission }[];
  }): Promise<ConnectorsAPIResponse<void>> {
    const res = await fetch(
      `${CONNECTORS_API}/connectors/${encodeURIComponent(
        connectorId
      )}/permissions`,
      {
        method: "POST",
        headers: this.getDefaultHeaders(),
        body: JSON.stringify({
          resources: resources.map(({ internalId, permission }) => ({
            internal_id: internalId,
            permission,
          })),
        }),
      }
    );

    return this._resultFromResponse(res);
  }

  async getConnector(
    connectorId: string
  ): Promise<ConnectorsAPIResponse<ConnectorType>> {
    const res = await fetch(
      `${CONNECTORS_API}/connectors/${encodeURIComponent(connectorId)}`,
      {
        method: "GET",
        headers: this.getDefaultHeaders(),
      }
    );

    return this._resultFromResponse(res);
  }

  async setConnectorConfig(
    connectorId: string,
    configKey: string,
    configValue: string
  ): Promise<ConnectorsAPIResponse<void>> {
    const res = await fetch(
      `${CONNECTORS_API}/connectors/${encodeURIComponent(
        connectorId
      )}/config/${encodeURIComponent(configKey)}`,
      {
        method: "POST",
        headers: this.getDefaultHeaders(),
        body: JSON.stringify({
          configValue,
        }),
      }
    );

    return this._resultFromResponse(res);
  }

  async getConnectorConfig(
    connectorId: string,
    configKey: string
  ): Promise<
    ConnectorsAPIResponse<{
      connectorId: number;
      configKey: string;
      configValue: string;
    }>
  > {
    const res = await fetch(
      `${CONNECTORS_API}/connectors/${encodeURIComponent(
        connectorId
      )}/config/${encodeURIComponent(configKey)}`,
      {
        method: "GET",
        headers: this.getDefaultHeaders(),
      }
    );

    return this._resultFromResponse(res);
  }

  async getContentNodesParents({
    connectorId,
    internalIds,
  }: {
    connectorId: string;
    internalIds: string[];
  }): Promise<
    ConnectorsAPIResponse<{
      nodes: {
        internalId: string;
        parents: string[];
      }[];
    }>
  > {
    const res = await fetch(
      `${CONNECTORS_API}/connectors/${encodeURIComponent(
        connectorId
      )}/content_nodes/parents`,
      {
        method: "POST",
        headers: this.getDefaultHeaders(),
        body: JSON.stringify({
          internalIds,
        }),
      }
    );

    return this._resultFromResponse(res);
  }

  async getResourcesTitles({
    connectorId,
    resourceInternalIds,
  }: {
    connectorId: string;
    resourceInternalIds: string[];
  }): Promise<
    ConnectorsAPIResponse<{
      resources: {
        internalId: string;
        title: string;
      }[];
    }>
  > {
    const res = await fetch(
      `${CONNECTORS_API}/connectors/${encodeURIComponent(
        connectorId
      )}/resources/titles`,
      {
        method: "POST",
        headers: this.getDefaultHeaders(),
        body: JSON.stringify({
          resourceInternalIds,
        }),
      }
    );

    return this._resultFromResponse(res);
  }

  async getContentNodes({
    connectorId,
    internalIds,
  }: {
    connectorId: string;
    internalIds: string[];
  }): Promise<
    ConnectorsAPIResponse<{
      nodes: ContentNode[];
    }>
  > {
    const res = await fetch(
      `${CONNECTORS_API}/connectors/${encodeURIComponent(
        connectorId
      )}/content_nodes`,
      {
        method: "POST",
        headers: this.getDefaultHeaders(),
        body: JSON.stringify({
          internalIds,
        }),
      }
    );

    return this._resultFromResponse(res);
  }

  async linkSlackChannelsWithAgent({
    connectorId,
    slackChannelIds,
    agentConfigurationId,
  }: {
    connectorId: string;
    slackChannelIds: string[];
    agentConfigurationId: string;
  }): Promise<ConnectorsAPIResponse<{ success: true }>> {
    const res = await fetch(
      `${CONNECTORS_API}/slack/channels/linked_with_agent`,
      {
        method: "PATCH",
        headers: this.getDefaultHeaders(),
        body: JSON.stringify({
          connector_id: connectorId,
          agent_configuration_id: agentConfigurationId,
          slack_channel_ids: slackChannelIds,
        }),
      }
    );

    return this._resultFromResponse(res);
  }

  async getSlackChannelsLinkedWithAgent({
    connectorId,
  }: {
    connectorId: string;
  }): Promise<
    ConnectorsAPIResponse<{
      slackChannels: {
        slackChannelId: string;
        slackChannelName: string;
        agentConfigurationId: string;
      }[];
    }>
  > {
    const res = await fetch(
      `${CONNECTORS_API}/slack/channels/linked_with_agent?connector_id=${encodeURIComponent(
        connectorId
      )}`,
      {
        method: "GET",
        headers: this.getDefaultHeaders(),
      }
    );

    return this._resultFromResponse(res);
  }

  async getWebCrawlerConfiguration({
    connectorId,
  }: {
    connectorId: string;
  }): Promise<ConnectorsAPIResponse<WebCrawlerConfigurationType>> {
    const res = await fetch(
      `${CONNECTORS_API}/connectors/webcrawler/${encodeURIComponent(
        connectorId
      )}/configuration`,
      {
        method: "GET",
        headers: this.getDefaultHeaders(),
      }
    );

    return this._resultFromResponse(res);
  }

  getDefaultHeaders() {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DUST_CONNECTORS_SECRET}`,
    };
  }

  private async _resultFromResponse<T>(
    response: Response
  ): Promise<ConnectorsAPIResponse<T>> {
    // We get the text and attempt to parse so that we can log the raw text in case of error (the
    // body is already consumed by response.json() if used otherwise).
    const text = await response.text();

    let json = null;
    try {
      json = JSON.parse(text);
    } catch (e) {
      const err: ConnectorsAPIError = {
        type: "unexpected_response_format",
        message: `Unexpected response format from ConnectorsAPI: ${e}`,
      };
      this._logger.error(
        {
          connectorsError: err,
          parseError: e,
          rawText: text,
          status: response.status,
        },
        "ConnectorsAPI error"
      );
      return new Err(err);
    }

    if (!response.ok) {
      const err = json?.error;
      if (isConnectorsAPIError(err)) {
        this._logger.error(
          { connectorsError: err, status: response.status },
          "ConnectorsAPI error"
        );
        return new Err(err);
      } else {
        const err: ConnectorsAPIError = {
          type: "unexpected_error_format",
          message: "Unexpected error format from ConnectorAPI",
        };
        this._logger.error(
          { connectorsError: err, json, status: response.status },
          "ConnectorsAPI error"
        );
        return new Err(err);
      }
    } else {
      return new Ok(json);
    }
  }
}
