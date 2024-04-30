import type { TablesQueryConfigurationType } from "@app/lib/api/assistant/actions/tables_query/types";

export function tableKey(
  table: TablesQueryConfigurationType["tables"][number]
) {
  return `${table.workspaceId}/${table.dataSourceId}/${table.tableId}`;
}
