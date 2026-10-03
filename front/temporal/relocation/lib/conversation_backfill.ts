import type { DataSourceCoreIds } from "@app/temporal/relocation/activities/types";
import type { CellType } from "@app/types/cell";
import { SUPPORTED_CELLS } from "@app/types/cell";
import { z } from "zod";

export const CONVERSATION_BACKFILL_BATCH_SIZE = 100;
export const CONVERSATION_BACKFILL_DEFAULT_CONCURRENCY = 5;
export const CONVERSATION_BACKFILL_MAX_CONCURRENCY = 20;

export interface ConversationBackfillScope {
  workspaceId: string;
  sourceCell: CellType;
  destCell: CellType;
}

export const ConversationBackfillSourceSchema = z.object({
  id: z.number().int().positive().safe(),
  conversationId: z.number().int().positive().safe(),
  dustAPIProjectId: z.string().min(1),
  dustAPIDataSourceId: z.string().min(1),
});

export type ConversationBackfillSource = z.infer<
  typeof ConversationBackfillSourceSchema
>;

export const ConversationBackfillManifestSchema = z.object({
  workspaceId: z.string().min(1),
  sourceCell: z.enum(SUPPORTED_CELLS),
  dataSources: z.array(ConversationBackfillSourceSchema).max(100),
});

export const ConversationBackfillBatchSchema = z.object({
  workspaceId: z.string().min(1),
  sourceCell: z.enum(SUPPORTED_CELLS),
  destCell: z.enum(SUPPORTED_CELLS),
  dataSources: z.array(ConversationBackfillSourceSchema).min(1).max(100),
});

export interface ConversationBackfillInventory {
  inventoryId: string;
  batchCount: number;
  sourceCount: number;
}

export interface ConversationBackfillState {
  inventory: ConversationBackfillInventory;
  batchIndex: number;
  offset: number;
  completed: number;
}

export type ConversationBackfillSourceState = {
  source: ConversationBackfillSource;
  status: "NOT_STARTED" | "RUNNING" | "COMPLETED";
};

export function conversationBackfillSourceWorkflowId(
  workspaceId: string,
  id: number
): string {
  return `workspaceRelocateDataSourceCoreWorkflow-${workspaceId}-${id}`;
}

export function sameCoreDataSource(
  left: DataSourceCoreIds,
  right: DataSourceCoreIds
): boolean {
  return (
    left.dustAPIProjectId === right.dustAPIProjectId &&
    left.dustAPIDataSourceId === right.dustAPIDataSourceId
  );
}
