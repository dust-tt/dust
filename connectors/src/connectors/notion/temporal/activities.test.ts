import { randomUUID } from "node:crypto";

import { cacheBlockChildren } from "@connectors/connectors/notion/temporal/activities";
import { MAX_BLOCK_NESTING_DEPTH } from "@connectors/connectors/notion/temporal/config";
import { NotionConnectorBlockCacheEntryModel } from "@connectors/lib/models/notion";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  retrieveBlockChildrenResultPage: vi.fn(),
}));

vi.mock("@connectors/connectors/notion/lib/access_token", () => ({
  getNotionAccessToken: vi.fn().mockResolvedValue("access-token"),
}));

vi.mock(
  "@connectors/connectors/notion/lib/notion_api",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@connectors/connectors/notion/lib/notion_api")
    >()),
    retrieveBlockChildrenResultPage: mocks.retrieveBlockChildrenResultPage,
  })
);

function makeParagraphBlock(id: string, hasChildren: boolean) {
  return {
    object: "block",
    id,
    type: "paragraph",
    has_children: hasChildren,
    paragraph: {
      rich_text: [{ plain_text: `text of ${id}` }],
      color: "default",
    },
  };
}

async function makeNotionConnector() {
  const suffix = randomUUID();
  return ConnectorResource.makeNew(
    "notion",
    {
      connectionId: `connection-${suffix}`,
      dataSourceId: `data-source-${suffix}`,
      workspaceAPIKey: `api-key-${suffix}`,
      workspaceId: `workspace-${suffix}`,
    },
    { notionWorkspaceId: `notion-workspace-${suffix}` }
  );
}

describe("cacheBlockChildren nesting depth", () => {
  beforeEach(() => {
    mocks.retrieveBlockChildrenResultPage.mockResolvedValue({
      results: [
        makeParagraphBlock("leaf-block", false),
        makeParagraphBlock("parent-block", true),
      ],
      next_cursor: null,
    });
  });

  async function cacheAtDepth(depth: number | undefined) {
    const connector = await makeNotionConnector();
    const topLevelWorkflowId = `workflow-${randomUUID()}`;
    const result = await cacheBlockChildren({
      connectorId: connector.id,
      pageId: "page-id",
      blockId: "block-id",
      cursor: null,
      currentIndexInParent: 0,
      loggerArgs: {},
      topLevelWorkflowId,
      depth,
    });
    const cachedBlocks = await NotionConnectorBlockCacheEntryModel.findAll({
      where: { connectorId: connector.id, workflowId: topLevelWorkflowId },
    });
    return { result, cachedBlockIds: cachedBlocks.map((b) => b.notionBlockId) };
  }

  it("returns blocks with children below the max depth", async () => {
    const { result, cachedBlockIds } = await cacheAtDepth(
      MAX_BLOCK_NESTING_DEPTH - 2
    );

    expect(result.blocksWithChildren).toEqual(["parent-block"]);
    expect(cachedBlockIds.sort()).toEqual(["leaf-block", "parent-block"]);
  });

  it("caches the blocks but stops descending at the max depth", async () => {
    const { result, cachedBlockIds } = await cacheAtDepth(
      MAX_BLOCK_NESTING_DEPTH - 1
    );

    expect(result.blocksWithChildren).toEqual([]);
    expect(result.blocksCount).toBe(2);
    expect(cachedBlockIds.sort()).toEqual(["leaf-block", "parent-block"]);
  });

  it("does not bound workflows started before depth tracking", async () => {
    const { result } = await cacheAtDepth(undefined);

    expect(result.blocksWithChildren).toEqual(["parent-block"]);
  });
});
