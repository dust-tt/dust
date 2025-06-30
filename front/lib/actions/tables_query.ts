import { getTablesQueryResultsFileTitle } from "@app/components/actions/tables_query/utils";
import {
  generateCSVFileAndSnippet,
  generateSectionFile,
  uploadFileToConversationDataSource,
} from "@app/lib/actions/action_file_helpers";
import { DEFAULT_TABLES_QUERY_ACTION_NAME } from "@app/lib/actions/constants";
import type { DustAppParameters } from "@app/lib/actions/dust_app_run";
import { runActionStreamed } from "@app/lib/actions/server";
import type {
  ActionGeneratedFileType,
  BaseActionRunParams,
  ExtractActionBlob,
} from "@app/lib/actions/types";
import {
  BaseAction,
  BaseActionConfigurationServerRunner,
} from "@app/lib/actions/types";
import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { dustAppRunInputsToInputSchema } from "@app/lib/actions/types/agent";
import {
  getAttachmentFromToolOutput,
  renderAttachmentXml,
} from "@app/lib/api/assistant/conversation/attachments";
import { renderConversationForModel } from "@app/lib/api/assistant/preprocessing";
import type { CSVRecord } from "@app/lib/api/csv";
import { getSupportedModelConfig } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { AgentTablesQueryAction } from "@app/lib/models/assistant/actions/tables_query";
import { cloneBaseConfig, getDustProdAction } from "@app/lib/registry";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { sanitizeJSONOutput } from "@app/lib/utils";
import logger from "@app/logger/logger";
import type {
  ConnectorProvider,
  FunctionCallType,
  FunctionMessageTypeModel,
  ModelId,
  Result,
} from "@app/types";
import { Ok, removeNulls } from "@app/types";

export type TablesQueryConfigurationType = {
  description: string | null;
  id: ModelId;
  name: string;
  sId: string;
  tables: TableDataSourceConfiguration[];
  type: "tables_query_configuration";
};

export type TableDataSourceConfiguration = {
  sId?: string; // The sId is not always available, for instance it is not in an unsaved state of the builder.
  workspaceId: string;
  dataSourceViewId: string;
  tableId: string;
};
