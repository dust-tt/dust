import type { TablesQueryConfigurationType } from "@dust-tt/types";

export function tableKey(
  table: TablesQueryConfigurationType["tables"][number]
) {
  return `${table.workspaceId}/${table.dataSourceId}/${table.tableId}`;
}
