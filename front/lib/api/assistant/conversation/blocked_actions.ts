import type { BlockedToolExecution } from "@app/lib/actions/mcp";

export type GetBlockedActionsResponseType = {
  blockedActions: BlockedToolExecution[];
};
