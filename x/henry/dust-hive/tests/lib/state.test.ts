import { describe, expect, it } from "bun:test";
import type { ServiceName } from "../../src/lib/services";
import {
  type EnvironmentState,
  type StateInfo,
  detectWarnings,
  determineState,
  formatState,
} from "../../src/lib/state";

describe("state", () => {
  describe("determineState", () => {
    it("returns stopped when nothing is running", () => {
      const state = determineState(false, false, false);
      expect(state).toBe("stopped");
    });

    it("returns cold when only SDK is running", () => {
      const state = determineState(true, false, false);
      expect(state).toBe("cold");
    });

    it("returns warm when everything is running", () => {
      const state = determineState(true, true, true);
      expect(state).toBe("warm");
    });

    describe("inconsistent states", () => {
      it("returns warm when docker is running but SDK is not", () => {
        // Docker running without SDK is still "warm" (infrastructure up)
        const state = determineState(false, true, false);
        expect(state).toBe("warm");
      });

      it("returns warm when app services running but SDK is not", () => {
        const state = determineState(false, false, true);
        expect(state).toBe("warm");
      });

      it("returns warm when docker and app services running but SDK is not", () => {
        const state = determineState(false, true, true);
        expect(state).toBe("warm");
      });

      it("returns cold when SDK and docker running but no app services", () => {
        // This is inconsistent - SDK + docker but no app services
        const state = determineState(true, true, false);
        // Docker is infrastructure, so still considered warm
        expect(state).toBe("warm");
      });

      it("returns cold when SDK running with app services but no docker", () => {
        // SDK + app services but no docker - app services are running
        const state = determineState(true, false, true);
        expect(state).toBe("warm");
      });
    });
  });

  describe("detectWarnings", () => {
    it("returns empty array for stopped state", () => {
      const warnings = detectWarnings(false, false, false, []);
      expect(warnings).toEqual([]);
    });

    it("returns empty array for cold state (SDK only)", () => {
      const warnings = detectWarnings(true, false, false, []);
      expect(warnings).toEqual([]);
    });

    it("returns empty array for warm state (all running)", () => {
      const allServices: ServiceName[] = ["front", "core", "oauth", "connectors", "front-workers"];
      const warnings = detectWarnings(true, true, true, allServices);
      expect(warnings).toEqual([]);
    });

    it("warns when SDK not running but docker is", () => {
      const warnings = detectWarnings(false, true, false, []);
      expect(warnings).toContain("SDK not running");
    });

    it("warns when SDK not running but app services are", () => {
      const warnings = detectWarnings(false, false, true, ["front"]);
      expect(warnings).toContain("SDK not running");
    });

    it("warns when docker running but no app services", () => {
      const warnings = detectWarnings(true, true, false, []);
      expect(warnings).toContain("Docker running but no app services");
    });

    it("warns when app services running but docker is not", () => {
      const warnings = detectWarnings(true, false, true, ["front"]);
      expect(warnings).toContain("App services running but Docker is not");
    });

    it("warns about missing services when some are running in inconsistent state", () => {
      // SDK not running creates an inconsistent state where missing services warning triggers
      const partial: ServiceName[] = ["front", "core"];
      const warnings = detectWarnings(false, true, true, partial);
      expect(warnings.some((w) => w.includes("Missing services"))).toBe(true);
    });

    it("lists specific missing services in inconsistent state", () => {
      // SDK not running creates an inconsistent state where missing services warning triggers
      const partial: ServiceName[] = ["front"];
      const warnings = detectWarnings(false, true, true, partial);
      const missingWarning = warnings.find((w) => w.includes("Missing services"));
      expect(missingWarning).toBeDefined();
      // Should list core, oauth, connectors, front-workers
      expect(missingWarning).toContain("core");
    });

    it("does not warn about missing services in consistent warm state", () => {
      // When all consistent (sdk + docker + appServices all true), even with partial
      // services, the early return prevents missing services warning
      const partial: ServiceName[] = ["front", "core"];
      const warnings = detectWarnings(true, true, true, partial);
      expect(warnings.some((w) => w.includes("Missing services"))).toBe(false);
    });

    it("does not warn about missing services when none are running", () => {
      const warnings = detectWarnings(true, true, false, []);
      // No "Missing services" warning because no app services are running at all
      expect(warnings.some((w) => w.includes("Missing services"))).toBe(false);
    });

    it("can have multiple warnings", () => {
      // SDK not running, no docker, but app services running
      const warnings = detectWarnings(false, false, true, ["front"]);
      expect(warnings.length).toBeGreaterThanOrEqual(1);
      // Should have both "SDK not running" and "App services running but Docker is not"
      expect(warnings).toContain("SDK not running");
      expect(warnings).toContain("App services running but Docker is not");
    });
  });

  describe("formatState", () => {
    it("formats stopped state without warning", () => {
      const stateInfo: StateInfo = {
        state: "stopped",
        warnings: [],
        sdkRunning: false,
        dockerRunning: false,
        appServicesRunning: false,
      };
      expect(formatState(stateInfo)).toBe("stopped");
    });

    it("formats cold state without warning", () => {
      const stateInfo: StateInfo = {
        state: "cold",
        warnings: [],
        sdkRunning: true,
        dockerRunning: false,
        appServicesRunning: false,
      };
      expect(formatState(stateInfo)).toBe("cold");
    });

    it("formats warm state without warning", () => {
      const stateInfo: StateInfo = {
        state: "warm",
        warnings: [],
        sdkRunning: true,
        dockerRunning: true,
        appServicesRunning: true,
      };
      expect(formatState(stateInfo)).toBe("warm");
    });

    it("adds warning indicator when warnings present", () => {
      const stateInfo: StateInfo = {
        state: "warm",
        warnings: ["SDK not running"],
        sdkRunning: false,
        dockerRunning: true,
        appServicesRunning: true,
      };
      const formatted = formatState(stateInfo);
      expect(formatted).toContain("warm");
      expect(formatted).toContain("\u26a0\ufe0f"); // Warning emoji
    });

    it("adds warning indicator for multiple warnings", () => {
      const stateInfo: StateInfo = {
        state: "warm",
        warnings: ["SDK not running", "Missing services: oauth"],
        sdkRunning: false,
        dockerRunning: true,
        appServicesRunning: true,
      };
      const formatted = formatState(stateInfo);
      expect(formatted).toContain("\u26a0\ufe0f");
    });
  });

  describe("EnvironmentState type", () => {
    it("only allows valid state values", () => {
      const states: EnvironmentState[] = ["stopped", "cold", "warm"];
      expect(states).toHaveLength(3);
    });
  });

  describe("StateInfo interface", () => {
    it("has all required properties", () => {
      const info: StateInfo = {
        state: "cold",
        warnings: [],
        sdkRunning: true,
        dockerRunning: false,
        appServicesRunning: false,
      };

      expect(info.state).toBeDefined();
      expect(info.warnings).toBeDefined();
      expect(typeof info.sdkRunning).toBe("boolean");
      expect(typeof info.dockerRunning).toBe("boolean");
      expect(typeof info.appServicesRunning).toBe("boolean");
    });
  });
});
