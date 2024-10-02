import {
  AdminCommandType,
  AdminResponseType,
} from "../../connectors/admin/cli";
import { ConnectorsAPIError, isConnectorsAPIError } from "../../connectors/api";
import { UpdateConnectorConfigurationType } from "../../connectors/api_handlers/connector_configuration";
import { ConnectorCreateRequestBody } from "../../connectors/api_handlers/create_connector";
import { UpdateConnectorRequestBody } from "../../connectors/api_handlers/update_connector";
import { ConnectorConfiguration } from "../../connectors/configuration";
import { ContentNodesViewType } from "../../connectors/content_nodes";
import { ConnectorProvider, DataSourceType } from "../../front/data_source";
import { LoggerInterface } from "../../shared/logger";
import { Err, Ok, Result } from "../../shared/result";

export type ConnectorsAPIResponse<T> = Result<T, ConnectorsAPIError>;
export type ConnectorSyncStatus = "succeeded" | "failed";
const CONNECTORS_ERROR_TYPES = [
  "oauth_token_revoked",
  "third_party_internal_error",
  "webcrawling_error",
  "remote_database_connection_not_readonly",
] as const;

export type ConnectorErrorType = (typeof CONNECTORS_ERROR_TYPES)[number];
export function isConnectorError(val: string): val is ConnectorErrorType {
  return (CONNECTORS_ERROR_TYPES as unknown as string[]).includes(val);
}

