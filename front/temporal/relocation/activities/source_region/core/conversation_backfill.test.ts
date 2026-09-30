import {
  inspectConversationBackfillSources,
  prepareConversationBackfillInventory,
  readConversationBackfillBatch,
  startConversationBackfillSources,
} from "@app/temporal/relocation/activities/source_region/core/conversation_backfill";
import { RELOCATION_QUEUES_PER_CELL } from "@app/temporal/relocation/config";
import { WorkflowIdReusePolicy, WorkflowNotFoundError } from "@temporalio/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAllFilesByPrefix: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
  heartbeat: vi.fn(),
  findAll: vi.fn(),
  getWorkspaceInfos: vi.fn(),
  describe: vi.fn(),
  start: vi.fn(),
  getHandle: vi.fn(),
}));

vi.mock("@app/lib/api/cells/config", () => ({
  config: { getCurrentCell: () => ({ name: "cell-00000" }) },
}));
vi.mock("@app/lib/api/workspace", () => ({
  getWorkspaceInfos: mocks.getWorkspaceInfos,
}));
vi.mock("@app/lib/resources/storage/models/data_source", () => ({
  DataSourceModel: { findAll: mocks.findAll },
}));
vi.mock("@app/lib/file_storage", () => ({
  getBucketInstance: () => ({ getAllFilesByPrefix: mocks.getAllFilesByPrefix }),
}));
vi.mock("@app/temporal/relocation/activities/config", () => ({
  default: { getGcsRelocationBucket: () => "test-bucket" },
}));
vi.mock("@app/temporal/relocation/lib/file_storage/relocation", () => ({
  readFromRelocationStorage: mocks.read,
  writeToRelocationStorage: mocks.write,
}));
vi.mock("@app/temporal/relocation/temporal", () => ({
  getTemporalRelocationClient: async () => ({
    workflow: { getHandle: mocks.getHandle, start: mocks.start },
  }),
}));
vi.mock("@temporalio/activity", () => ({
  heartbeat: mocks.heartbeat,
  activityInfo: () => ({ workflowExecution: { runId: "inventory-run" } }),
}));

const scope = {
  workspaceId: "workspace1",
  sourceCell: "cell-00000" as const,
  destCell: "cell-00001" as const,
};
const source = {
  id: 10,
  conversationId: 20,
  dustAPIProjectId: "original-project",
  dustAPIDataSourceId: "original-source",
};
const manifest = { ...scope, dataSources: [source] };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getAllFilesByPrefix.mockResolvedValue({
    files: [{ name: "first.json" }, { name: "second.json" }],
  });
  mocks.read.mockResolvedValue(manifest);
  mocks.getWorkspaceInfos.mockResolvedValue({ id: 42 });
  mocks.findAll.mockResolvedValue([source]);
  mocks.getHandle.mockReturnValue({ describe: mocks.describe });
  mocks.describe.mockRejectedValue(
    new WorkflowNotFoundError("not found", "test-workflow", undefined)
  );
});

