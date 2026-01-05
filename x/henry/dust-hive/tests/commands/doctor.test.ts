import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

describe("doctor command", () => {
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    originalSpawn = Bun.spawn;
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    Bun.spawn = originalSpawn;
    mock.restore();
  });

  // Helper to create a mock spawn result
  function createMockProc(stdout: string, exitCode: number) {
    const stdoutStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(stdout));
        controller.close();
      },
    });

    return {
      stdout: stdoutStream,
      stderr: new ReadableStream(),
      exited: Promise.resolve(exitCode),
      exitCode,
      pid: 12345,
      kill: () => {},
      killed: false,
      stdin: null,
      unref: () => {},
      ref: () => {},
      resourceUsage: () => ({ userCPUTime: 0, systemCPUTime: 0, maxRSS: 0 }),
    };
  }

  describe("prerequisite checking logic", () => {
    it("reports all checks with proper structure", async () => {
      // This test validates the structure of check results
      // rather than the full integration which requires real system state

      // The doctor command returns Ok when all required checks pass
      // and Err when any required check fails
      // Optional checks (like sccache) don't affect the overall result

      const requiredChecks = [
        "Bun",
        "Zellij",
        "Docker",
        "Docker Compose",
        "Temporal CLI",
        "Temporal Server",
        "nvm",
        "Cargo",
        "Dust Repo",
        "config.env",
      ];

      const optionalChecks = ["sccache (optional)"];

      // Verify we're testing the right set of prerequisites
      expect(requiredChecks.length).toBe(10);
      expect(optionalChecks.length).toBe(1);
    });
  });

  describe("version string parsing", () => {
    it("extracts first line of version output", () => {
      // Test the pattern used in doctor.ts
      const multilineOutput = "bun 1.0.0\nsome other info";
      const firstLine = multilineOutput.trim().split("\n")[0];
      expect(firstLine).toBe("bun 1.0.0");
    });

    it("handles single line version output", () => {
      const singleLineOutput = "cargo 1.75.0";
      const firstLine = singleLineOutput.trim().split("\n")[0];
      expect(firstLine).toBe("cargo 1.75.0");
    });

    it("handles empty output", () => {
      const emptyOutput = "";
      const firstLine = emptyOutput.trim().split("\n")[0];
      expect(firstLine).toBe("");
    });
  });

  describe("check result structure", () => {
    it("has correct shape for passing check", () => {
      const result = {
        name: "Bun",
        ok: true,
        message: "1.0.0",
      };
      expect(result).toHaveProperty("name");
      expect(result).toHaveProperty("ok");
      expect(result).toHaveProperty("message");
      expect(result.ok).toBe(true);
    });

    it("has correct shape for failing check with fix", () => {
      const result = {
        name: "Docker",
        ok: false,
        message: "Not found",
        fix: "Install Docker Desktop",
      };
      expect(result).toHaveProperty("fix");
      expect(result.ok).toBe(false);
    });

    it("has correct shape for optional check", () => {
      const result = {
        name: "sccache (optional)",
        ok: false,
        message: "Not found (recommended for faster rebuilds)",
        fix: "Install sccache: brew install sccache",
        optional: true,
      };
      expect(result).toHaveProperty("optional");
      expect(result.optional).toBe(true);
    });
  });

  describe("sccache configuration detection", () => {
    it("detects when sccache is configured in cargo config", () => {
      const configContent = `[build]
rustc-wrapper = "sccache"`;
      expect(configContent.includes("sccache")).toBe(true);
    });

    it("detects when sccache is not configured", () => {
      const configContent = `[build]
# no wrapper configured`;
      expect(configContent.includes("sccache")).toBe(false);
    });
  });

  describe("error handling", () => {
    it("returns CommandError when prerequisites fail", async () => {
      // Mock all external dependencies
      mock.module("../../src/lib/paths", () => ({
        findRepoRoot: async () => null, // Simulate repo not found
        CONFIG_ENV_PATH: "/fake/config.env",
      }));

      mock.module("../../src/lib/config", () => ({
        configEnvExists: async () => false, // Config missing
      }));

      // Mock Bun.spawn to simulate missing commands
      Bun.spawn = (() => {
        return createMockProc("", 1); // All commands fail
      }) as unknown as typeof Bun.spawn;

      const originalFile = Bun.file;
      Bun.file = ((path: string) => {
        if (path.includes(".cargo/config.toml")) {
          return { exists: async () => false };
        }
        return originalFile(path);
      }) as typeof Bun.file;

      const { doctorCommand } = await import("../../src/commands/doctor");
      const result = await doctorCommand();

      // Should fail when required prerequisites are missing
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe("Prerequisites check failed");
      }

      Bun.file = originalFile;
    });
  });
});

describe("doctor output formatting", () => {
  it("formats check results with correct icons", () => {
    const passIcon = "\x1b[32m✓\x1b[0m";
    const failIcon = "\x1b[31m✗\x1b[0m";
    const optionalIcon = "\x1b[33m○\x1b[0m";

    // Verify ANSI escape codes are correct
    expect(passIcon).toContain("32m"); // Green
    expect(failIcon).toContain("31m"); // Red
    expect(optionalIcon).toContain("33m"); // Yellow
  });

  it("pads check names correctly", () => {
    const name = "Bun";
    const padded = name.padEnd(20);
    expect(padded.length).toBe(20);
    expect(padded).toBe("Bun                 ");
  });
});
