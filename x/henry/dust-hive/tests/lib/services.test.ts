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
      expect(ALL_SERVICES).toContain("front-spa-poke");
      expect(ALL_SERVICES).toContain("front-spa-app");
    });

    it("has 9 services total", () => {
      expect(ALL_SERVICES).toHaveLength(9);
    });

    it("has sdk as first service (start order)", () => {
      expect(ALL_SERVICES[0]).toBe("sdk");
    });

    it("has front-spa-app as last service", () => {
      expect(ALL_SERVICES[ALL_SERVICES.length - 1]).toBe("front-spa-app");
    });

    it("is immutable (readonly tuple)", () => {
      // TypeScript ensures immutability at compile time
      // At runtime, we can verify it's an array
      expect(Array.isArray(ALL_SERVICES)).toBe(true);
    });

    it("defines start order with SDK first, then sparkle", () => {
      const sdkIndex = ALL_SERVICES.indexOf("sdk");
      const sparkleIndex = ALL_SERVICES.indexOf("sparkle");
      const frontIndex = ALL_SERVICES.indexOf("front");
      const coreIndex = ALL_SERVICES.indexOf("core");

      // SDK should be first
      expect(sdkIndex).toBe(0);
      // Sparkle should be second
      expect(sparkleIndex).toBe(1);
      // Front and core come after sparkle
      expect(frontIndex).toBeGreaterThan(sparkleIndex);
      expect(coreIndex).toBeGreaterThan(sparkleIndex);
    });
  });

  describe("ServiceName type", () => {
    it("accepts valid service names", () => {
      const services: ServiceName[] = [
        "sdk",
        "sparkle",
        "front",
        "core",
        "oauth",
        "connectors",
        "front-workers",
        "front-spa-poke",
        "front-spa-app",
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
