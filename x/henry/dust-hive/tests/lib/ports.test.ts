import { describe, expect, it } from "bun:test";
import { BASE_PORT, PORT_INCREMENT, PORT_OFFSETS, calculatePorts } from "../../src/lib/ports";

describe("ports", () => {
  describe("calculatePorts", () => {
    it("calculates correct ports for base 10000", () => {
      const ports = calculatePorts(BASE_PORT);

      expect(ports.base).toBe(10000);
      expect(ports.front).toBe(10000);
      expect(ports.core).toBe(10001);
      expect(ports.connectors).toBe(10002);
      expect(ports.oauth).toBe(10006);
      expect(ports.postgres).toBe(10432);
      expect(ports.redis).toBe(10379);
      expect(ports.qdrantHttp).toBe(10333);
      expect(ports.qdrantGrpc).toBe(10334);
      expect(ports.elasticsearch).toBe(10200);
      expect(ports.apacheTika).toBe(10998);
    });

    it("calculates correct ports for second environment", () => {
      const ports = calculatePorts(BASE_PORT + PORT_INCREMENT);

      expect(ports.base).toBe(11000);
      expect(ports.front).toBe(11000);
      expect(ports.core).toBe(11001);
      expect(ports.connectors).toBe(11002);
      expect(ports.oauth).toBe(11006);
      expect(ports.postgres).toBe(11432);
      expect(ports.redis).toBe(11379);
    });

    it("applies all offsets correctly", () => {
      const base = 20000;
      const ports = calculatePorts(base);

      expect(ports.front).toBe(base + PORT_OFFSETS.front);
      expect(ports.core).toBe(base + PORT_OFFSETS.core);
      expect(ports.connectors).toBe(base + PORT_OFFSETS.connectors);
      expect(ports.oauth).toBe(base + PORT_OFFSETS.oauth);
      expect(ports.postgres).toBe(base + PORT_OFFSETS.postgres);
      expect(ports.redis).toBe(base + PORT_OFFSETS.redis);
      expect(ports.qdrantHttp).toBe(base + PORT_OFFSETS.qdrantHttp);
      expect(ports.qdrantGrpc).toBe(base + PORT_OFFSETS.qdrantGrpc);
      expect(ports.elasticsearch).toBe(base + PORT_OFFSETS.elasticsearch);
      expect(ports.apacheTika).toBe(base + PORT_OFFSETS.apacheTika);
    });
  });
});
