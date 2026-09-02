import type { Authenticator } from "@app/lib/auth";
import { AgentMessageConsumptionEventResource } from "@app/lib/resources/agent_message_consumption_event_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { beforeEach, describe, expect, it } from "vitest";

let auth: Authenticator;

describe("AgentMessageConsumptionEventResource", () => {
  beforeEach(async () => {
    ({ authenticator: auth } = await createResourceTest({}));
  });

  it("appends an event from object arguments", async () => {
    const event = await withTransaction((transaction) =>
      AgentMessageConsumptionEventResource.append(auth, {
        event: {
          kind: "items_changed",
          idempotencyKey: "items:changed",
          runKey: "run",
          rootAgentMessageId: 7,
          agentMessageModelId: 8,
          consumptionItemIds: [11, 12],
        },
        transaction,
      })
    );

    expect(event).toMatchObject({
      kind: "items_changed",
      eventKey: "items:changed",
      runKey: "run",
      rootAgentMessageId: 7,
      agentMessageId: 8,
      consumptionItemIds: [11, 12],
    });
  });

  it("returns the existing event when the same event is appended again", async () => {
    const append = () =>
      withTransaction((transaction) =>
        AgentMessageConsumptionEventResource.append(auth, {
          event: {
            kind: "execution_started",
            idempotencyKey: "execution:started",
            runKey: "run",
            rootAgentMessageId: 7,
            agentMessageModelId: 8,
          },
          transaction,
        })
      );

    const first = await append();
    const second = await append();

    expect(second.id).toBe(first.id);
  });
});
