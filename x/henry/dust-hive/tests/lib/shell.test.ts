import { describe, expect, it } from "bun:test";
import { buildShell } from "../../src/lib/shell";

describe("shell", () => {
  describe("buildShell", () => {
    it("builds simple command string", () => {
      const result = buildShell({ run: "npm run dev" });
      expect(result).toBe("npm run dev");
    });

    it("handles array of commands", () => {
      const result = buildShell({ run: ["npm install", "npm run build"] });
      expect(result).toBe("npm install\nnpm run build");
    });

    it("sources env file when specified", () => {
      const result = buildShell({
        sourceEnv: "/path/to/env.sh",
        run: "npm run dev",
      });
      expect(result).toBe("source /path/to/env.sh\nnpm run dev");
    });

    it("sources nvm when specified", () => {
      const result = buildShell({
        sourceNvm: true,
        run: "npm run dev",
      });
      expect(result).toBe("source ~/.nvm/nvm.sh && nvm use\nnpm run dev");
    });

    it("sources env before nvm when both specified", () => {
      const result = buildShell({
        sourceEnv: "/path/to/env.sh",
        sourceNvm: true,
        run: "npm run dev",
      });
      expect(result).toBe("source /path/to/env.sh\nsource ~/.nvm/nvm.sh && nvm use\nnpm run dev");
    });

    it("handles multiple commands with env and nvm", () => {
      const result = buildShell({
        sourceEnv: "/home/user/.dust-hive/envs/test/env.sh",
        sourceNvm: true,
        run: ["npm install", "npm run build", "npm run dev"],
      });

      const expected = [
        "source /home/user/.dust-hive/envs/test/env.sh",
        "source ~/.nvm/nvm.sh && nvm use",
        "npm install",
        "npm run build",
        "npm run dev",
      ].join("\n");

      expect(result).toBe(expected);
    });

    it("does not source nvm when sourceNvm is false", () => {
      const result = buildShell({
        sourceNvm: false,
        run: "cargo run",
      });
      expect(result).toBe("cargo run");
    });

    it("does not source nvm when sourceNvm is undefined", () => {
      const result = buildShell({
        run: "cargo run",
      });
      expect(result).toBe("cargo run");
    });

    it("handles empty command array", () => {
      const result = buildShell({ run: [] });
      expect(result).toBe("");
    });

    it("handles complex commands with special characters", () => {
      const result = buildShell({
        run: "TEMPORAL_NAMESPACE=dust-hive-test npx tsx src/start.ts -p 10002",
      });
      expect(result).toBe("TEMPORAL_NAMESPACE=dust-hive-test npx tsx src/start.ts -p 10002");
    });

    it("handles paths with spaces", () => {
      const result = buildShell({
        sourceEnv: "/path with spaces/env.sh",
        run: "npm run dev",
      });
      expect(result).toBe("source /path with spaces/env.sh\nnpm run dev");
    });

    it("builds correct command for SDK service", () => {
      const result = buildShell({
        sourceNvm: true,
        run: "npm run watch",
      });
      expect(result).toBe("source ~/.nvm/nvm.sh && nvm use\nnpm run watch");
    });

    it("builds correct command for front service", () => {
      const result = buildShell({
        sourceEnv: "/home/user/.dust-hive/envs/my-env/env.sh",
        sourceNvm: true,
        run: "npm run dev",
      });

      const lines = result.split("\n");
      expect(lines).toHaveLength(3);
      expect(lines[0]).toContain("source");
      expect(lines[0]).toContain("env.sh");
      expect(lines[1]).toContain("nvm");
      expect(lines[2]).toBe("npm run dev");
    });

    it("builds correct command for core service (no nvm)", () => {
      const result = buildShell({
        sourceEnv: "/home/user/.dust-hive/envs/my-env/env.sh",
        sourceNvm: false,
        run: "cargo run --bin core-api",
      });

      expect(result).toBe(
        "source /home/user/.dust-hive/envs/my-env/env.sh\ncargo run --bin core-api"
      );
    });
  });
});
