import { createCursorCloudAgentsTools } from "@app/lib/api/actions/servers/cursor_cloud_agents/tools";
import {
  makeExtra,
  setupPlainConversation,
} from "@app/tests/utils/conversation_test_factories";
import { describe, expect, it } from "vitest";

describe("Cursor Cloud Agents tools", () => {
  it("rejects a pull request launch without exactly one repository", async () => {
    const { auth, conversation } = await setupPlainConversation();
    const tool = createCursorCloudAgentsTools(auth).find(
      ({ name }) => name === "launch_agent"
    );
    if (!tool) {
      throw new Error("launch_agent tool not found");
    }

    const result = await tool.handler(
      {
        prompt: "Review this pull request",
        pullRequestUrl: "https://github.com/dust-tt/dust/pull/123",
        repositoryUrls: [],
      },
      makeExtra(auth, conversation)
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain(
        "requires exactly one repository URL"
      );
    }
  });
});
