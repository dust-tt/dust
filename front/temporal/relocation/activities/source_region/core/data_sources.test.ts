import { retrieveDataSourceCoreIdsBatch } from "@app/temporal/relocation/activities/source_region/core/data_sources";
import { Op } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findAll: vi.fn(),
  getWorkspaceInfos: vi.fn(),
  writeToRelocationStorage: vi.fn(),
  activityInfo: vi.fn(),
}));

vi.mock("@app/lib/api/workspace", () => ({
  getWorkspaceInfos: mocks.getWorkspaceInfos,
}));
vi.mock("@app/lib/api/cells/config", () => ({
  config: { getCurrentCell: () => ({ name: "cell-00000" }) },
}));
vi.mock("@app/lib/resources/storage/models/data_source", () => ({
  DataSourceModel: { findAll: mocks.findAll },
}));
vi.mock("@app/temporal/relocation/lib/file_storage/relocation", () => ({
  writeToRelocationStorage: mocks.writeToRelocationStorage,
}));
vi.mock("@temporalio/activity", () => ({
  activityInfo: mocks.activityInfo,
}));

const workspaceId = "test-workspace";
const workflowExecution = {
  workflowId: "workspaceRelocateCoreWorkflow-test-workspace",
  runId: "test-run",
};

function dataSource(id: number, conversationId: number | null = null) {
  return {
    id,
    conversationId,
    dustAPIDataSourceId: `data-source-${id}`,
    dustAPIProjectId: `project-${id}`,
  };
}

function coreIds(id: number) {
  return {
    id,
    dustAPIDataSourceId: `data-source-${id}`,
    dustAPIProjectId: `project-${id}`,
  };
}

describe("retrieveDataSourceCoreIdsBatch", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getWorkspaceInfos.mockResolvedValue({ id: 42, sId: workspaceId });
    mocks.findAll.mockResolvedValue([]);
    mocks.writeToRelocationStorage.mockResolvedValue(
      "gs://relocation/manifest.json"
    );
    mocks.activityInfo.mockReturnValue({ workflowExecution });
  });

  it("skips every conversation-linked source and records its original core IDs", async () => {
    // Classification uses the FK, not names or conversation creation dates.
    mocks.findAll.mockResolvedValue([
      { ...dataSource(11), name: "conv_not_a_conversation" },
      { ...dataSource(12, 120), name: "arbitrary-name" },
      dataSource(13),
      dataSource(14, 140),
    ]);

    await expect(
      retrieveDataSourceCoreIdsBatch({ workspaceId, lastId: 10 })
    ).resolves.toEqual({
      dataSourceCoreIds: [coreIds(11), coreIds(13)],
      hasMore: false,
      lastId: 14,
    });
    expect(mocks.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 42, id: { [Op.gt]: 10 } },
        order: [["id", "ASC"]],
        limit: 100,
        raw: true,
      })
    );
    expect(mocks.writeToRelocationStorage).toHaveBeenCalledExactlyOnceWith(
      {
        workspaceId,
        sourceCell: "cell-00000",
        workflowExecution,
        dataSources: [dataSource(12, 120), dataSource(14, 140)],
      },
      {
        workspaceId,
        type: "core",
        operation: "skipped_conversation_data_sources",
        fileName: "test-run/10-14",
      }
    );
  });

  it("advances past a full skipped batch and still reaches later normal sources", async () => {
    mocks.findAll
      .mockResolvedValueOnce(
        Array.from({ length: 100 }, (_, i) => dataSource(i + 1, i + 1000))
      )
      .mockResolvedValueOnce([dataSource(101)]);

    const skipped = await retrieveDataSourceCoreIdsBatch({ workspaceId });
    expect(skipped).toEqual({
      dataSourceCoreIds: [],
      hasMore: true,
      lastId: 100,
    });
    await expect(
      retrieveDataSourceCoreIdsBatch({ workspaceId, lastId: skipped.lastId })
    ).resolves.toEqual({
      dataSourceCoreIds: [coreIds(101)],
      hasMore: false,
      lastId: 101,
    });
    expect(mocks.writeToRelocationStorage).toHaveBeenCalledTimes(1);
  });

  it("finishes a partial skipped batch without relocating any of it", async () => {
    mocks.findAll.mockResolvedValue([dataSource(11, 110)]);
    await expect(
      retrieveDataSourceCoreIdsBatch({ workspaceId, lastId: 10 })
    ).resolves.toEqual({
      dataSourceCoreIds: [],
      hasMore: false,
      lastId: 11,
    });
  });

  it.each([
    undefined,
    100,
  ])("handles an empty batch after cursor %s", async (lastId) => {
    await expect(
      retrieveDataSourceCoreIdsBatch({ workspaceId, lastId })
    ).resolves.toEqual({
      dataSourceCoreIds: [],
      hasMore: false,
      lastId: lastId ?? 0,
    });
    expect(mocks.writeToRelocationStorage).not.toHaveBeenCalled();
  });

  it("preserves ordinary sources and handles the empty page after an exact full batch", async () => {
    mocks.findAll.mockResolvedValueOnce(
      Array.from({ length: 100 }, (_, i) => dataSource(i + 1))
    );
    const result = await retrieveDataSourceCoreIdsBatch({ workspaceId });
    expect(result).toEqual({
      dataSourceCoreIds: Array.from({ length: 100 }, (_, i) => coreIds(i + 1)),
      hasMore: true,
      lastId: 100,
    });
    await expect(
      retrieveDataSourceCoreIdsBatch({ workspaceId, lastId: result.lastId })
    ).resolves.toEqual({ dataSourceCoreIds: [], hasMore: false, lastId: 100 });
    expect(mocks.writeToRelocationStorage).not.toHaveBeenCalled();
  });

  it("fails the activity if the backfill manifest cannot be persisted", async () => {
    mocks.findAll.mockResolvedValue([dataSource(1, 10), dataSource(2)]);
    const error = new Error("GCS unavailable");
    mocks.writeToRelocationStorage.mockRejectedValueOnce(error);
    await expect(retrieveDataSourceCoreIdsBatch({ workspaceId })).rejects.toBe(
      error
    );
  });

  it("uses the same manifest key on retry and a distinct key for a new run", async () => {
    mocks.findAll.mockResolvedValue([dataSource(11, 110)]);
    const params = { workspaceId, lastId: 10 };
    await retrieveDataSourceCoreIdsBatch(params);
    await retrieveDataSourceCoreIdsBatch(params);
    expect(mocks.writeToRelocationStorage.mock.calls[0]).toEqual(
      mocks.writeToRelocationStorage.mock.calls[1]
    );

    mocks.activityInfo.mockReturnValue({
      workflowExecution: { ...workflowExecution, runId: "another-run" },
    });
    await retrieveDataSourceCoreIdsBatch(params);
    expect(mocks.writeToRelocationStorage.mock.calls[2][1].fileName).toBe(
      "another-run/10-11"
    );
  });
});
