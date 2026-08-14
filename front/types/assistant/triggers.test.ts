import { TriggerSchema } from "@app/types/assistant/triggers";
import { describe, expect, it } from "vitest";

describe("Gmail monitor trigger schema", () => {
  it("accepts the Gmail message monitor configuration", () => {
    const result = TriggerSchema.safeParse({
      name: "Inbox monitor",
      kind: "monitor",
      customPrompt: "Summarize new messages.",
      naturalLanguageDescription: null,
      configuration: {
        type: "gmail_messages",
        q: "label:inbox",
        maxResults: 20,
        intervalMinutes: 2,
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects unsupported monitor intervals", () => {
    const result = TriggerSchema.safeParse({
      name: "Inbox monitor",
      kind: "monitor",
      customPrompt: "Summarize new messages.",
      naturalLanguageDescription: null,
      configuration: {
        type: "gmail_messages",
        q: null,
        maxResults: 20,
        intervalMinutes: 30,
      },
    });

    expect(result.success).toBe(false);
  });

  it("accepts an arbitrary remote MCP tool monitor", () => {
    const result = TriggerSchema.safeParse({
      name: "Issue monitor",
      kind: "monitor",
      customPrompt: "Summarize the changes.",
      naturalLanguageDescription: null,
      configuration: {
        type: "mcp_tool",
        mcpServerViewId: "mcp_server_view_123",
        toolName: "list_issues",
        input: { project: "PLAT", state: "open" },
        intervalMinutes: 2,
      },
    });

    expect(result.success).toBe(true);
  });
});