describe("conversation backfill inventory", () => {
  it("deduplicates manifests into a workspace-scoped durable inventory", async () => {
    const result = await prepareConversationBackfillInventory(scope);
    expect(result).toEqual({
      inventoryId: "inventory-run",
      batchCount: 1,
      sourceCount: 1,
    });
    expect(mocks.write).toHaveBeenCalledExactlyOnceWith(manifest, {
      workspaceId: scope.workspaceId,
      type: "core",
      operation: "conversation_data_source_backfill",
      fileName: "inventory-run/0",
    });
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("writes sorted batches of at most 100 unique sources", async () => {
    mocks.read
      .mockResolvedValueOnce({
        ...scope,
        dataSources: Array.from({ length: 100 }, (_, index) => ({
          ...source,
          id: 101 - index,
        })),
      })
      .mockResolvedValueOnce({
        ...scope,
        dataSources: [{ ...source, id: 1 }],
      });
    const result = await prepareConversationBackfillInventory(scope);
    expect(result.sourceCount).toBe(101);
    expect(result.batchCount).toBe(2);
    expect(mocks.write.mock.calls[0][0].dataSources).toHaveLength(100);
    expect(mocks.write.mock.calls[0][0].dataSources[0].id).toBe(1);
    expect(mocks.write.mock.calls[1][0].dataSources[0].id).toBe(101);
  });

  it("rejects conflicting entries before writing the inventory", async () => {
    mocks.read.mockResolvedValueOnce(manifest).mockResolvedValueOnce({
      ...scope,
      dataSources: [{ ...source, dustAPIProjectId: "different" }],
    });
    await expect(prepareConversationBackfillInventory(scope)).rejects.toThrow(
      "Conflicting backfill manifests"
    );
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("rejects manifests from another workspace", async () => {
    mocks.read.mockResolvedValue({ ...manifest, workspaceId: "other" });
    await expect(prepareConversationBackfillInventory(scope)).rejects.toThrow(
      "out-of-scope"
    );
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("fails closed if the original manifests are missing", async () => {
    mocks.getAllFilesByPrefix.mockResolvedValue({ files: [] });
    await expect(prepareConversationBackfillInventory(scope)).rejects.toThrow(
      "Expected between"
    );
  });

  it("checks destination scope when reading the frozen inventory", async () => {
    mocks.read.mockResolvedValue({ ...manifest, destCell: "cell-00002" });
    await expect(
      readConversationBackfillBatch({
        ...scope,
        inventoryId: "inventory-run",
        batchIndex: 0,
      })
    ).rejects.toThrow("Invalid backfill inventory batch");
  });
});

describe("conversation backfill source executions", () => {
  it("starts the existing per-source workflow with duplicate rejection", async () => {
    await startConversationBackfillSources({ ...scope, sources: [source] });
    expect(mocks.start).toHaveBeenCalledExactlyOnceWith(
      "workspaceRelocateDataSourceCoreWorkflow",
      expect.objectContaining({
        workflowId: "workspaceRelocateDataSourceCoreWorkflow-workspace1-10",
        workflowIdReusePolicy: WorkflowIdReusePolicy.REJECT_DUPLICATE,
        taskQueue: RELOCATION_QUEUES_PER_CELL[scope.sourceCell],
        args: [{ ...scope, dataSourceCoreIds: source }],
      })
    );
    expect(mocks.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: 42 }),
      })
    );
  });

  it.each([
    "RUNNING",
    "COMPLETED",
  ])("does not restart a %s execution", async (status) => {
    mocks.describe.mockResolvedValue({ status: { name: status } });
    await startConversationBackfillSources({ ...scope, sources: [source] });
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it.each([
    "FAILED",
    "CANCELLED",
    "TERMINATED",
    "TIMED_OUT",
  ])("blocks a %s execution", async (status) => {
    mocks.describe.mockResolvedValue({ status: { name: status } });
    await expect(
      startConversationBackfillSources({ ...scope, sources: [source] })
    ).rejects.toThrow("Backfill blocked");
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("attaches on retry after a lost start response", async () => {
    mocks.start.mockImplementationOnce(async () => {
      mocks.describe.mockResolvedValue({ status: { name: "RUNNING" } });
      throw new Error("Lost start response");
    });
    await expect(
      startConversationBackfillSources({ ...scope, sources: [source] })
    ).rejects.toThrow("Lost start response");
    await startConversationBackfillSources({ ...scope, sources: [source] });
    expect(mocks.start).toHaveBeenCalledTimes(1);
  });

  it("rejects a source whose original Core IDs changed", async () => {
    mocks.findAll.mockResolvedValue([
      { ...source, dustAPIProjectId: "changed" },
    ]);
    await expect(
      inspectConversationBackfillSources({ ...scope, sources: [source] })
    ).rejects.toThrow("differs from its manifest");
    expect(mocks.start).not.toHaveBeenCalled();
  });
});
