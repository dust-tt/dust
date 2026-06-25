import type { InternalConnectorType } from "@app/types/connectors/connectors_api";
import type { SlackAutoReadPattern } from "@app/types/connectors/slack";
import type { CoreAPITable } from "@app/types/core/core_api";
import type {
  CoreAPIDataSource,
  CoreAPIDocument,
} from "@app/types/core/data_source";
import type { DataSourceType } from "@app/types/data_source";
import type { DataSourceViewType } from "@app/types/data_source_view";
import type { DocumentType } from "@app/types/document";

export type PokeListDataSources = {
  data_sources: DataSourceType[];
};

export type FeaturesType = {
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

export type PokeGetDataSourceDetails = {
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
};

export type PokeGetDocument = {
  document: CoreAPIDocument;
};

export type GetDocumentsResponseBody = {
  documents: Array<DocumentType>;
  total: number;
};

export type GetTablesResponseBody = {
  tables: Array<CoreAPITable>;
  total: number;
};
