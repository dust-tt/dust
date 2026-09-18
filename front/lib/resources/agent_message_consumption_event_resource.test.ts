import type { Authenticator } from "@app/lib/auth";
import { AgentMessageConsumptionEventResource } from "@app/lib/resources/agent_message_consumption_event_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { getNamespace } from "@app/tests/utils/test_cls";
import type { EnabledAgentMessageConsumptionMode } from "@app/types/assistant/agent_message_consumption";
import type { LightWorkspaceType } from "@app/types/user";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let auth: Authenticator;
let workspace: LightWorkspaceType;

describe("AgentMessageConsumptionEventResource pending events", () => {
  beforeEach(async () => {
    ({ authenticator: auth, workspace } = await createResourceTest({}));
  });

  afterEach(() => vi.restoreAllMocks());

  it("lists only unprocessed events for one execution", async () => {
    const get = vi.fn(() => ({ id: 42 }));
    const findAll = vi
      .spyOn(AgentMessageConsumptionEventResource.model, "findAll")
      .mockResolvedValue([{ get }] as never);

    const events = await AgentMessageConsumptionEventResource.listUnprocessed(
      auth,
      { runKey: "execution", limit: 256 }
    );

    expect(events.map((event) => event.id)).toEqual([42]);
    expect(findAll).toHaveBeenCalledWith({
      where: {
        workspaceId: workspace.id,
        runKey: "execution",
        processedAt: null,
      },
      order: [["id", "ASC"]],
      limit: 256,
    });
  });

  it("acknowledges only the requested pending events", async () => {
    const processedAt = new Date("2026-08-27T12:00:00.000Z");
    const append = (idempotencyKey: string, runKey: string) =>
      withTransaction((transaction) =>
        AgentMessageConsumptionEventResource.append(auth, {
          event: {
            kind: "items_changed",
            idempotencyKey,
            runKey,
            rootAgentMessageId: 7,
            agentMessageModelId: 8,
            consumptionItemIds: [11],
          },
          transaction,
        })
      );
    const requestedEvent = await append("requested", "execution");
    const unrequestedEvent = await append("unrequested", "execution");
    const otherRunEvent = await append("other-run", "other-execution");

    await expect(
      AgentMessageConsumptionEventResource.markProcessed(auth, {
        runKey: "execution",
        eventModelIds: [requestedEvent.id, otherRunEvent.id],
        processedAt,
      })
    ).resolves.toBe(1);
    await expect(
      AgentMessageConsumptionEventResource.markProcessed(auth, {
        runKey: "execution",
        eventModelIds: [requestedEvent.id],
        processedAt,
      })
    ).resolves.toBe(0);

    const [processed, unprocessed, otherRun] = await Promise.all([
      AgentMessageConsumptionEventResource.fetchByEventKey(auth, {
        eventKey: requestedEvent.eventKey,
      }),
      AgentMessageConsumptionEventResource.fetchByEventKey(auth, {
        eventKey: unrequestedEvent.eventKey,
      }),
      AgentMessageConsumptionEventResource.fetchByEventKey(auth, {
        eventKey: otherRunEvent.eventKey,
      }),
    ]);

    expect(processed?.processedAt).toEqual(processedAt);
    expect(unprocessed?.processedAt).toBeNull();
    expect(otherRun?.processedAt).toBeNull();
  });
});

describe("AgentMessageConsumptionEventResource append", () => {
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
            kind: "items_changed",
            idempotencyKey: "items:retry",
            runKey: "run",
            rootAgentMessageId: 7,
            agentMessageModelId: 8,
            consumptionItemIds: [11],
          },
          transaction,
        })
      );

    const first = await append();
    const second = await append();

    expect(second.id).toBe(first.id);
  });

  it("rejects an idempotency key reused for a different event", async () => {
    const append = (runKey: string) =>
      withTransaction((transaction) =>
        AgentMessageConsumptionEventResource.append(auth, {
          event: {
            kind: "items_changed",
            idempotencyKey: "items:collision",
            runKey,
            rootAgentMessageId: 7,
            agentMessageModelId: 8,
            consumptionItemIds: [11],
          },
          transaction,
        })
      );

    await append("run-a");

    await expect(append("run-b")).rejects.toThrow(
      "A consumption event key cannot identify different events"
    );
  });

  it("rolls back an event with its caller transaction", async () => {
    const parentTransaction =
      getNamespace("test-namespace")?.get("transaction");
    expect(parentTransaction).toBeDefined();
    const transaction = await frontSequelize.transaction({
      transaction: parentTransaction,
    });

    try {
      await AgentMessageConsumptionEventResource.append(auth, {
        event: {
          kind: "items_changed",
          idempotencyKey: "items:rollback",
          runKey: "run",
          rootAgentMessageId: 7,
          agentMessageModelId: 8,
          consumptionItemIds: [11],
        },
        transaction,
      });
    } finally {
      await transaction.rollback();
    }

    await expect(
      AgentMessageConsumptionEventResource.fetchByEventKey(auth, {
        eventKey: "items:rollback",
      })
    ).resolves.toBeNull();
  });

  it("fetches the latest execution-started mode for an agent message", async () => {
    const appendStarted = (
      idempotencyKey: string,
      runKey: string,
      consumptionMode: EnabledAgentMessageConsumptionMode
    ) =>
      AgentMessageConsumptionEventResource.append(auth, {
        event: {
          kind: "execution_started",
          idempotencyKey,
          runKey,
          rootAgentMessageId: 7,
          agentMessageModelId: 8,
          consumptionMode,
        },
      });
    await appendStarted("execution:first:started", "first", "shadow");
    await appendStarted("execution:second:started", "second", "live");

    await expect(
      AgentMessageConsumptionEventResource.fetchLatestExecutionStartedForAgentMessage(
        auth,
        { agentMessageModelId: 8 }
      )
    ).resolves.toEqual({
      rootAgentMessageId: 7,
      consumptionMode: "live",
    });
    await expect(
      AgentMessageConsumptionEventResource.fetchLatestExecutionStartedForAgentMessage(
        auth,
        { agentMessageModelId: 9 }
      )
    ).resolves.toBeNull();
  });
});
