import type { ToolContext } from "@app/lib/actions/types";
import { createMissingActionCatcherTools } from "@app/lib/api/actions/servers/missing_action_catcher/tools";
import { describe, expect, it } from "vitest";

const MISSING_ACTION_TOOL_NAME = "missing_action";

function makeToolContext(functionCallName: string): ToolContext {
  return {
    runContext: {
      contextType: "agent_loop",
      action: { functionCallName },
      toolConfiguration: { name: MISSING_ACTION_TOOL_NAME },
    },
  } as unknown as ToolContext;
}

async function getToolErrorMessage(functionCallName: string): Promise<string> {
  const [tool] = createMissingActionCatcherTools(
    makeToolContext(functionCallName)
  );

  expect(tool.name).toBe(MISSING_ACTION_TOOL_NAME);

  const result = await tool.handler({}, {} as never);
  expect(result.isErr()).toBe(true);
  if (result.isOk()) {
    throw new Error("Expected missing action catcher to return an error.");
  }

  return result.error.message;
}

describe("createMissingActionCatcherTools", () => {
  it("reports the attempted action name while keeping the catcher tool name", async () => {
    const message = await getToolErrorMessage("github__search_repositories");

    expect(message).toContain('Tool "github__search_repositories" not found.');
    expect(message).not.toContain('Tool "missing_action" not found.');
  });

  it("caps long attempted action names", async () => {
    const message = await getToolErrorMessage("a".repeat(300));
    const [firstLine] = message.split("\n");

    expect(firstLine).toContain(`Tool "${"a".repeat(253)}..." not found.`);
    expect(firstLine).not.toContain("a".repeat(254));
  });
});
