import { AdminCommandType, AdminResponseType } from "../../connectors/admin/cli";
import { ConnectorsAPIError } from "../../connectors/api";
import { UpdateConnectorConfigurationType } from "../../connectors/api_handlers/connector_configuration";
import { ConnectorConfiguration } from "../../connectors/configuration";
import { ContentNodesViewType } from "../../connectors/content_nodes";
import { ContentNodeType } from "../../core/content_node";
import { ConnectorProvider, DataSourceType } from "../../front/data_source";
import { LoggerInterface } from "../../shared/logger";
import { Result } from "../../shared/result";
export type ConnectorsAPIResponse<T> = Result<T, ConnectorsAPIError>;
export type ConnectorSyncStatus = "succeeded" | "failed";
export declare const CONNECTORS_ERROR_TYPES: readonly ["oauth_token_revoked", "third_party_internal_error", "webcrawling_error", "webcrawling_error_empty_content", "webcrawling_error_content_too_large", "webcrawling_error_blocked", "webcrawling_synchronization_limit_reached", "remote_database_connection_not_readonly", "remote_database_network_error"];
export type ConnectorErrorType = (typeof CONNECTORS_ERROR_TYPES)[number];
export declare function isConnectorError(val: string): val is ConnectorErrorType;
export type ConnectorType = {
    id: string;
    type: ConnectorProvider;
    workspaceId: string;
    dataSourceId: string;
    connectionId: string;
    useProxy: boolean;
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
export type ProviderVisibility = "public" | "private";
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
export interface ContentNode {
    expandable: boolean;
    internalId: string;
    lastUpdatedAt: number | null;
    mimeType: string;
    parentInternalId: string | null;
    permission: ConnectorPermission;
    preventSelection?: boolean;
    providerVisibility?: ProviderVisibility;
    sourceUrl: string | null;
    title: string;
    type: ContentNodeType;
}
export interface ContentNodeWithParent extends ContentNode {
    parentInternalIds: string[] | null;
    parentTitle?: string;
}
export type GoogleDriveFolderType = {
    id: string;
    name: string;
    parent: string | null;
    children: string[];
};
export type GoogleDriveSelectedFolderType = GoogleDriveFolderType & {
    selected: boolean;
};
export declare class ConnectorsAPI {
    _url: string;
    _secret: string;
    _logger: LoggerInterface;
    constructor(config: {
        url: string;
        secret: string;
    }, logger: LoggerInterface);
    createConnector({ provider, workspaceId, workspaceAPIKey, dataSourceId, connectionId, configuration, }: {
        provider: ConnectorProvider;
        workspaceId: string;
        workspaceAPIKey: string;
        dataSourceId: string;
        connectionId: string;
        configuration: ConnectorConfiguration;
    }): Promise<ConnectorsAPIResponse<ConnectorType>>;
    updateConfiguration({ connectorId, configuration, }: {
        connectorId: string;
        configuration: UpdateConnectorConfigurationType;
    }): Promise<ConnectorsAPIResponse<ConnectorType>>;
    updateConnector({ connectorId, connectionId, }: {
        connectorId: string;
        connectionId: string;
    }): Promise<ConnectorsAPIResponse<{
        connectorId: string;
    }>>;
    stopConnector(connectorId: string): Promise<ConnectorsAPIResponse<undefined>>;
    pauseConnector(connectorId: string): Promise<ConnectorsAPIResponse<undefined>>;
    unpauseConnector(connectorId: string): Promise<ConnectorsAPIResponse<undefined>>;
    resumeConnector(connectorId: string): Promise<ConnectorsAPIResponse<undefined>>;
    syncConnector(connectorId: string): Promise<ConnectorsAPIResponse<{
        workflowId: string;
    }>>;
    deleteConnector(connectorId: string, force?: boolean): Promise<ConnectorsAPIResponse<{
        success: true;
    }>>;
    getConnectorPermissions<T extends ConnectorPermission = ConnectorPermission>({ connectorId, filterPermission, parentId, viewType, }: {
        connectorId: string;
        filterPermission?: T;
        parentId?: string;
        viewType?: ContentNodesViewType;
    }): Promise<ConnectorsAPIResponse<{
        resources: (T extends "read" ? ContentNodeWithParent : ContentNode)[];
    }>>;
    setConnectorPermissions({ connectorId, resources, }: {
        connectorId: string;
        resources: {
            internalId: string;
            permission: ConnectorPermission;
        }[];
    }): Promise<ConnectorsAPIResponse<void>>;
    getConnector(connectorId: string): Promise<ConnectorsAPIResponse<ConnectorType>>;
    getConnectorFromDataSource(dataSource: DataSourceType): Promise<ConnectorsAPIResponse<ConnectorType>>;
    getConnectors(provider: ConnectorProvider, connectorIds: string[]): Promise<ConnectorsAPIResponse<ConnectorType[]>>;
    setConnectorConfig(connectorId: string, configKey: string, configValue: string): Promise<ConnectorsAPIResponse<void>>;
    getConnectorConfig(connectorId: string, configKey: string): Promise<ConnectorsAPIResponse<{
        connectorId: number;
        configKey: string;
        configValue: string;
    }>>;
    linkSlackChannelsWithAgent({ connectorId, slackChannelInternalIds, agentConfigurationId, }: {
        connectorId: string;
        slackChannelInternalIds: string[];
        agentConfigurationId: string;
    }): Promise<ConnectorsAPIResponse<{
        success: true;
    }>>;
    getSlackChannelsLinkedWithAgent({ connectorId, }: {
        connectorId: string;
    }): Promise<ConnectorsAPIResponse<{
        slackChannels: {
            slackChannelId: string;
            slackChannelName: string;
            agentConfigurationId: string;
        }[];
    }>>;
    admin(adminCommand: AdminCommandType): Promise<ConnectorsAPIResponse<AdminResponseType>>;
    getDefaultHeaders(): {
        "Content-Type": string;
        Authorization: string;
    };
    private _fetchWithError;
    private _resultFromResponse;
}
//# sourceMappingURL=connectors_api.d.ts.map