export type ConnectorType = {
  id: string;
  type: ConnectorProvider;
  workspaceId: string;
  dataSourceId: string;
  connectionId: string;

  lastSyncStatus?: ConnectorSyncStatus;
  lastSyncStartTime?: number;
  lastSyncFinishTime?: number;
  lastSyncSuccessfulTime?: number;
  firstSuccessfulSyncTime?: number;
  firstSyncProgress?: string;
  errorType?: ConnectorErrorType;
  configuration: ConnectorConfiguration;
  pausedAt?: number;
  updatedAt: number;
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
 * used both in the parents field management code and the connectors node code.
 *
 * A specific situation for the Microsoft connector leads us to not use the
 * externally provided id (although it exists and is unique), but to compute our
 * own. This is because the Microsoft API does not allow to query a document or
 * list its children using its id alone. We compute an internal id that contains all
 * information. More details here:
 * https://www.notion.so/dust-tt/Design-Doc-Microsoft-ids-parents-c27726652aae45abafaac587b971a41d?pvs=4
 */
export interface BaseContentNode {
  internalId: string;
  // The direct parent ID of this content node
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
}

export type ContentNode = BaseContentNode & {
  provider: ConnectorProvider;
};

export type ContentNodeWithParentIds = ContentNode & {
  // A list of all parent IDs up to the root node, including the direct parent
  // Note: When includeParents is true, this list will be populated
  parentInternalIds: string[] | null;
};

type GetContentNodesReturnType<
  IncludeParents extends boolean,
  Key extends string
> = IncludeParents extends true
  ? ConnectorsAPIResponse<{ [K in Key]: ContentNodeWithParentIds[] }>
  : ConnectorsAPIResponse<{ [K in Key]: ContentNode[] }>;

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
  _url: string;
  _secret: string;
  _logger: LoggerInterface;

  constructor(
    config: { url: string; secret: string },
    logger: LoggerInterface
  ) {
    this._url = config.url;
    this._secret = config.secret;
    this._logger = logger;
  }

  async createConnector({
    provider,
    workspaceId,
    workspaceAPIKey,
    dataSourceId,
    connectionId,
    configuration,
  }: {
    provider: ConnectorProvider;
    workspaceId: string;
    workspaceAPIKey: string;
    dataSourceId: string;
    connectionId: string;
    configuration: ConnectorConfiguration;
  }): Promise<ConnectorsAPIResponse<ConnectorType>> {
    const res = await this._fetchWithError(
      `${this._url}/connectors/create/${encodeURIComponent(provider)}`,
      {
        method: "POST",
        headers: this.getDefaultHeaders(),
        body: JSON.stringify({
          workspaceId,
          workspaceAPIKey,
          dataSourceId,
          connectionId,
          configuration,
        } satisfies ConnectorCreateRequestBody),
      }
    );

    return this._resultFromResponse(res);
  }

  async updateConfiguration({
    connectorId,
    configuration,
  }: {
    connectorId: string;
    configuration: UpdateConnectorConfigurationType;
  }): Promise<ConnectorsAPIResponse<ConnectorType>> {
    const res = await this._fetchWithError(
      `${this._url}/connectors/${encodeURIComponent(
        connectorId
      )}/configuration`,
      {
        method: "PATCH",
        headers: this.getDefaultHeaders(),
        body: JSON.stringify(
          configuration satisfies UpdateConnectorConfigurationType
        ),
      }
    );

    return this._resultFromResponse(res);
  }

  async updateConnector({
    connectorId,
    connectionId,
  }: {
    connectorId: string;
    connectionId: string;
  }): Promise<ConnectorsAPIResponse<{ connectorId: string }>> {
    const res = await this._fetchWithError(
      `${this._url}/connectors/update/${encodeURIComponent(connectorId)}`,
      {
        method: "POST",
        headers: this.getDefaultHeaders(),
        body: JSON.stringify({
          connectionId,
        } satisfies UpdateConnectorRequestBody),
      }
    );

    return this._resultFromResponse(res);
  }

  async stopConnector(
    connectorId: string
  ): Promise<ConnectorsAPIResponse<undefined>> {
    const res = await this._fetchWithError(
      `${this._url}/connectors/stop/${encodeURIComponent(connectorId)}`,
      {
        method: "POST",
        headers: this.getDefaultHeaders(),
      }
    );

    return this._resultFromResponse(res);
  }

  async pauseConnector(
    connectorId: string
  ): Promise<ConnectorsAPIResponse<undefined>> {
    const res = await this._fetchWithError(
      `${this._url}/connectors/pause/${encodeURIComponent(connectorId)}`,
      {
        method: "POST",
        headers: this.getDefaultHeaders(),
      }
    );

    return this._resultFromResponse(res);
  }

  async unpauseConnector(
    connectorId: string
  ): Promise<ConnectorsAPIResponse<undefined>> {
    const res = await this._fetchWithError(
      `${this._url}/connectors/unpause/${encodeURIComponent(connectorId)}`,
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
    const res = await this._fetchWithError(
      `${this._url}/connectors/resume/${encodeURIComponent(connectorId)}`,
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
    const res = await this._fetchWithError(
      `${this._url}/connectors/sync/${encodeURIComponent(connectorId)}`,
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
    const res = await this._fetchWithError(
      `${this._url}/connectors/delete/${encodeURIComponent(
        connectorId
      )}?force=${force ? "true" : "false"}`,
      {
        method: "DELETE",
        headers: this.getDefaultHeaders(),
      }
    );

    return this._resultFromResponse(res);
  }

  async getConnectorPermissions<IncludeParents extends boolean>({
    connectorId,
    filterPermission,
    includeParents,
    parentId,
    viewType = "documents",
  }: {
    connectorId: string;
    filterPermission?: ConnectorPermission;
    includeParents?: IncludeParents;
    parentId?: string;
    viewType?: ContentNodesViewType;
  }): Promise<GetContentNodesReturnType<IncludeParents, "resources">> {
    const queryParams = new URLSearchParams();

    if (parentId) {
      queryParams.append("parentId", parentId);
    }

    if (filterPermission) {
      queryParams.append("filterPermission", filterPermission);
    }

    if (includeParents) {
      queryParams.append("includeParents", "true");
    }

    const qs = queryParams.toString();

    const url = `${this._url}/connectors/${encodeURIComponent(
      connectorId
    )}/permissions?viewType=${viewType}&${qs}`;

    const res = await this._fetchWithError(url, {
      method: "GET",
      headers: this.getDefaultHeaders(),
    });

    const response = await this._resultFromResponse(res);

    return response as GetContentNodesReturnType<IncludeParents, "resources">;
  }

  async setConnectorPermissions({
    connectorId,
    resources,
  }: {
    connectorId: string;
    resources: {
      internalId: string;
      permission: ConnectorPermission;
    }[];
  }): Promise<ConnectorsAPIResponse<void>> {
    const res = await this._fetchWithError(
      `${this._url}/connectors/${encodeURIComponent(connectorId)}/permissions`,
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
    const res = await this._fetchWithError(
      `${this._url}/connectors/${encodeURIComponent(connectorId)}`,
      {
        method: "GET",
        headers: this.getDefaultHeaders(),
      }
    );

    return this._resultFromResponse(res);
  }

  // TODO(jules): remove after debugging
  async getConnectorFromDataSource(
    dataSource: DataSourceType
  ): Promise<ConnectorsAPIResponse<ConnectorType>> {
    const res = await this._fetchWithError(
      `${this._url}/connectors/${encodeURIComponent(
        dataSource.connectorId ?? ""
      )}?origin=${dataSource.id}`,
      {
        method: "GET",
        headers: this.getDefaultHeaders(),
      }
    );

    return this._resultFromResponse(res);
  }

  async getConnectors(
    provider: ConnectorProvider,
    connectorIds: string[]
  ): Promise<ConnectorsAPIResponse<ConnectorType[]>> {
    if (connectorIds.length === 0) {
      return new Ok([]);
    }
    const res = await this._fetchWithError(
      `${this._url}/connectors?provider=${encodeURIComponent(
        provider
      )}&${connectorIds
        .map((id) => `connector_id=${encodeURIComponent(id)}`)
        .join("&")}`,
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
    const res = await this._fetchWithError(
      `${this._url}/connectors/${encodeURIComponent(
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
    const res = await this._fetchWithError(
      `${this._url}/connectors/${encodeURIComponent(
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
    const res = await this._fetchWithError(
      `${this._url}/connectors/${encodeURIComponent(
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

  async getContentNodes<IncludeParents extends boolean>({
    connectorId,
    includeParents,
    internalIds,
    viewType = "documents",
  }: {
    connectorId: string;
    includeParents?: IncludeParents;
    internalIds: string[];
    viewType?: ContentNodesViewType;
  }): Promise<GetContentNodesReturnType<IncludeParents, "nodes">> {
    const res = await this._fetchWithError(
      `${this._url}/connectors/${encodeURIComponent(
        connectorId
      )}/content_nodes`,
      {
        keepalive: false,
        method: "POST",
        headers: this.getDefaultHeaders(),
        body: JSON.stringify({
          includeParents,
          internalIds,
          viewType,
        }),
      }
    );

    const response = await this._resultFromResponse(res);

    return response as GetContentNodesReturnType<IncludeParents, "nodes">;
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
    const res = await this._fetchWithError(
      `${this._url}/slack/channels/linked_with_agent`,
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
    const res = await this._fetchWithError(
      `${
        this._url
      }/slack/channels/linked_with_agent?connector_id=${encodeURIComponent(
        connectorId
      )}`,
      {
        method: "GET",
        headers: this.getDefaultHeaders(),
      }
    );

    return this._resultFromResponse(res);
  }

  async admin(
    adminCommand: AdminCommandType
  ): Promise<ConnectorsAPIResponse<AdminResponseType>> {
    const res = await this._fetchWithError(`${this._url}/connectors/admin`, {
      method: "POST",
      headers: this.getDefaultHeaders(),
      body: JSON.stringify(adminCommand),
    });

    return this._resultFromResponse(res);
  }

  getDefaultHeaders() {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this._secret}`,
    };
  }

  private async _fetchWithError(
    url: string,
    init?: RequestInit
  ): Promise<
    Result<{ response: Response; duration: number }, ConnectorsAPIError>
  > {
    const now = Date.now();
    try {
      const res = await fetch(url, init);
      return new Ok({ response: res, duration: Date.now() - now });
    } catch (e) {
      const duration = Date.now() - now;
      const err: ConnectorsAPIError = {
        type: "unexpected_network_error",
        message: `Unexpected network error from ConnectorsAPI: ${e}`,
      };
      this._logger.error(
        {
          url,
          duration,
          connectorsError: err,
          error: e,
        },
        "ConnectorsAPI error"
      );
      return new Err(err);
    }
  }

  private async _resultFromResponse<T>(
    res: Result<
      {
        response: Response;
        duration: number;
      },
      ConnectorsAPIError
    >
  ): Promise<ConnectorsAPIResponse<T>> {
    if (res.isErr()) {
      return res;
    }

    // 204 means no content.
    if (res.value.response.status === 204) {
      return new Ok(undefined as T);
    }
    // We get the text and attempt to parse so that we can log the raw text in case of error (the
    // body is already consumed by response.json() if used otherwise).
    const text = await res.value.response.text();

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
          status: res.value.response.status,
          url: res.value.response.url,
          duration: res.value.duration,
        },
        "ConnectorsAPI error"
      );
      return new Err(err);
    }

    if (!res.value.response.ok) {
      const err = json?.error;
      if (isConnectorsAPIError(err)) {
        this._logger.error(
          {
            connectorsError: err,
            status: res.value.response.status,
            url: res.value.response.url,
            duration: res.value.duration,
          },
          "ConnectorsAPI error"
        );
        return new Err(err);
      } else {
        const err: ConnectorsAPIError = {
          type: "unexpected_error_format",
          message: "Unexpected error format from ConnectorAPI",
        };
        this._logger.error(
          {
            connectorsError: err,
            json,
            status: res.value.response.status,
            url: res.value.response.url,
            duration: res.value.duration,
          },
          "ConnectorsAPI error"
        );
        return new Err(err);
      }
    } else {
      return new Ok(json);
    }
  }
}
