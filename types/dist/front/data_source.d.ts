import { ModelId } from "../shared/model_id";
import { Result } from "../shared/result";
import { DataSourceViewType } from "./data_source_view";
import { ConnectorType } from "./lib/connectors_api";
export declare const CONNECTOR_PROVIDERS: readonly ["confluence", "github", "google_drive", "intercom", "notion", "slack", "microsoft", "webcrawler", "snowflake", "zendesk", "bigquery", "salesforce", "gong"];
export type ConnectorProvider = (typeof CONNECTOR_PROVIDERS)[number];
export declare function isConnectorProvider(val: string): val is ConnectorProvider;
export type EditedByUser = {
    editedAt: number | null;
    fullName: string | null;
    imageUrl: string | null;
    email: string | null;
    userId: string | null;
};
export type DataSourceType = {
    id: ModelId;
    sId: string;
    createdAt: number;
    name: string;
    description: string | null;
    assistantDefaultSelected: boolean;
    dustAPIProjectId: string;
    dustAPIDataSourceId: string;
    connectorId: string | null;
    connectorProvider: ConnectorProvider | null;
    editedByUser?: EditedByUser | null;
};
export type WithConnector = {
    connectorProvider: ConnectorProvider;
    connectorId: string;
};
export type ConnectorStatusDetails = {
    connector: ConnectorType | null;
    fetchConnectorError: boolean;
    fetchConnectorErrorMessage: string | null;
};
export type DataSourceWithConnectorDetailsType = DataSourceType & WithConnector & ConnectorStatusDetails;
export type DataSourceWithAgentsUsageType = {
    count: number;
    agentNames: string[];
};
export declare function isDataSourceNameValid(name: string): Result<void, string>;
export type TagSearchParams = {
    query: string;
    queryType: string;
    dataSourceViews: DataSourceViewType[];
};
export type DataSourceTag = {
    tag: string;
    dustAPIDataSourceId: string;
    connectorProvider: ConnectorProvider | null;
};
//# sourceMappingURL=data_source.d.ts.map