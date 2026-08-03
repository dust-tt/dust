import type { CoreAPITable } from "@app/types/core/core_api";

export type PatchTableResponseBody = {
  table?: { table_id: string };
};

export type GetDataSourceViewTableResponseBody = {
  table: CoreAPITable;
};
