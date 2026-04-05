import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import {
  getToolCallStartDeduplicationKeys,
  resolveStableToolCallName,
} from "@app/temporal/agent_loop/lib/get_output_from_llm";
import { describe, expect, it } from "vitest";

const specifications: AgentActionSpecification[] = [
  {
    name: "create_interactive_content_file",
    description: "Create an interactive content file.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "common_utilities__wait",
    description: "Wait for a duration.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

describe("resolveStableToolCallName", () => {
  it("returns the exact tool name when it matches a known specification", () => {
    expect(
      resolveStableToolCallName(
        specifications,
        "create_interactive_content_file"
      )
    ).toBe("create_interactive_content_file");
  });

  it("does not treat a partial streamed tool name as stable", () => {
    expect(
      resolveStableToolCallName(specifications, "create_inter")
    ).toBeNull();
  });
});

describe("getToolCallStartDeduplicationKeys", () => {
  it("uses both id and index when both are available", () => {
    expect(
      getToolCallStartDeduplicationKeys({
        stableToolName: "create_interactive_content_file",
        toolCallId: "call_123",
        toolCallIndex: 0,
      })
    ).toEqual(["id:call_123", "index:0"]);
  });

  it("falls back to name only when neither id nor index is available", () => {
    expect(
      getToolCallStartDeduplicationKeys({
        stableToolName: "create_interactive_content_file",
      })
    ).toEqual(["name:create_interactive_content_file"]);
  });
});
