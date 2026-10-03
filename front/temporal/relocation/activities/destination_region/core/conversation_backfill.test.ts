import { verifyConversationBackfillDestination } from "@app/temporal/relocation/activities/destination_region/core/conversation_backfill";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findAll: vi.fn() }));
vi.mock("@app/lib/api/cells/config", () => ({
  config: { getCurrentCell: () => ({ name: "cell-00001" }) },
}));
vi.mock("@app/lib/api/workspace", () => ({
  getWorkspaceInfos: async () => ({ id: 42 }),
}));
vi.mock("@app/lib/resources/storage/models/data_source", () => ({
  DataSourceModel: { findAll: mocks.findAll },
}));

const scope = {
  workspaceId: "workspace1",
  sourceCell: "cell-00000" as const,
  destCell: "cell-00001" as const,
};
const source = {
  id: 10,
  conversationId: 20,
  dustAPIProjectId: "old-project",
  dustAPIDataSourceId: "old-source",
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.findAll.mockResolvedValue([source]);
});

describe("conversation backfill destination guard", () => {
  it("allows a new source only while it retains its original Core IDs", async () => {
    await verifyConversationBackfillDestination({
      ...scope,
      states: [{ source, status: "NOT_STARTED" }],
    });
    expect(mocks.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: 42 }),
      })
    );
  });

  it("does not infer success from changed Core IDs without an execution", async () => {
    mocks.findAll.mockResolvedValue([{ ...source, dustAPIProjectId: "new" }]);
    await expect(
      verifyConversationBackfillDestination({
        ...scope,
        states: [{ source, status: "NOT_STARTED" }],
      })
    ).rejects.toThrow("Core IDs disagree");
  });

  it("requires completed executions to have switched destination IDs", async () => {
    await expect(
      verifyConversationBackfillDestination({
        ...scope,
        states: [{ source, status: "COMPLETED" }],
      })
    ).rejects.toThrow("Core IDs disagree");
    mocks.findAll.mockResolvedValue([{ ...source, dustAPIProjectId: "new" }]);
    await verifyConversationBackfillDestination({
      ...scope,
      states: [{ source, status: "COMPLETED" }],
    });
  });

  it("allows running executions before or after their ID switch", async () => {
    for (const row of [source, { ...source, dustAPIProjectId: "new" }]) {
      mocks.findAll.mockResolvedValue([row]);
      await verifyConversationBackfillDestination({
        ...scope,
        states: [{ source, status: "RUNNING" }],
      });
    }
  });

  it("blocks a missing or different conversation", async () => {
    for (const rows of [[], [{ ...source, conversationId: 999 }]]) {
      mocks.findAll.mockResolvedValue(rows);
      await expect(
        verifyConversationBackfillDestination({
          ...scope,
          states: [{ source, status: "NOT_STARTED" }],
        })
      ).rejects.toThrow("missing, deleted, or has a different conversation");
    }
  });
});
