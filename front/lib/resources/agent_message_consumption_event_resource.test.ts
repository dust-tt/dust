import type { Authenticator } from "@app/lib/auth";
import { AgentMessageConsumptionEventResource } from "@app/lib/resources/agent_message_consumption_event_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { LightWorkspaceType } from "@app/types/user";
import { Op } from "sequelize";
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
      { runKey: "execution", limit: 256 },
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
    const update = vi
      .spyOn(AgentMessageConsumptionEventResource.model, "update")
      .mockResolvedValue([2] as never);

    await expect(
      AgentMessageConsumptionEventResource.markProcessed(auth, {
        runKey: "execution",
        eventIds: [42, 43],
        processedAt,
      }),
    ).resolves.toBe(2);
    expect(update).toHaveBeenCalledWith(
      { processedAt },
      {
        where: {
          id: { [Op.in]: [42, 43] },
          workspaceId: workspace.id,
          runKey: "execution",
          processedAt: null,
        },
      },
    );
  });
});
