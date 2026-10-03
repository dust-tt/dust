import { workspaceBackfillConversationDataSourcesWorkflow } from "@app/temporal/relocation/backfill_workflows";
import type {
  ConversationBackfillSource,
  ConversationBackfillSourceState,
} from "@app/temporal/relocation/lib/conversation_backfill";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prepareConversationBackfillInventory: vi.fn(),
  readConversationBackfillBatch: vi.fn(),
  inspectConversationBackfillSources: vi.fn(),
  startConversationBackfillSources: vi.fn(),
  verifyConversationBackfillDestination: vi.fn(),
  historyLength: 0,
  continueAsNew: vi.fn(),
  sleep: vi.fn(),
  setHandler: vi.fn(),
  proxyActivities: vi.fn(),
}));

vi.mock("@temporalio/workflow", () => ({
  proxyActivities: mocks.proxyActivities,
  continueAsNew: mocks.continueAsNew,
  sleep: mocks.sleep,
  setHandler: mocks.setHandler,
  defineQuery: (name: string) => name,
  workflowInfo: () => ({ historyLength: mocks.historyLength }),
}));

const scope = {
  workspaceId: "workspace1",
  sourceCell: "cell-00000" as const,
  destCell: "cell-00001" as const,
};
const sources: ConversationBackfillSource[] = Array.from(
  { length: 5 },
  (_, i) => ({
    id: i + 1,
    conversationId: i + 100,
    dustAPIProjectId: `project-${i}`,
    dustAPIDataSourceId: `source-${i}`,
  })
);
const inventory = { inventoryId: "frozen-run", batchCount: 1, sourceCount: 5 };
const statuses = new Map<number, ConversationBackfillSourceState["status"]>();

beforeEach(() => {
  vi.resetAllMocks();
  statuses.clear();
  mocks.historyLength = 0;
  mocks.proxyActivities.mockReturnValue(mocks);
  mocks.prepareConversationBackfillInventory.mockResolvedValue(inventory);
  mocks.readConversationBackfillBatch.mockResolvedValue(sources);
  mocks.inspectConversationBackfillSources.mockImplementation(
    async ({ sources: group }: { sources: ConversationBackfillSource[] }) =>
      group.map((source) => ({
        source,
        status: statuses.get(source.id) ?? "NOT_STARTED",
      }))
  );
  mocks.startConversationBackfillSources.mockImplementation(
    async ({ sources: group }: { sources: ConversationBackfillSource[] }) => {
      for (const source of group) {
        statuses.set(source.id, "COMPLETED");
      }
    }
  );
  mocks.continueAsNew.mockRejectedValue(new Error("CONTINUE_AS_NEW"));
});

describe("conversation backfill coordinator", () => {
  it("processes bounded groups and verifies completion before advancing", async () => {
    const events: string[] = [];
    mocks.startConversationBackfillSources.mockImplementation(
      async ({ sources: group }: { sources: ConversationBackfillSource[] }) => {
        expect([...statuses.values()]).not.toContain("RUNNING");
        events.push(`start:${group.map((source) => source.id).join(",")}`);
        for (const source of group) {
          statuses.set(source.id, "RUNNING");
        }
      }
    );
    mocks.sleep.mockImplementation(async () => {
      events.push("wait");
      for (const id of statuses.keys()) {
        statuses.set(id, "COMPLETED");
      }
    });
    const result = await workspaceBackfillConversationDataSourcesWorkflow({
      ...scope,
      concurrency: 2,
    });
    expect(events).toEqual([
      "start:1,2",
      "wait",
      "start:3,4",
      "wait",
      "start:5",
      "wait",
    ]);
    expect(result.completed).toBe(5);
    expect(mocks.verifyConversationBackfillDestination).toHaveBeenCalledTimes(
      6
    );
    expect(mocks.proxyActivities).toHaveBeenCalledWith(
      expect.objectContaining({ taskQueue: "relocation-queue-cell-00000-v2" })
    );
    expect(mocks.proxyActivities).toHaveBeenCalledWith(
      expect.objectContaining({ taskQueue: "relocation-queue-cell-00001-v2" })
    );
  });

  it("continues as new during polling without advancing the unfinished group", async () => {
    mocks.startConversationBackfillSources.mockImplementation(async () => {
      for (const source of sources) {
        statuses.set(source.id, "RUNNING");
      }
      mocks.historyLength = 6000;
    });
    await expect(
      workspaceBackfillConversationDataSourcesWorkflow({
        ...scope,
        concurrency: 5,
      })
    ).rejects.toThrow("CONTINUE_AS_NEW");
    expect(mocks.continueAsNew).toHaveBeenCalledExactlyOnceWith({
      ...scope,
      concurrency: 5,
      state: { inventory, batchIndex: 0, offset: 0, completed: 0 },
    });
  });

  it("resumes the frozen inventory and cursor without rebuilding it", async () => {
    const result = await workspaceBackfillConversationDataSourcesWorkflow({
      ...scope,
      concurrency: 2,
      state: { inventory, batchIndex: 0, offset: 2, completed: 2 },
    });
    expect(mocks.prepareConversationBackfillInventory).not.toHaveBeenCalled();
    expect(
      mocks.startConversationBackfillSources.mock.calls[0][0].sources
    ).toEqual(sources.slice(2, 4));
    expect(result.completed).toBe(5);
  });

  it("advances across inventory batches without losing sources", async () => {
    mocks.prepareConversationBackfillInventory.mockResolvedValue({
      ...inventory,
      batchCount: 2,
    });
    mocks.readConversationBackfillBatch
      .mockResolvedValueOnce(sources.slice(0, 3))
      .mockResolvedValueOnce(sources.slice(3));
    const result = await workspaceBackfillConversationDataSourcesWorkflow({
      ...scope,
      concurrency: 2,
    });
    expect(result.completed).toBe(5);
    expect(result.batchIndex).toBe(2);
    expect(result.offset).toBe(0);
    expect(mocks.readConversationBackfillBatch).toHaveBeenNthCalledWith(2, {
      ...scope,
      inventoryId: inventory.inventoryId,
      batchIndex: 1,
    });
  });

  it("stops before starting a group if destination preflight fails", async () => {
    mocks.verifyConversationBackfillDestination.mockRejectedValue(
      new Error("Destination conflict")
    );
    await expect(
      workspaceBackfillConversationDataSourcesWorkflow(scope)
    ).rejects.toThrow("Destination conflict");
    expect(mocks.startConversationBackfillSources).not.toHaveBeenCalled();
  });

  it("does not advance the cursor on a failed per-source execution", async () => {
    mocks.inspectConversationBackfillSources.mockRejectedValue(
      new Error("Backfill blocked by FAILED execution")
    );
    await expect(
      workspaceBackfillConversationDataSourcesWorkflow(scope)
    ).rejects.toThrow("FAILED");
    const readProgress = mocks.setHandler.mock.calls[0][1];
    expect(readProgress().completed).toBe(0);
    expect(mocks.startConversationBackfillSources).not.toHaveBeenCalled();
  });

  it.each([
    0,
    -1,
    21,
    1.5,
  ])("rejects invalid concurrency %s", async (concurrency) => {
    await expect(
      workspaceBackfillConversationDataSourcesWorkflow({
        ...scope,
        concurrency,
      })
    ).rejects.toThrow("Invalid backfill");
    expect(mocks.prepareConversationBackfillInventory).not.toHaveBeenCalled();
  });
});
