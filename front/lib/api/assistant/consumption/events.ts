import type { Authenticator } from "@app/lib/auth";
import type { AgentMessageModel } from "@app/lib/models/agent/conversation";
import type { StoredConsumptionEvent } from "@app/lib/resources/agent_message_consumption_event_resource";
import { AgentMessageConsumptionEventResource } from "@app/lib/resources/agent_message_consumption_event_resource";
import type { AgentMessageStatus } from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { Transaction } from "sequelize";

export type ConsumptionEvent =
  | {
      kind: "items_changed";
      idempotencyKey: string;
      runKey: string;
      rootAgentMessageId: string;
      agentMessageModelId: ModelId;
      consumptionItemIds: ModelId[];
    }
  | {
      kind: "execution_started";
      idempotencyKey: string;
      runKey: string;
      rootAgentMessageId: string;
      agentMessageModelId: ModelId;
      subagentAgentMessageId: AgentMessageModel["id"] | null;
    }
  | {
      kind: "execution_finalized";
      idempotencyKey: string;
      runKey: string;
      rootAgentMessageId: string;
      agentMessageModelId: ModelId;
      status: AgentMessageStatus;
    };

function storedConsumptionEvent(
  event: ConsumptionEvent
): StoredConsumptionEvent {
  const common = {
    agentMessageModelId: event.agentMessageModelId,
    eventKey: event.idempotencyKey,
    rootAgentMessageId: event.rootAgentMessageId,
    runKey: event.runKey,
  };

  switch (event.kind) {
    case "items_changed":
      return {
        ...common,
        kind: event.kind,
        consumptionItemIds: event.consumptionItemIds,
      };

    case "execution_started":
      return {
        ...common,
        kind: event.kind,
        subagentAgentMessageId: event.subagentAgentMessageId,
      };

    case "execution_finalized":
      return {
        ...common,
        kind: event.kind,
        status: event.status,
      };

    default:
      return assertNever(event);
  }
}

export async function appendConsumptionEvent(
  auth: Authenticator,
  event: ConsumptionEvent,
  { transaction }: { transaction: Transaction }
): Promise<AgentMessageConsumptionEventResource> {
  return AgentMessageConsumptionEventResource.append(
    auth,
    storedConsumptionEvent(event),
    { transaction }
  );
}

export async function hasConsumptionEventForIdempotencyKey(
  auth: Authenticator,
  { idempotencyKey }: { idempotencyKey: string }
): Promise<boolean> {
  const event = await AgentMessageConsumptionEventResource.fetchByEventKey(
    auth,
    { eventKey: idempotencyKey }
  );
  return event !== null;
}
