import { CLAUDE_SONNET_5_MODEL_ID } from "@app/types/assistant/models/anthropic";
import type { ModelIdType } from "@app/types/assistant/models/types";
import type { PlanGatewayType } from "@app/types/plan";

// Models each gateway serves, i.e. the models with a stream endpoint on the gateway's host. Kept
// as a plain list so client code can gate the model picker without loading the endpoints.
export const GATEWAY_MODEL_IDS: Record<PlanGatewayType, readonly ModelIdType[]> =
  {
    edgee: [CLAUDE_SONNET_5_MODEL_ID],
  };
