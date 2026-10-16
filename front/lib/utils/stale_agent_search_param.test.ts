import { isStaleMirroredDefaultAgentParam } from "@app/lib/utils/stale_agent_search_param";
import { describe, expect, it } from "vitest";

describe("isStaleMirroredDefaultAgentParam", () => {
  it("is false before the default has resolved once", () => {
    expect(
      isStaleMirroredDefaultAgentParam({
        agentSearchParam: "agent_a",
        previousDefaultAgentId: "agent_a",
        nextDefaultAgentId: "agent_b",
        hasResolvedDefault: false,
      })
    ).toBe(false);
  });

  it("is false when the default has not changed", () => {
    expect(
      isStaleMirroredDefaultAgentParam({
        agentSearchParam: "agent_a",
        previousDefaultAgentId: "agent_a",
        nextDefaultAgentId: "agent_a",
        hasResolvedDefault: true,
      })
    ).toBe(false);
  });

  it("is true when ?agent= still names the previous default after a change", () => {
    expect(
      isStaleMirroredDefaultAgentParam({
        agentSearchParam: "agent_a",
        previousDefaultAgentId: "agent_a",
        nextDefaultAgentId: "agent_b",
        hasResolvedDefault: true,
      })
    ).toBe(true);
  });

  it("is false for an intentional ?agent= that differs from the previous default", () => {
    expect(
      isStaleMirroredDefaultAgentParam({
        agentSearchParam: "agent_custom",
        previousDefaultAgentId: "agent_a",
        nextDefaultAgentId: "agent_b",
        hasResolvedDefault: true,
      })
    ).toBe(false);
  });

  it("is false when there is no ?agent= param", () => {
    expect(
      isStaleMirroredDefaultAgentParam({
        agentSearchParam: null,
        previousDefaultAgentId: "agent_a",
        nextDefaultAgentId: "agent_b",
        hasResolvedDefault: true,
      })
    ).toBe(false);
  });

  it("treats null and a concrete id as a default change for a mirrored null-era param", () => {
    // Workspace/pod default unset (null → @dust fallback elsewhere) then set.
    expect(
      isStaleMirroredDefaultAgentParam({
        agentSearchParam: null,
        previousDefaultAgentId: null,
        nextDefaultAgentId: "agent_b",
        hasResolvedDefault: true,
      })
    ).toBe(false);
  });
});
