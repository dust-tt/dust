import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import {
  includesToolSearchTool,
  TOOL_SEARCH_TOOL,
} from "@app/lib/model_constructors/sdk/anthropic_ai/converters/input/tool_search";
import { describe, expect, it } from "vitest";

import { toTool, toToolsParam } from "./conversation_to_anthropic";

const TOOL_SEARCH_TYPE = TOOL_SEARCH_TOOL.type;

// An eager tool stays in the cached prefix. A non-eager (default) tool is
// deferred behind tool search when tool search is enabled.
const hotSpec: AgentActionSpecification = {
  name: "hot",
  description: "A hot tool.",
  inputSchema: { type: "object", properties: {} },
  eager: true,
};

const coldSpec: AgentActionSpecification = {
  name: "cold",
  description: "A cold tool.",
  inputSchema: { type: "object", properties: {} },
};

const baseSpec: AgentActionSpecification = {
  name: "do_thing",
  description: "Does a thing.",
  inputSchema: { type: "object", properties: {} },
};

const replayOnlySpec: AgentActionSpecification = {
  name: "github__create_issue",
  description:
    "Replay-only placeholder for a historical tool call. " +
    "This tool is not available for new calls.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: true,
  },
};

describe("toTool", () => {
  it("defers a non-eager tool when tool search is enabled", () => {
    const tool = toTool(baseSpec, { toolSearchEnabled: true });

    expect(tool.defer_loading).toBe(true);
    expect(tool.name).toBe("do_thing");
    expect(tool.input_schema.type).toBe("object");
  });

  it("keeps an eager tool in the prefix when tool search is enabled", () => {
    const tool = toTool(
      { ...baseSpec, eager: true },
      { toolSearchEnabled: true }
    );

    expect(tool.defer_loading).toBeUndefined();
  });

  it("never defers when tool search is disabled", () => {
    const tool = toTool(baseSpec, { toolSearchEnabled: false });

    expect(tool.defer_loading).toBeUndefined();
  });
});

describe("toToolsParam", () => {
  it("does not inject the search tool when every tool is eager", () => {
    const tools = toToolsParam(
      [hotSpec, { ...hotSpec, name: "hot2" }],
      undefined,
      { toolSearchEnabled: true }
    );

    expect(tools).toHaveLength(2);
    expect(tools.some((t) => t.type === TOOL_SEARCH_TYPE)).toBe(false);
  });

  it("does not defer anything when tool search is disabled", () => {
    const tools = toToolsParam([hotSpec, coldSpec], undefined, {
      toolSearchEnabled: false,
    });

    expect(tools).toHaveLength(2);
    expect(tools.some((t) => t.type === TOOL_SEARCH_TYPE)).toBe(false);
  });

  it("prepends the search tool when at least one tool is deferred", () => {
    const tools = toToolsParam([hotSpec, coldSpec], undefined, {
      toolSearchEnabled: true,
    });

    expect(tools).toHaveLength(3);
    expect(tools[0].type).toBe(TOOL_SEARCH_TYPE);
    expect(tools[0].name).toBe("tool_search_tool_bm25");
  });

  it("un-defers a force-called tool so no search tool is needed", () => {
    // The only deferrable tool is force-called, so after un-deferring it nothing
    // remains deferred and the search tool must not be injected.
    const tools = toToolsParam([coldSpec], "cold", {
      toolSearchEnabled: true,
    });

    expect(tools).toHaveLength(1);
    expect(tools.some((t) => t.type === TOOL_SEARCH_TYPE)).toBe(false);
    expect(tools[0].name).toBe("cold");
  });

  it("keeps the search tool when other tools stay deferred", () => {
    const tools = toToolsParam(
      [coldSpec, { ...coldSpec, name: "cold2" }],
      "cold",
      {
        toolSearchEnabled: true,
      }
    );

    // cold2 is still deferred, so the search tool is present...
    expect(tools[0].type).toBe(TOOL_SEARCH_TYPE);
    // ...but the force-called tool was un-deferred.
    const forced = tools.find((t) => t.name === "cold");
    expect(forced && "defer_loading" in forced && forced.defer_loading).toBe(
      false
    );
  });

  it("defers a replay-only placeholder like any other non-eager tool", () => {
    const tools = toToolsParam([replayOnlySpec, coldSpec], undefined, {
      toolSearchEnabled: true,
    });

    expect(tools[0].type).toBe(TOOL_SEARCH_TYPE);

    const replayTool = tools.find((tool) => tool.name === replayOnlySpec.name);
    expect(replayTool).toMatchObject({
      name: "github__create_issue",
      input_schema: replayOnlySpec.inputSchema,
    });
    expect(replayTool).toHaveProperty("defer_loading", true);
  });
});

// The system-prompt hint is gated on whether the search tool actually ends up in
// the request, derived from the converted tools array. These tests pin that the
// predicate agrees with toToolsParam, including the force-call edge case.
describe("includesToolSearchTool", () => {
  it("is false when every tool is eager", () => {
    expect(
      includesToolSearchTool(
        toToolsParam([hotSpec], undefined, { toolSearchEnabled: true })
      )
    ).toBe(false);
  });

  it("is true when a deferred tool prepends the search tool", () => {
    expect(
      includesToolSearchTool(
        toToolsParam([hotSpec, coldSpec], undefined, {
          toolSearchEnabled: true,
        })
      )
    ).toBe(true);
  });

  it("is false when the only deferrable tool is force-called", () => {
    expect(
      includesToolSearchTool(
        toToolsParam([coldSpec], "cold", { toolSearchEnabled: true })
      )
    ).toBe(false);
  });
});
