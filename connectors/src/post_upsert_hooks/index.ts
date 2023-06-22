import { documentTrackerPostUpsertHook } from "@connectors/post_upsert_hooks/document_tracker";
import { DataSourceConfig } from "@connectors/types/data_source_config";

export type PostUpsertHook = (
  dataSourceConfig: DataSourceConfig,
  documentId: string
) => Promise<void>;

export const POST_UPSERT_HOOKS: PostUpsertHook[] = [
  documentTrackerPostUpsertHook,
];
