import type { Authenticator } from "@app/lib/auth";
import { AgentMessageConsumptionEventResource } from "@app/lib/resources/agent_message_consumption_event_resource";
import { Op } from "sequelize";
import { afterEach, describe, expect, it, vi } from "vitest";

const auth = {
  getNonNullableWorkspace: () => ({ id: 123 }),
} as unknown as Authenticator;

describe("AgentMessageConsumptionEventResource pending events", () => {
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
      where: { workspaceId: 123, runKey: "execution", processedAt: null },
      order: [["id", "ASC"]],
      limit: 256,
    });
  });

  it("acknowledges only the requested pending events", async () => {
    const processedAt = new Date("2026-08-27T12:00:00.000Z");
    const update = vi
      .spyOn(AgentMessageConsumptionEventResource.model, "update")
      .mockResolvedValue([2] as never);

    await expect(
      AgentMessageConsumptionEventResource.markProcessed(auth, {
        runKey: "execution",
        eventIds: [42, 43],
        processedAt,
      })
    ).resolves.toBe(2);
    expect(update).toHaveBeenCalledWith(
      { processedAt },
      {
        where: {
          id: { [Op.in]: [42, 43] },
          workspaceId: 123,
          runKey: "execution",
          processedAt: null,
        },
      }
    );
  });

  it("deduplicates the bounded recovery scan by execution", async () => {
    vi.spyOn(
      AgentMessageConsumptionEventResource.model,
      "findAll"
    ).mockResolvedValue([
      { runKey: "run-a", workspaceId: 123 },
      { runKey: "run-a", workspaceId: 123 },
      { runKey: "run-b", workspaceId: 123 },
    ] as never);

    await expect(
      AgentMessageConsumptionEventResource.listOldestUnprocessedExecutions({
        limit: 3,
      })
    ).resolves.toEqual({
      executions: [
        { runKey: "run-a", workspaceModelId: 123 },
        { runKey: "run-b", workspaceModelId: 123 },
      ],
      hasMore: true,
    });
  });
});
