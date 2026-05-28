import {
  getLocalAccountPrivilegeHardeningCommand,
  getRootConsumedPathHardeningCommand,
} from "@app/lib/api/sandbox/hardening";
import {
  assertRootCommandUsesAbsoluteExecutables,
  getBareRootCommandExecutables,
} from "@app/lib/api/sandbox/root_command";
import { describe, expect, test } from "vitest";

describe("sandbox root command policy", () => {
  test("accepts shell builtins and absolute executable paths", () => {
    expect(() =>
      assertRootCommandUsesAbsoluteExecutables(
        [
          "if [ -f /tmp/input ]; then",
          "/usr/bin/cat /tmp/input | /usr/bin/wc -l;",
          "else",
          "printf '%s\\n' missing;",
          "fi",
        ].join(" ")
      )
    ).not.toThrow();
  });

  test("rejects bare executable names in command and pipeline positions", () => {
    expect(
      getBareRootCommandExecutables("cat /tmp/input | /usr/bin/wc -l")
    ).toEqual(["cat"]);
    expect(
      getBareRootCommandExecutables("/usr/bin/cat /tmp/input | wc -l")
    ).toEqual(["wc"]);
  });

  test("rejects bare executable names in command substitutions and find execs", () => {
    expect(
      getBareRootCommandExecutables("lines=$(wc -l < /tmp/input)")
    ).toEqual(["wc"]);
    expect(
      getBareRootCommandExecutables(
        "/usr/bin/find /tmp -type f -exec chmod 644 {} +"
      )
    ).toEqual(["chmod"]);
  });

  test("rejects bare executable names behind command wrappers", () => {
    expect(
      getBareRootCommandExecutables("/usr/bin/nohup cat /tmp/input")
    ).toEqual(["cat"]);
    expect(
      getBareRootCommandExecutables("/usr/bin/timeout 30 gcsfuse bucket /mnt")
    ).toEqual(["gcsfuse"]);
    expect(
      getBareRootCommandExecutables("/usr/bin/env -u FOO dsbx forward")
    ).toEqual(["dsbx"]);
    expect(getBareRootCommandExecutables("command cat /tmp/input")).toEqual([
      "cat",
    ]);
    expect(getBareRootCommandExecutables("exec cat /tmp/input")).toEqual([
      "cat",
    ]);
  });

  test("accepts absolute executable paths behind command wrappers", () => {
    expect(() =>
      assertRootCommandUsesAbsoluteExecutables("command -v sudo >/dev/null")
    ).not.toThrow();
    expect(() =>
      assertRootCommandUsesAbsoluteExecutables("exec /usr/bin/cat /tmp/input")
    ).not.toThrow();
    expect(() =>
      assertRootCommandUsesAbsoluteExecutables(
        "/usr/bin/nohup /usr/bin/env -u FOO BAR=baz /opt/bin/dsbx forward"
      )
    ).not.toThrow();
    expect(() =>
      assertRootCommandUsesAbsoluteExecutables(
        "/usr/bin/timeout 30 /usr/bin/gcsfuse bucket /mnt"
      )
    ).not.toThrow();
  });

  test("does not inspect heredoc bodies", () => {
    expect(() =>
      assertRootCommandUsesAbsoluteExecutables(
        [
          "/usr/bin/cat > /tmp/script.sh <<'EOF'",
          "#!/bin/sh",
          "cat /run/dust/secret",
          "EOF",
          "&& /usr/bin/chmod 755 /tmp/script.sh",
        ].join("\n")
      )
    ).not.toThrow();
  });

  test("keeps sandbox hardening commands on absolute root executables", () => {
    expect(() =>
      assertRootCommandUsesAbsoluteExecutables(
        getRootConsumedPathHardeningCommand()
      )
    ).not.toThrow();
    expect(() =>
      assertRootCommandUsesAbsoluteExecutables(
        getLocalAccountPrivilegeHardeningCommand()
      )
    ).not.toThrow();
  });
});
