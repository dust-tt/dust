import { describe, expect, it } from "bun:test";
import { buildShell } from "../../src/lib/shell";

describe("shell", () => {
  describe("buildShell", () => {
    it("builds simple command string", () => {
      const result = buildShell({ run: "npm run dev" });
      expect(result).toBe("set -e && set -o pipefail && npm run dev");
    });

    it("handles array of commands", () => {
      const result = buildShell({ run: ["npm install", "npm run build"] });
      expect(result).toBe("set -e && set -o pipefail && npm install && npm run build");
    });

    it("sources env file when specified", () => {
      const result = buildShell({
        sourceEnv: "/path/to/env.sh",
        run: "npm run dev",
      });
      expect(result).toBe("set -e && set -o pipefail && source '/path/to/env.sh' && npm run dev");
    });

    it("sources nvm when specified", () => {
      const result = buildShell({
        sourceNvm: true,
        run: "npm run dev",
      });
      expect(result).toBe(
        'set -e && set -o pipefail && export NVM_DIR="${NVM_DIR:-$HOME/.nvm}" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm use && npm run dev'
      );
    });

    it("sources env before nvm when both specified", () => {
      const result = buildShell({
        sourceEnv: "/path/to/env.sh",
        sourceNvm: true,
        run: "npm run dev",
      });
      expect(result).toBe(
        'set -e && set -o pipefail && source \'/path/to/env.sh\' && export NVM_DIR="${NVM_DIR:-$HOME/.nvm}" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm use && npm run dev'
      );
    });

    it("handles multiple commands with env and nvm", () => {
      const result = buildShell({
        sourceEnv: "/home/user/.dust-hive/envs/test/env.sh",
        sourceNvm: true,
        run: ["npm install", "npm run build", "npm run dev"],
      });

      expect(result).toBe(
        'set -e && set -o pipefail && source \'/home/user/.dust-hive/envs/test/env.sh\' && export NVM_DIR="${NVM_DIR:-$HOME/.nvm}" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm use && npm install && npm run build && npm run dev'
      );
    });

    it("does not source nvm when sourceNvm is false", () => {
      const result = buildShell({
        sourceNvm: false,
        run: "cargo run",
      });
      expect(result).toBe("set -e && set -o pipefail && cargo run");
    });

    it("does not source nvm when sourceNvm is undefined", () => {
      const result = buildShell({
        run: "cargo run",
      });
      expect(result).toBe("set -e && set -o pipefail && cargo run");
    });

    it("handles empty command array", () => {
      const result = buildShell({ run: [] });
      expect(result).toBe("set -e && set -o pipefail");
    });

    it("handles complex commands with special characters", () => {
      const result = buildShell({
        run: "TEMPORAL_NAMESPACE=dust-hive-test npx tsx src/start.ts -p 10002",
      });
      expect(result).toBe(
        "set -e && set -o pipefail && TEMPORAL_NAMESPACE=dust-hive-test npx tsx src/start.ts -p 10002"
      );
    });

    it("handles paths with spaces", () => {
      const result = buildShell({
        sourceEnv: "/path with spaces/env.sh",
        run: "npm run dev",
      });
      expect(result).toBe(
        "set -e && set -o pipefail && source '/path with spaces/env.sh' && npm run dev"
      );
    });

    it("builds correct command for SDK service", () => {
      const result = buildShell({
        sourceNvm: true,
        run: "npm run watch",
      });
      expect(result).toBe(
        'set -e && set -o pipefail && export NVM_DIR="${NVM_DIR:-$HOME/.nvm}" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm use && npm run watch'
      );
    });

    it("builds correct command for front service", () => {
      const result = buildShell({
        sourceEnv: "/home/user/.dust-hive/envs/my-env/env.sh",
        sourceNvm: true,
        run: "npm run dev",
      });

      expect(result).toContain("set -e && set -o pipefail");
      expect(result).toContain("source '/home/user/.dust-hive/envs/my-env/env.sh'");
      expect(result).toContain("nvm use");
      expect(result.endsWith("npm run dev")).toBe(true);
    });

    it("builds correct command for core service (no nvm)", () => {
      const result = buildShell({
        sourceEnv: "/home/user/.dust-hive/envs/my-env/env.sh",
        sourceNvm: false,
        run: "cargo run --bin core-api",
      });

      expect(result).toBe(
        "set -e && set -o pipefail && source '/home/user/.dust-hive/envs/my-env/env.sh' && cargo run --bin core-api"
      );
    });
  });
});
