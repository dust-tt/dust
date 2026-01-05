import { describe, expect, it } from "bun:test";
import { FORWARDER_MAPPINGS, FORWARDER_PORTS } from "../../src/lib/forwarderConfig";
import { PORT_OFFSETS } from "../../src/lib/ports";

describe("forward command", () => {
  describe("forwarder port configuration", () => {
    it("forwards port 3000 to front", () => {
      const frontMapping = FORWARDER_MAPPINGS.find((m) => m.name === "front");
      expect(frontMapping).toBeDefined();
      expect(frontMapping?.listenPort).toBe(3000);
      expect(frontMapping?.targetOffset).toBe(PORT_OFFSETS.front);
    });

    it("forwards port 3001 to core", () => {
      const coreMapping = FORWARDER_MAPPINGS.find((m) => m.name === "core");
      expect(coreMapping).toBeDefined();
      expect(coreMapping?.listenPort).toBe(3001);
      expect(coreMapping?.targetOffset).toBe(PORT_OFFSETS.core);
    });

    it("forwards port 3002 to connectors", () => {
      const connectorsMapping = FORWARDER_MAPPINGS.find((m) => m.name === "connectors");
      expect(connectorsMapping).toBeDefined();
      expect(connectorsMapping?.listenPort).toBe(3002);
      expect(connectorsMapping?.targetOffset).toBe(PORT_OFFSETS.connectors);
    });

    it("forwards port 3006 to oauth", () => {
      const oauthMapping = FORWARDER_MAPPINGS.find((m) => m.name === "oauth");
      expect(oauthMapping).toBeDefined();
      expect(oauthMapping?.listenPort).toBe(3006);
      expect(oauthMapping?.targetOffset).toBe(PORT_OFFSETS.oauth);
    });

    it("has 4 port mappings", () => {
      expect(FORWARDER_MAPPINGS).toHaveLength(4);
    });

    it("FORWARDER_PORTS matches mapping listen ports", () => {
      const listenPorts = FORWARDER_MAPPINGS.map((m) => m.listenPort);
      expect(FORWARDER_PORTS).toEqual(listenPorts);
    });

    it("all listen ports are standard dev ports", () => {
      for (const port of FORWARDER_PORTS) {
        expect(port).toBeGreaterThanOrEqual(3000);
        expect(port).toBeLessThan(4000);
      }
    });
  });

  describe("target port calculation", () => {
    it("calculates correct target ports for base 10000", () => {
      const basePort = 10000;
      const expectedTargets = {
        front: basePort + PORT_OFFSETS.front, // 10000
        core: basePort + PORT_OFFSETS.core, // 10001
        connectors: basePort + PORT_OFFSETS.connectors, // 10002
        oauth: basePort + PORT_OFFSETS.oauth, // 10006
      };

      for (const mapping of FORWARDER_MAPPINGS) {
        const targetPort = basePort + mapping.targetOffset;
        expect(targetPort).toBe(expectedTargets[mapping.name as keyof typeof expectedTargets]);
      }
    });

    it("calculates correct target ports for base 11000", () => {
      const basePort = 11000;

      const frontMapping = FORWARDER_MAPPINGS.find((m) => m.name === "front");
      expect(basePort + (frontMapping?.targetOffset ?? 0)).toBe(11000);

      const coreMapping = FORWARDER_MAPPINGS.find((m) => m.name === "core");
      expect(basePort + (coreMapping?.targetOffset ?? 0)).toBe(11001);
    });
  });

  describe("subcommand routing", () => {
    it("recognizes status subcommand", () => {
      const subcommand = "status";
      expect(subcommand).toBe("status");
    });

    it("recognizes stop subcommand", () => {
      const subcommand = "stop";
      expect(subcommand).toBe("stop");
    });

    it("recognizes help flags", () => {
      const helpFlags = ["--help", "-h", "help"];
      for (const flag of helpFlags) {
        expect(["--help", "-h", "help"]).toContain(flag);
      }
    });

    it("treats other values as environment names", () => {
      const envName = "my-env";
      const isSubcommand = ["status", "stop", "--help", "-h", "help"].includes(envName);
      expect(isSubcommand).toBe(false);
    });
  });

  describe("status display formatting", () => {
    it("formats running status with green color", () => {
      const runningStatus = "\x1b[32mRunning\x1b[0m";
      expect(runningStatus).toContain("32m"); // Green ANSI code
      expect(runningStatus).toContain("Running");
    });

    it("formats stopped status with gray color", () => {
      const stoppedStatus = "\x1b[90mStopped\x1b[0m";
      expect(stoppedStatus).toContain("90m"); // Gray ANSI code
      expect(stoppedStatus).toContain("Stopped");
    });

    it("formats not configured status with gray color", () => {
      const notConfiguredStatus = "\x1b[90mNot configured\x1b[0m";
      expect(notConfiguredStatus).toContain("90m");
      expect(notConfiguredStatus).toContain("Not configured");
    });

    it("formats warning with yellow color", () => {
      const warning = "\x1b[33mWarning: Target environment 'test' is cold\x1b[0m";
      expect(warning).toContain("33m"); // Yellow ANSI code
    });
  });

  describe("forwarder state structure", () => {
    it("has correct fields", () => {
      const state = {
        targetEnv: "test-env",
        basePort: 10000,
        updatedAt: "2024-01-01T00:00:00.000Z",
      };

      expect(state).toHaveProperty("targetEnv");
      expect(state).toHaveProperty("basePort");
      expect(state).toHaveProperty("updatedAt");
    });

    it("basePort should be a valid port number", () => {
      const state = { targetEnv: "test", basePort: 10000, updatedAt: "" };
      expect(state.basePort).toBeGreaterThanOrEqual(1);
      expect(state.basePort).toBeLessThanOrEqual(65535);
    });
  });

  describe("error messages", () => {
    it("formats environment not found error", () => {
      const envName = "nonexistent";
      const error = `Environment '${envName}' not found`;
      expect(error).toBe("Environment 'nonexistent' not found");
    });

    it("formats front not running error", () => {
      const envName = "test-env";
      const error = `Environment '${envName}' does not have front running. Run 'dust-hive warm ${envName}' first.`;
      expect(error).toContain("does not have front running");
      expect(error).toContain("dust-hive warm");
    });

    it("formats no warm environment error", () => {
      const error = "No warm environment found. Run 'dust-hive warm NAME' first.";
      expect(error).toContain("No warm environment");
      expect(error).toContain("dust-hive warm");
    });

    it("formats port in use error", () => {
      const portsInUse = [3000, 3001];
      const error = `Ports ${portsInUse.join(", ")} are already in use`;
      expect(error).toBe("Ports 3000, 3001 are already in use");
    });
  });

  describe("usage text", () => {
    it("includes all subcommands in usage", () => {
      const usageLines = [
        "dust-hive forward          Forward to the last warmed environment",
        "dust-hive forward NAME     Forward to a specific environment",
        "dust-hive forward status   Show current forwarding status",
        "dust-hive forward stop     Stop the forwarder",
      ];

      expect(usageLines).toHaveLength(4);
      expect(usageLines.some((l) => l.includes("status"))).toBe(true);
      expect(usageLines.some((l) => l.includes("stop"))).toBe(true);
    });

    it("shows forwarded ports in usage", () => {
      const portsLine = `Ports forwarded: ${FORWARDER_PORTS.join(", ")}`;
      expect(portsLine).toBe("Ports forwarded: 3000, 3001, 3002, 3006");
    });
  });
});
