import { DustAppParameters } from "../../../front/assistant/actions/dust_app_run";
import { BaseAction } from "../../../front/lib/api/assistant/actions/index";
import { ModelId } from "../../../shared/model_id";

export type TablesQueryConfigurationType = {
  description: string | null;
  id: ModelId;
  name: string;
  sId: string;
  tables: TableDataSourceConfiguration[];
  type: "tables_query_configuration";
};

export type TableDataSourceConfiguration = {
  workspaceId: string;
  dataSourceViewId: string;
  tableId: string;
};

export interface TablesQueryActionType extends BaseAction {
  id: ModelId;
  params: DustAppParameters;
  output: Record<string, string | number | boolean> | null;
  resultsFileId: string | null;
  resultsFileSnippet: string | null;
  functionCallId: string | null;
  functionCallName: string | null;
  agentMessageId: ModelId;
  step: number;
  type: "tables_query_action";
}

export function getTablesQueryResultsFileTitle({
  output,
}: {
  output: Record<string, unknown> | null;
}): string {
  return typeof output?.query_title === "string"
    ? output.query_title
    : "query_results";
}

export function getTablesQueryResultsFileAttachment({
  resultsFileId,
  resultsFileSnippet,
  output,
  includeSnippet = true,
}: {
  resultsFileId: string | null;
  resultsFileSnippet: string | null;
  output: Record<string, unknown> | null;
  includeSnippet: boolean;
}): string | null {
  if (!resultsFileId || !resultsFileSnippet) {
    return null;
  }

  const attachment =
    `<file ` +
    `id="${resultsFileId}" type="text/csv" title=${getTablesQueryResultsFileTitle(
      { output }
    )}`;

  if (!includeSnippet) {
    return `${attachment} />`;
  }

  return `${attachment}>\n${resultsFileSnippet}\n</file>`;
}
