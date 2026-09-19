import { AgentMCPActionOutputItemModel } from "@app/lib/models/agent/actions/mcp";
import logger from "@app/logger/logger";
import { clearMCPActionOutputItemContents } from "@app/scripts/clear_mcp_action_output_item_contents";
import { AgentMCPActionFactory } from "@app/tests/utils/AgentMCPActionFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { describe, expect, it } from "vitest";

async function createOutputItems() {
  const { authenticator } = await createResourceTest({});
  const workspace = authenticator.getNonNullableWorkspace();
  const conversation = await ConversationFactory.create(authenticator, {
    agentConfigurationId: "test-agent",
    messagesCreatedAt: [],
  });
  const { action } = await AgentMCPActionFactory.createWithAgentMessage(
    authenticator,
    { workspace, conversation }
  );
  const prefix = `w/${workspace.sId}/mcp_output_items/${action.sId}/`;
  // Start with an entirely ineligible page to exercise cursor advancement.
  const paths = [
    null,
    "mcp_output_items/legacy.json",
    "w/another-workspace/mcp_output_items/output.json",
    `${prefix}first.json`,
    `${prefix}second.json`,
  ];
  const items = await AgentMCPActionOutputItemModel.bulkCreate(
    paths.map((contentGcsPath) => ({
      workspaceId: workspace.id,
      agentMCPActionId: action.id,
      content: { type: "text" as const, text: "Original output" },
      contentGcsPath,
      citations: {},
      generatedFilePath: "report.txt",
      generatedFileContentType: "text/plain",
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    }))
  );
  return { workspace, items };
}

describe("clearMCPActionOutputItemContents", () => {
  it("preserves dry runs, ineligible rows, other workspaces, and metadata across batches", async () => {
    const { workspace, items } = await createOutputItems();
    const other = await createOutputItems();
    const before = items.map((item) => item.get({ plain: true }));
    const otherBefore = other.items.map((item) => item.get({ plain: true }));
    const options = { workspace, batchSize: 2, afterId: 0, execute: false };

    expect(await clearMCPActionOutputItemContents(options, logger)).toEqual({
      lastId: items[4].id,
      scanned: 5,
      eligible: 2,
      skipped: 3,
      updated: 0,
    });
    const readItems = () =>
      AgentMCPActionOutputItemModel.findAll({
        where: { workspaceId: workspace.id },
        order: [["id", "ASC"]],
        raw: true,
      });
    expect(await readItems()).toEqual(before);

    expect(
      await clearMCPActionOutputItemContents(
        { ...options, execute: true },
        logger
      )
    ).toMatchObject({ scanned: 5, eligible: 2, skipped: 3, updated: 2 });
    expect(await readItems()).toEqual(
      before.map((item, index) => ({
        ...item,
        content:
          index >= 3
            ? { type: "text", text: "Output content unavailable." }
            : item.content,
      }))
    );
    expect(
      await AgentMCPActionOutputItemModel.findAll({
        where: { workspaceId: other.workspace.id },
        order: [["id", "ASC"]],
        raw: true,
      })
    ).toEqual(otherBefore);
  });

  it("resumes strictly after the supplied ID", async () => {
    const { workspace, items } = await createOutputItems();
    expect(
      await clearMCPActionOutputItemContents(
        { workspace, batchSize: 2, afterId: items[3].id, execute: true },
        logger
      )
    ).toEqual({
      lastId: items[4].id,
      scanned: 1,
      eligible: 1,
      skipped: 0,
      updated: 1,
    });
    await items[3].reload();
    expect(items[3].content).toEqual({ type: "text", text: "Original output" });
    await items[4].reload();
    expect(items[4].content).toEqual({
      type: "text",
      text: "Output content unavailable.",
    });
  });
});
