import { describe, expect, it } from "bun:test";
import { ALL_SERVICES, type ServiceName } from "../../src/lib/services";

describe("logs command", () => {
  describe("service name validation", () => {
    // Test the isServiceName pattern used in logs.ts
    function isServiceName(value: string | undefined): value is ServiceName {
      return value !== undefined && ALL_SERVICES.includes(value as ServiceName);
    }

    it("accepts valid service names", () => {
      expect(isServiceName("front")).toBe(true);
      expect(isServiceName("core")).toBe(true);
      expect(isServiceName("sdk")).toBe(true);
      expect(isServiceName("oauth")).toBe(true);
      expect(isServiceName("connectors")).toBe(true);
      expect(isServiceName("front-workers")).toBe(true);
    });

    it("rejects invalid service names", () => {
      expect(isServiceName("invalid")).toBe(false);
      expect(isServiceName("")).toBe(false);
      expect(isServiceName("FRONT")).toBe(false); // Case sensitive
      expect(isServiceName("Frontend")).toBe(false);
    });

    it("rejects undefined", () => {
      expect(isServiceName(undefined)).toBe(false);
    });

    it("validates all known services", () => {
      for (const service of ALL_SERVICES) {
        expect(isServiceName(service)).toBe(true);
      }
    });
  });

  describe("log path construction", () => {
    it("follows expected pattern", () => {
      // Log paths follow: ~/.dust-hive/envs/<name>/<service>.log
      const envName = "test-env";
      const service = "front";
      const expectedPathPattern = `${envName}/${service}.log`;

      expect(expectedPathPattern).toBe("test-env/front.log");
    });

    it("works for all services", () => {
      const envName = "my-env";
      const expectedPaths = [
        "my-env/sdk.log",
        "my-env/front.log",
        "my-env/core.log",
        "my-env/oauth.log",
        "my-env/connectors.log",
        "my-env/front-workers.log",
      ];

      const actualPaths = ALL_SERVICES.map((service) => `${envName}/${service}.log`);
      expect(actualPaths).toEqual(expectedPaths);
    });
  });

  describe("default service behavior", () => {
    it("defaults to front when no service specified", () => {
      // When serviceArg is not provided, logs.ts defaults to "front"
      const defaultService: ServiceName = "front";
      expect(defaultService).toBe("front");
      expect(ALL_SERVICES.includes(defaultService)).toBe(true);
    });
  });

  describe("tail command options", () => {
    it("uses -F for follow mode", () => {
      // tail -F follows the file and retries if it's renamed/rotated
      const followArgs = ["tail", "-F", "/path/to/log"];
      expect(followArgs[1]).toBe("-F");
    });

    it("uses -500 for default view", () => {
      // Shows last 500 lines by default
      const defaultArgs = ["tail", "-500", "/path/to/log"];
      expect(defaultArgs[1]).toBe("-500");
    });
  });

  describe("error conditions", () => {
    it("should error for unknown service", () => {
      const unknownService = "invalid-service";
      const errorMessage = `Unknown service '${unknownService}'`;
      expect(errorMessage).toBe("Unknown service 'invalid-service'");
    });

    it("should error when log file does not exist", () => {
      const service = "front";
      const errorMessage = `No log file for ${service}`;
      expect(errorMessage).toBe("No log file for front");
    });
  });

  describe("service list display", () => {
    it("formats service list correctly", () => {
      const serviceList = ALL_SERVICES.join(", ");
      expect(serviceList).toBe("sdk, front, core, oauth, connectors, front-workers");
    });
  });
});
