import { defineSignal } from "@temporalio/workflow";

export const storeAgentMessageConsumptionAttributionV3Signal = defineSignal<
  [void]
>("store_agent_message_consumption_attribution_v3_signal");
