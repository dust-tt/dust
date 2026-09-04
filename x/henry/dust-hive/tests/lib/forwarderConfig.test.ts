import { describe, expect, it } from "bun:test";
import { FORWARDER_PORTS, partitionOccupiedForwarderPorts } from "../../src/lib/forwarderConfig";

describe("forwarder config", () => {
  it("preserves an existing Storybook listener while keeping other conflicts strict", () => {
    expect(partitionOccupiedForwarderPorts(FORWARDER_PORTS)).toEqual({
      portsToClear: [3000, 3001, 3002, 3006, 3007, 3010, 3011],
      portsToPreserve: [6006],
    });
  });

  it("does not preserve Storybook when its port is available", () => {
    expect(partitionOccupiedForwarderPorts([])).toEqual({
      portsToClear: [],
      portsToPreserve: [],
    });
  });
});
