import { describe, expect, it } from "bun:test";
import { calculatePorts } from "../../src/lib/ports";
import {
  SERVICE_REGISTRY,
  WARM_SERVICES,
  getHealthChecks,
  getServicePort,
} from "../../src/lib/registry";
import { ALL_SERVICES, type ServiceName } from "../../src/lib/services";

describe("registry", () => {
  describe("SERVICE_REGISTRY", () => {
    it("has config for all services in ALL_SERVICES", () => {
      for (const service of ALL_SERVICES) {
        expect(SERVICE_REGISTRY[service]).toBeDefined();
      }
    });

    it("sdk config has correct settings", () => {
      const config = SERVICE_REGISTRY.sdk;
      expect(config.cwd).toBe("sdks/js");
      expect(config.needsNvm).toBe(true);
      expect(config.needsEnvSh).toBe(false);
    });

    it("front config has correct settings", () => {
      const config = SERVICE_REGISTRY.front;
      expect(config.cwd).toBe("front");
      expect(config.needsNvm).toBe(true);
      expect(config.needsEnvSh).toBe(true);
      expect(config.portKey).toBe("front");
      expect(config.healthCheckUrl).toBeDefined();
    });

    it("core config does not need nvm", () => {
      const config = SERVICE_REGISTRY.core;
      expect(config.cwd).toBe("core");
      expect(config.needsNvm).toBe(false);
      expect(config.needsEnvSh).toBe(true);
    });

    it("oauth config shares core directory", () => {
      const config = SERVICE_REGISTRY.oauth;
      expect(config.cwd).toBe("core");
      expect(config.needsNvm).toBe(false);
    });

    it("connectors config has correct settings", () => {
      const config = SERVICE_REGISTRY.connectors;
      expect(config.cwd).toBe("connectors");
      expect(config.needsNvm).toBe(true);
      expect(config.needsEnvSh).toBe(true);
    });

    it("front-workers config uses front directory", () => {
      const config = SERVICE_REGISTRY["front-workers"];
      expect(config.cwd).toBe("front");
      expect(config.needsNvm).toBe(true);
    });

    it("all configs have required fields", () => {
      for (const [_name, config] of Object.entries(SERVICE_REGISTRY)) {
        expect(config.cwd).toBeDefined();
        expect(typeof config.cwd).toBe("string");
        expect(typeof config.needsNvm).toBe("boolean");
        expect(typeof config.needsEnvSh).toBe("boolean");
        expect(config.buildCommand).toBeDefined();
        expect(typeof config.buildCommand).toBe("function");
      }
    });
  });

  describe("WARM_SERVICES", () => {
    it("excludes sdk from warm services", () => {
      expect(WARM_SERVICES).not.toContain("sdk");
    });

    it("includes all other services", () => {
      expect(WARM_SERVICES).toContain("front");
      expect(WARM_SERVICES).toContain("core");
      expect(WARM_SERVICES).toContain("oauth");
      expect(WARM_SERVICES).toContain("connectors");
      expect(WARM_SERVICES).toContain("front-workers");
    });

    it("has 5 services (all except sdk)", () => {
      expect(WARM_SERVICES).toHaveLength(5);
    });

    it("is derived from SERVICE_REGISTRY", () => {
      const registryServices = Object.keys(SERVICE_REGISTRY) as ServiceName[];
      const expectedWarm = registryServices.filter((s) => s !== "sdk");
      expect(WARM_SERVICES.sort()).toEqual(expectedWarm.sort());
    });
  });

  describe("getHealthChecks", () => {
    const ports = calculatePorts(10000);

    it("returns array of health check URLs", () => {
      const checks = getHealthChecks(ports);
      expect(Array.isArray(checks)).toBe(true);
    });

    it("includes front health check", () => {
      const checks = getHealthChecks(ports);
      const frontCheck = checks.find((c) => c.service === "front");
      expect(frontCheck).toBeDefined();
      expect(frontCheck?.url).toBe("http://localhost:10000/api/healthz");
    });

    it("includes core health check", () => {
      const checks = getHealthChecks(ports);
      const coreCheck = checks.find((c) => c.service === "core");
      expect(coreCheck).toBeDefined();
      expect(coreCheck?.url).toBe("http://localhost:10001/");
    });

    it("does not include services without health checks", () => {
      const checks = getHealthChecks(ports);
      const serviceNames = checks.map((c) => c.service);

      // SDK has no health check
      expect(serviceNames).not.toContain("sdk");
      // front-workers has no health check
      expect(serviceNames).not.toContain("front-workers");
    });

    it("uses correct ports for second environment", () => {
      const secondPorts = calculatePorts(11000);
      const checks = getHealthChecks(secondPorts);

      const frontCheck = checks.find((c) => c.service === "front");
      expect(frontCheck?.url).toBe("http://localhost:11000/api/healthz");

      const coreCheck = checks.find((c) => c.service === "core");
      expect(coreCheck?.url).toBe("http://localhost:11001/");
    });
  });

  describe("getServicePort", () => {
    const ports = calculatePorts(10000);

    it("returns port for services with portKey", () => {
      expect(getServicePort("front", ports)).toBe(10000);
      expect(getServicePort("core", ports)).toBe(10001);
      expect(getServicePort("connectors", ports)).toBe(10002);
      expect(getServicePort("oauth", ports)).toBe(10006);
    });

    it("returns undefined for services without portKey", () => {
      expect(getServicePort("sdk", ports)).toBeUndefined();
      expect(getServicePort("front-workers", ports)).toBeUndefined();
    });

    it("uses correct ports for second environment", () => {
      const secondPorts = calculatePorts(11000);
      expect(getServicePort("front", secondPorts)).toBe(11000);
      expect(getServicePort("core", secondPorts)).toBe(11001);
    });
  });

  describe("buildCommand functions", () => {
    const mockEnv = {
      name: "test",
      metadata: {
        name: "test",
        baseBranch: "main",
        workspaceBranch: "test-workspace",
        createdAt: "2024-01-01T00:00:00Z",
        repoRoot: "/path/to/repo",
      },
      ports: calculatePorts(10000),
      initialized: true,
    };

    it("sdk returns npm run watch", () => {
      const command = SERVICE_REGISTRY.sdk.buildCommand(mockEnv);
      expect(command).toBe("npm run watch");
    });

    it("front returns npm run dev", () => {
      const command = SERVICE_REGISTRY.front.buildCommand(mockEnv);
      expect(command).toBe("npm run dev");
    });

    it("core returns cargo run --bin core-api", () => {
      const command = SERVICE_REGISTRY.core.buildCommand(mockEnv);
      expect(command).toBe("cargo run --bin core-api");
    });

    it("oauth returns cargo run --bin oauth", () => {
      const command = SERVICE_REGISTRY.oauth.buildCommand(mockEnv);
      expect(command).toBe("cargo run --bin oauth");
    });

    it("connectors uses environment name and port", () => {
      const command = SERVICE_REGISTRY.connectors.buildCommand(mockEnv);
      expect(command).toContain("TEMPORAL_NAMESPACE=dust-hive-test-connectors");
      expect(command).toContain("-p 10002");
      expect(command).toContain("npx tsx src/start.ts");
    });

    it("connectors uses different port for second environment", () => {
      const secondEnv = {
        ...mockEnv,
        name: "second",
        ports: calculatePorts(11000),
      };
      const command = SERVICE_REGISTRY.connectors.buildCommand(secondEnv);
      expect(command).toContain("TEMPORAL_NAMESPACE=dust-hive-second-connectors");
      expect(command).toContain("-p 11002");
    });

    it("front-workers returns dev_worker.sh", () => {
      const command = SERVICE_REGISTRY["front-workers"].buildCommand(mockEnv);
      expect(command).toBe("./admin/dev_worker.sh");
    });
  });
});
