import { describe, expect, it } from "bun:test";
import { calculatePorts } from "../../src/lib/ports";
import {
  buildAutoStartOverrides,
  DEFAULT_WARM_SERVICES,
  getHealthChecks,
  getWarmServices,
  SERVICE_REGISTRY,
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

    it("front-api config has correct settings", () => {
      const config = SERVICE_REGISTRY["front-api"];
      expect(config.cwd).toBe("front-api");
      expect(config.needsNvm).toBe(true);
      expect(config.needsEnvSh).toBe(true);
      expect(config.portKey).toBe("frontApi");
      expect(config.readinessCheck).toBeDefined();
      expect(config.readinessCheck?.type).toBe("http");
    });

    it("marketing config has correct settings", () => {
      const config = SERVICE_REGISTRY.marketing;
      expect(config.cwd).toBe("marketing");
      expect(config.needsNvm).toBe(true);
      expect(config.needsEnvSh).toBe(true);
      expect(config.portKey).toBe("marketing");
      expect(config.readinessCheck).toBeDefined();
      expect(config.readinessCheck?.type).toBe("http");
    });

    it("proxy config has correct settings", () => {
      const config = SERVICE_REGISTRY.proxy;
      expect(config.cwd).toBe("x/henry/dust-hive");
      expect(config.needsNvm).toBe(false);
      expect(config.needsEnvSh).toBe(false);
      expect(config.portKey).toBe("front");
      expect(config.readinessCheck).toBeDefined();
      expect(config.readinessCheck?.type).toBe("http");
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

  describe("getWarmServices", () => {
    it("defaults to the proxy plus the default warm services", () => {
      expect(getWarmServices({})).toEqual([
        "front-api",
        "marketing",
        "proxy",
        "core",
        "oauth",
        "connectors",
        "front-workers",
        "front-spa-poke",
        "front-spa-app",
      ]);
    });

    it("never includes cold state services", () => {
      const warm = getWarmServices({ autoStartServices: { sdk: true, sparkle: true } });
      expect(warm).not.toContain("sdk");
      expect(warm).not.toContain("sparkle");
    });

    it("applies overrides on top of the defaults", () => {
      const warm = getWarmServices({ autoStartServices: { viz: true, marketing: false } });
      expect(warm).toContain("viz");
      expect(warm).not.toContain("marketing");
      expect(warm).toContain("core");
    });

    it("always includes the proxy", () => {
      expect(getWarmServices({ autoStartServices: { proxy: false } })).toContain("proxy");
    });

    it("returns services in ALL_SERVICES order", () => {
      const warm = getWarmServices({ autoStartServices: { collab: true, viz: true } });
      const order = warm.map((service) => ALL_SERVICES.indexOf(service));
      expect(order).toEqual([...order].sort((a, b) => a - b));
    });
  });

  describe("buildAutoStartOverrides", () => {
    it("returns no overrides when the selection matches the defaults", () => {
      expect(buildAutoStartOverrides(DEFAULT_WARM_SERVICES)).toEqual({});
    });

    it("only records services that differ from the defaults", () => {
      const selected: ServiceName[] = [
        ...DEFAULT_WARM_SERVICES.filter((s) => s !== "marketing"),
        "storybook",
      ];
      expect(buildAutoStartOverrides(selected)).toEqual({ marketing: false, storybook: true });
    });

    it("round-trips through getWarmServices", () => {
      const selected: ServiceName[] = ["core", "oauth", "viz"];
      const warm = getWarmServices({ autoStartServices: buildAutoStartOverrides(selected) });
      expect(warm).toEqual(["proxy", "core", "oauth", "viz"]);
    });
  });

  describe("getHealthChecks", () => {
    const ports = calculatePorts(10000);

    it("returns array of health check URLs", () => {
      const checks = getHealthChecks(ports);
      expect(Array.isArray(checks)).toBe(true);
    });

    it("includes the proxy health check on the main port", () => {
      const checks = getHealthChecks(ports);
      const proxyCheck = checks.find((c) => c.service === "proxy");
      expect(proxyCheck).toBeDefined();
      expect(proxyCheck?.url).toBe("http://localhost:10000/__hive/healthz");
    });

    it("includes the front-api health check on its own port", () => {
      const checks = getHealthChecks(ports);
      const frontApiCheck = checks.find((c) => c.service === "front-api");
      expect(frontApiCheck).toBeDefined();
      expect(frontApiCheck?.url).toBe("http://localhost:10003/api/healthz");
    });

    it("includes the marketing health check on its own port", () => {
      const checks = getHealthChecks(ports);
      const marketingCheck = checks.find((c) => c.service === "marketing");
      expect(marketingCheck).toBeDefined();
      expect(marketingCheck?.url).toBe("http://localhost:10004/");
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

      const proxyCheck = checks.find((c) => c.service === "proxy");
      expect(proxyCheck?.url).toBe("http://localhost:11000/__hive/healthz");

      const frontApiCheck = checks.find((c) => c.service === "front-api");
      expect(frontApiCheck?.url).toBe("http://localhost:11003/api/healthz");

      const coreCheck = checks.find((c) => c.service === "core");
      expect(coreCheck?.url).toBe("http://localhost:11001/");
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

    it("front-api binds IPv4 on its dedicated port, forbids next, and runs npm run dev", () => {
      const command = SERVICE_REGISTRY["front-api"].buildCommand(mockEnv);
      expect(command).toBe(
        "HOSTNAME=127.0.0.1 PORT=10003 NODE_ENV=development NODE_OPTIONS=--require=./forbid-next.cjs npm run dev"
      );
    });

    it("marketing passes -p with the marketing port", () => {
      const command = SERVICE_REGISTRY.marketing.buildCommand(mockEnv);
      expect(command).toBe("npm run dev -- -p 10004");
    });

    it("proxy receives its port and the upstream ports as argv", () => {
      const command = SERVICE_REGISTRY.proxy.buildCommand(mockEnv);
      expect(command).toBe("bun run src/proxy-daemon.ts 10000 10003 10004 10012");
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
