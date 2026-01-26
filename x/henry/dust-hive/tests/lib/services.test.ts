import { describe, expect, it } from "bun:test";
import { ALL_SERVICES, type ServiceName } from "../../src/lib/services";

describe("services", () => {
  describe("ALL_SERVICES", () => {
    it("contains all expected services", () => {
      expect(ALL_SERVICES).toContain("sparkle");
      expect(ALL_SERVICES).toContain("sdk");
      expect(ALL_SERVICES).toContain("front");
      expect(ALL_SERVICES).toContain("core");
      expect(ALL_SERVICES).toContain("oauth");
      expect(ALL_SERVICES).toContain("connectors");
      expect(ALL_SERVICES).toContain("front-workers");
    });

    it("has 7 services total", () => {
      expect(ALL_SERVICES).toHaveLength(7);
    });

    it("has sparkle as first service (start order)", () => {
      expect(ALL_SERVICES[0]).toBe("sparkle");
    });

    it("has front-workers as last service", () => {
      expect(ALL_SERVICES[ALL_SERVICES.length - 1]).toBe("front-workers");
    });

    it("is immutable (readonly tuple)", () => {
      // TypeScript ensures immutability at compile time
      // At runtime, we can verify it's an array
      expect(Array.isArray(ALL_SERVICES)).toBe(true);
    });

    it("defines start order with sparkle first, then SDK", () => {
      const sparkleIndex = ALL_SERVICES.indexOf("sparkle");
      const sdkIndex = ALL_SERVICES.indexOf("sdk");
      const frontIndex = ALL_SERVICES.indexOf("front");
      const coreIndex = ALL_SERVICES.indexOf("core");

      // Sparkle should be first
      expect(sparkleIndex).toBe(0);
      // SDK should be second
      expect(sdkIndex).toBe(1);
      // Front and core come after SDK
      expect(frontIndex).toBeGreaterThan(sdkIndex);
      expect(coreIndex).toBeGreaterThan(sdkIndex);
    });
  });

  describe("ServiceName type", () => {
    it("accepts valid service names", () => {
      const services: ServiceName[] = [
        "sparkle",
        "sdk",
        "front",
        "core",
        "oauth",
        "connectors",
        "front-workers",
      ];

      // All should be valid ServiceName values
      for (const service of services) {
        expect(ALL_SERVICES).toContain(service);
      }
    });

    it("all ALL_SERVICES elements are valid ServiceName", () => {
      // This is a type-level test that verifies the const assertion works
      for (const service of ALL_SERVICES) {
        const name: ServiceName = service;
        expect(typeof name).toBe("string");
      }
    });
  });
});
