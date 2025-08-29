import type { BlockedToolExecution } from "@app/lib/actions/mcp";
import type { LightAgentMessageType } from "@app/types";

export type BlockedActionQueueItem = {
  message?: LightAgentMessageType;
  blockedAction: BlockedToolExecution;
};
