import {
  getAutoTierRoutingState,
  nextAutoTierRoutingState,
  withAutoTierRoutingState,
} from "@app/lib/api/assistant/tier_routing/state";
import { describe, expect, it } from "vitest";

describe("nextAutoTierRoutingState", () => {
  it("settles when the decision lands on the configured stream", () => {
    expect(nextAutoTierRoutingState("auto_complex", "auto_complex")).toEqual({
      configuredStreamId: "auto_complex",
      currentStreamId: "auto_complex",
      status: "settled",
    });
  });

  it("keeps routing when the decision lands below the configured stream", () => {
    expect(nextAutoTierRoutingState("auto_complex", "auto")).toMatchObject({
      currentStreamId: "auto",
      status: "routing",
    });
  });
});

describe("getAutoTierRoutingState", () => {
  it("ignores a state recorded for another configured stream", () => {
    const metadata = withAutoTierRoutingState(
      {},
      "agent_a",
      nextAutoTierRoutingState("auto_complex", "auto_complex")
    );

    expect(getAutoTierRoutingState(metadata, "agent_a", "auto")).toBeNull();
  });

  it("ignores malformed metadata", () => {
    expect(
      getAutoTierRoutingState(
        { autoTierRouting: { agent_a: { status: "settled" } } },
        "agent_a",
        "auto"
      )
    ).toBeNull();
  });

  it("keeps each agent's state when another agent's state is written", () => {
    const first = withAutoTierRoutingState(
      {},
      "agent_a",
      nextAutoTierRoutingState("auto", "auto_fast")
    );
    const both = withAutoTierRoutingState(
      first,
      "agent_b",
      nextAutoTierRoutingState("auto", "auto")
    );

    expect(getAutoTierRoutingState(both, "agent_a", "auto")).toMatchObject({
      currentStreamId: "auto_fast",
      status: "routing",
    });
    expect(getAutoTierRoutingState(both, "agent_b", "auto")).toMatchObject({
      status: "settled",
    });
  });
});
