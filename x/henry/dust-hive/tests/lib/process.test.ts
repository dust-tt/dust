import { describe, expect, it } from "bun:test";
import { parseLsofCwdIdentity } from "../../src/lib/process";

describe("process", () => {
  describe("parseLsofCwdIdentity", () => {
    it("parses hex device and inode fields from lsof output", () => {
      const output = [
        "p26976",
        "cnode",
        "fcwd",
        "D0x100000f",
        "i254386715",
        "n/Users/me/repo/.hives/env/sdks/js",
      ].join("\n");

      expect(parseLsofCwdIdentity(output)).toEqual({
        dev: 0x100000f,
        ino: 254386715,
      });
    });

    it("returns null when lsof output has no cwd identity", () => {
      expect(parseLsofCwdIdentity("p123\ncnode\n")).toBeNull();
    });
  });
});
