import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { resolveStableToolCallName } from "@app/temporal/agent_loop/lib/get_output_from_llm";
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
