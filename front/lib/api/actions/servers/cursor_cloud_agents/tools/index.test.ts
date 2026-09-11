import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createCursorCloudAgentsTools } from "@app/lib/api/actions/servers/cursor_cloud_agents/tools";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { describe, expect, it } from "vitest";

describe("Cursor Cloud Agents tools", () => {
  it("rejects a pull request launch without exactly one repository", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const tool = createCursorCloudAgentsTools(authenticator).find(
      ({ name }) => name === "launch_agent"
    );
    if (!tool) {
      throw new Error("launch_agent tool not found");
    }

    const extra: Omit<ToolHandlerExtra, "runContext"> = {
      auth: authenticator,
      requestId: "cursor-cloud-agents-test",
      sendNotification: async () => {},
      sendRequest: async () => {
        throw new Error("Unexpected MCP request");
      },
      signal: new AbortController().signal,
    };

    const result = await tool.handler(
      {
        prompt: "Review this pull request",
        pullRequestUrl: "https://github.com/dust-tt/dust/pull/123",
        repositoryUrls: [],
      },
      extra as ToolHandlerExtra
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain(
        "requires exactly one repository URL"
      );
    }
  });
});
