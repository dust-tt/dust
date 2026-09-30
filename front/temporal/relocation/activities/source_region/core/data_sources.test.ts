import { retrieveDataSourceCoreIdsBatch } from "@app/temporal/relocation/activities/source_region/core/data_sources";
import { Op } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findAll: vi.fn(),
  getWorkspaceInfos: vi.fn(),
}));

vi.mock("@app/lib/api/workspace", () => ({
  getWorkspaceInfos: mocks.getWorkspaceInfos,
}));
vi.mock("@app/lib/resources/storage/models/data_source", () => ({
  DataSourceModel: { findAll: mocks.findAll },
}));

const workspaceId = "test-workspace";

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
  });

  it("returns conversation-linked sources alongside ordinary sources", async () => {
    mocks.findAll.mockResolvedValue([
      { ...dataSource(11), name: "conv_not_a_conversation" },
      { ...dataSource(12, 120), name: "arbitrary-name" },
      dataSource(13),
      dataSource(14, 140),
    ]);

    await expect(
      retrieveDataSourceCoreIdsBatch({ workspaceId, lastId: 10 })
    ).resolves.toEqual({
      dataSourceCoreIds: [coreIds(11), coreIds(12), coreIds(13), coreIds(14)],
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
  });

  it("returns a full conversation-only batch and reaches later ordinary sources", async () => {
    mocks.findAll
      .mockResolvedValueOnce(
        Array.from({ length: 100 }, (_, i) => dataSource(i + 1, i + 1000))
      )
      .mockResolvedValueOnce([dataSource(101)]);

    const result = await retrieveDataSourceCoreIdsBatch({ workspaceId });
    expect(result).toEqual({
      dataSourceCoreIds: Array.from({ length: 100 }, (_, i) => coreIds(i + 1)),
      hasMore: true,
      lastId: 100,
    });
    expect(mocks.findAll).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { workspaceId: 42 } })
    );
    await expect(
      retrieveDataSourceCoreIdsBatch({ workspaceId, lastId: result.lastId })
    ).resolves.toEqual({
      dataSourceCoreIds: [coreIds(101)],
      hasMore: false,
      lastId: 101,
    });
    expect(mocks.findAll).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { workspaceId: 42, id: { [Op.gt]: 100 } },
      })
    );
  });

  it("returns a partial conversation-only batch", async () => {
    mocks.findAll.mockResolvedValue([dataSource(11, 110)]);
    await expect(
      retrieveDataSourceCoreIdsBatch({ workspaceId, lastId: 10 })
    ).resolves.toEqual({
      dataSourceCoreIds: [coreIds(11)],
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
  });

  it("fails before querying data sources when the workspace does not exist", async () => {
    mocks.getWorkspaceInfos.mockResolvedValue(null);
    await expect(retrieveDataSourceCoreIdsBatch({ workspaceId })).rejects.toThrow(
      "Workspace not found."
    );
    expect(mocks.findAll).not.toHaveBeenCalled();
  });

  it("propagates a data-source query failure", async () => {
    const error = new Error("Database unavailable");
    mocks.findAll.mockRejectedValueOnce(error);
    await expect(retrieveDataSourceCoreIdsBatch({ workspaceId })).rejects.toBe(
      error
    );
  });
});
