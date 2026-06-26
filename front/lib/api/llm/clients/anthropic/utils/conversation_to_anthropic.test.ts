import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import {
  includesToolSearchTool,
  TOOL_SEARCH_TOOL,
} from "@app/lib/model_constructors/sdk/anthropic_ai/converters/input/tool_search";
import { describe, expect, it } from "vitest";

import { toTool, toToolsParam } from "./conversation_to_anthropic";

const TOOL_SEARCH_TYPE = TOOL_SEARCH_TOOL.type;

const hotSpec: AgentActionSpecification = {
  name: "hot",
  description: "A hot tool.",
  inputSchema: { type: "object", properties: {} },
};

const coldSpec: AgentActionSpecification = {
  name: "cold",
  description: "A cold tool.",
  inputSchema: { type: "object", properties: {} },
  deferLoading: true,
};

const baseSpec: AgentActionSpecification = {
  name: "do_thing",
  description: "Does a thing.",
  inputSchema: { type: "object", properties: {} },
};

describe("toTool", () => {
  it("omits defer_loading for a non-deferred tool", () => {
    const tool = toTool(baseSpec);

    expect(tool.defer_loading).toBeUndefined();
    expect(tool.name).toBe("do_thing");
    expect(tool.input_schema.type).toBe("object");
  });

  it("marks a deferred tool with defer_loading", () => {
    const tool = toTool({ ...baseSpec, deferLoading: true });

    expect(tool.defer_loading).toBe(true);
  });
});

describe("toToolsParam", () => {
  it("does not inject the search tool when nothing is deferred", () => {
    const tools = toToolsParam(
      [hotSpec, { ...hotSpec, name: "hot2" }],
      undefined
    );

    expect(tools).toHaveLength(2);
    expect(tools.some((t) => t.type === TOOL_SEARCH_TYPE)).toBe(false);
  });

  it("prepends the search tool when at least one tool is deferred", () => {
    const tools = toToolsParam([hotSpec, coldSpec], undefined);

    expect(tools).toHaveLength(3);
    expect(tools[0].type).toBe(TOOL_SEARCH_TYPE);
    expect(tools[0].name).toBe("tool_search_tool_bm25");
  });

  it("un-defers a force-called tool so no search tool is needed", () => {
    // The only deferred tool is force-called, so after un-deferring it nothing
    // remains deferred and the search tool must not be injected.
    const tools = toToolsParam([coldSpec], "cold");

    expect(tools).toHaveLength(1);
    expect(tools.some((t) => t.type === TOOL_SEARCH_TYPE)).toBe(false);
    expect(tools[0].name).toBe("cold");
  });

  it("keeps the search tool when other tools stay deferred", () => {
    const tools = toToolsParam(
      [coldSpec, { ...coldSpec, name: "cold2" }],
      "cold"
    );

    // cold2 is still deferred, so the search tool is present...
    expect(tools[0].type).toBe(TOOL_SEARCH_TYPE);
    // ...but the force-called tool was un-deferred.
    const forced = tools.find((t) => t.name === "cold");
    expect(forced && "defer_loading" in forced && forced.defer_loading).toBe(
      false
    );
  });
});

// The system-prompt hint is gated on whether the search tool actually ends up in
// the request, derived from the converted tools array. These tests pin that the
// predicate agrees with toToolsParam, including the force-call edge case.
describe("includesToolSearchTool", () => {
  it("is false when nothing is deferred", () => {
    expect(includesToolSearchTool(toToolsParam([hotSpec], undefined))).toBe(
      false
    );
  });

  it("is true when a deferred tool prepends the search tool", () => {
    expect(
      includesToolSearchTool(toToolsParam([hotSpec, coldSpec], undefined))
    ).toBe(true);
  });

  it("is false when the only deferred tool is force-called", () => {
    expect(includesToolSearchTool(toToolsParam([coldSpec], "cold"))).toBe(
      false
    );
  });
});
