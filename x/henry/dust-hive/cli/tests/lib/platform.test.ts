import { describe, expect, it } from "bun:test";
import {
  getInstallInstructions,
  getPidsOnPort,
  getPlatformName,
  getProcessCommand,
  isLinux,
  isMacOS,
} from "../../src/lib/platform";

describe("platform", () => {
  describe("platform detection", () => {
    it("isMacOS returns boolean", () => {
      expect(typeof isMacOS()).toBe("boolean");
    });

    it("isLinux returns boolean", () => {
      expect(typeof isLinux()).toBe("boolean");
    });

    it("exactly one of isMacOS or isLinux is true", () => {
      // On supported platforms, exactly one should be true
      const mac = isMacOS();
      const linux = isLinux();
      expect(mac || linux).toBe(true);
      expect(mac && linux).toBe(false);
    });

    it("getPlatformName returns macos or linux", () => {
      const name = getPlatformName();
      expect(["macos", "linux"]).toContain(name);
    });

    it("getPlatformName matches detection functions", () => {
      const name = getPlatformName();
      if (name === "macos") {
        expect(isMacOS()).toBe(true);
        expect(isLinux()).toBe(false);
      } else {
        expect(isMacOS()).toBe(false);
        expect(isLinux()).toBe(true);
      }
    });
  });

  describe("getProcessCommand", () => {
    it("returns null for non-existent PID", () => {
      // Use a very high PID that's unlikely to exist
      const result = getProcessCommand(999999999);
      expect(result).toBeNull();
    });

    it("returns string for current process PID", () => {
      const result = getProcessCommand(process.pid);
      expect(result).not.toBeNull();
      expect(typeof result).toBe("string");
    });
  });

  describe("getPidsOnPort", () => {
    it("returns empty array for unused port", () => {
      // Use a high port number that's unlikely to be in use
      const pids = getPidsOnPort(59999);
      expect(Array.isArray(pids)).toBe(true);
      expect(pids.length).toBe(0);
    });

    it("returns array of numbers", () => {
      const pids = getPidsOnPort(59999);
      expect(Array.isArray(pids)).toBe(true);
      for (const pid of pids) {
        expect(typeof pid).toBe("number");
      }
    });
  });

  describe("getInstallInstructions", () => {
    it("returns non-empty string for zellij", () => {
      const instructions = getInstallInstructions("zellij");
      expect(typeof instructions).toBe("string");
      expect(instructions.length).toBeGreaterThan(0);
    });

    it("returns non-empty string for temporal", () => {
      const instructions = getInstallInstructions("temporal");
      expect(typeof instructions).toBe("string");
      expect(instructions.length).toBeGreaterThan(0);
    });

    it("returns non-empty string for sccache", () => {
      const instructions = getInstallInstructions("sccache");
      expect(typeof instructions).toBe("string");
      expect(instructions.length).toBeGreaterThan(0);
    });

    it("returns non-empty string for lsof", () => {
      const instructions = getInstallInstructions("lsof");
      expect(typeof instructions).toBe("string");
      expect(instructions.length).toBeGreaterThan(0);
    });

    it("returns non-empty string for bun", () => {
      const instructions = getInstallInstructions("bun");
      expect(typeof instructions).toBe("string");
      expect(instructions.length).toBeGreaterThan(0);
    });

    it("returns non-empty string for nvm", () => {
      const instructions = getInstallInstructions("nvm");
      expect(typeof instructions).toBe("string");
      expect(instructions.length).toBeGreaterThan(0);
    });

    it("returns non-empty string for cargo", () => {
      const instructions = getInstallInstructions("cargo");
      expect(typeof instructions).toBe("string");
      expect(instructions.length).toBeGreaterThan(0);
    });

    it("returns platform-specific instructions for zellij", () => {
      const instructions = getInstallInstructions("zellij");
      if (isMacOS()) {
        expect(instructions).toContain("brew");
      } else {
        expect(instructions).toContain("cargo");
      }
    });

    it("returns platform-specific instructions for lsof", () => {
      const instructions = getInstallInstructions("lsof");
      if (isMacOS()) {
        expect(instructions).toContain("macOS");
      } else {
        expect(instructions).toContain("apt");
      }
    });
  });
});
