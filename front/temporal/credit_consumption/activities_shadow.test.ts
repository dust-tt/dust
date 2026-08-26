import { AgentMessageConsumptionEventResource } from "@app/lib/resources/agent_message_consumption_event_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import {
  applyConsumptionEventsActivity,
  markConsumptionEventsProcessedActivity,
} from "@app/temporal/credit_consumption/activities";
import { describe, expect, it } from "vitest";

describe("consumption event projection", () => {
  it("acknowledges execution-started events without projecting a snapshot", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const event = await withTransaction((transaction) =>
      AgentMessageConsumptionEventResource.append(auth, {
        event: {
          kind: "execution_started",
          idempotencyKey: "execution:started:projection-test",
          runKey: "projection-test",
          rootAgentMessageModelId: 7,
          agentMessageModelId: 8,
          consumptionMode: "shadow",
        },
        transaction,
      })
    );

    const result = await applyConsumptionEventsActivity(auth.toJSON(), {
      runKey: "projection-test",
    });
    expect(result).toEqual({
      eventModelIds: [event.id],
      esPending: false,
      hasMore: false,
      finalizedExecution: null,
    });

    await markConsumptionEventsProcessedActivity(auth.toJSON(), {
      runKey: "projection-test",
      eventModelIds: result.eventModelIds,
    });
    expect(
      await AgentMessageConsumptionEventResource.listUnprocessed(auth, {
        runKey: "projection-test",
        limit: 10,
      })
    ).toEqual([]);
  });
});
