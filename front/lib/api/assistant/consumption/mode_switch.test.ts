import { consumptionModeFromFeatureFlags } from "@app/lib/api/assistant/consumption/mode";
import { describe, expect, it } from "vitest";

describe("consumptionModeFromFeatureFlags", () => {
  it("resolves the rollout states", () => {
    expect(consumptionModeFromFeatureFlags([])).toBe("off");
    expect(
      consumptionModeFromFeatureFlags(["agent_message_consumption_writes"])
    ).toBe("shadow");
    expect(
      consumptionModeFromFeatureFlags([
        "agent_message_consumption_writes",
        "agent_message_consumption_bills",
      ])
    ).toBe("live");
  });

  it("fails closed when billing is enabled without writes", () => {
    expect(
      consumptionModeFromFeatureFlags(["agent_message_consumption_bills"])
    ).toBe("off");
  });
});
