import {
  assertLocalAuthHelpersNotSetuid,
  assertNoEmptyPasswordAccounts,
  assertNoPasswordlessSudoers,
  assertNoPrivilegedGroupMembers,
  assertPrivilegedDirsSafe,
  assertSudoAbsent,
  containsUnrestrictedSudo,
} from "@app/scripts/sandbox_security_check";
import { describe, expect, test } from "vitest";

describe("sandbox security check assertions", () => {
  test("detects unrestricted passwordless sudo while ignoring comments", () => {
    expect(
      containsUnrestrictedSudo("/etc/sudoers:10:user ALL=(ALL) NOPASSWD: ALL")
    ).toBe(true);
    expect(
      containsUnrestrictedSudo("/etc/sudoers:10:# user ALL=(ALL) NOPASSWD: ALL")
    ).toBe(false);
    expect(
      containsUnrestrictedSudo(
        "/etc/sudoers:10:user ALL=(ALL) NOPASSWD: /usr/bin/id"
      )
    ).toBe(false);
  });

  test("detects non-root privileged group members", () => {
    expect(() =>
      assertNoPrivilegedGroupMembers("sudo:x:27:\nwheel:x:10:root\n")
    ).not.toThrow();
    expect(() =>
      assertNoPrivilegedGroupMembers("sudo:x:27:user,agent\n")
    ).toThrow("privileged group sudo still has non-root members");
  });

  test("detects passwordless sudoers entries", () => {
    expect(() =>
      assertNoPasswordlessSudoers(
        "/etc/sudoers:10:# user ALL=(ALL) NOPASSWD: ALL\n"
      )
    ).not.toThrow();
    expect(() =>
      assertNoPasswordlessSudoers(
        "/etc/sudoers:10:user ALL=(ALL) NOPASSWD: ALL\n"
      )
    ).toThrow("passwordless unrestricted sudoers entries remain");
  });

  test("detects remaining sudo binary", () => {
    expect(() => assertSudoAbsent("SUDO_ABSENT=1")).not.toThrow();
    expect(() => assertSudoAbsent("SUDO_BINARY=/usr/bin/sudo")).toThrow(
      "sudo binary is still installed"
    );
  });

  test("detects empty-password accounts", () => {
    expect(() =>
      assertNoEmptyPasswordAccounts("--- empty-password-accounts ---")
    ).not.toThrow();
    expect(() =>
      assertNoEmptyPasswordAccounts("EMPTY_PASSWORD_ACCOUNT=root")
    ).toThrow("local accounts with empty passwords remain");
  });

  test("detects setuid local auth helpers", () => {
    expect(() =>
      assertLocalAuthHelpersNotSetuid(
        "LOCAL_AUTH_HELPER=/usr/bin/su 755 -rwxr-xr-x root:root"
      )
    ).not.toThrow();
    expect(() =>
      assertLocalAuthHelpersNotSetuid(
        "LOCAL_AUTH_HELPER=/usr/bin/su 4755 -rwsr-xr-x root:root"
      )
    ).toThrow("local auth helpers are still setuid");
  });

  test("detects unsafe privileged directory ownership or modes", () => {
    expect(() =>
      assertPrivilegedDirsSafe(
        "/opt/bin root:root 755 drwxr-xr-x\n/usr/local/bin root:root 755 drwxr-xr-x"
      )
    ).not.toThrow();
    expect(() =>
      assertPrivilegedDirsSafe(
        "/opt/bin agent:agent 755 drwxr-xr-x\n/usr/local/bin root:root 755 drwxr-xr-x"
      )
    ).toThrow("privileged directory /opt/bin is not root-owned");
    expect(() =>
      assertPrivilegedDirsSafe(
        "/opt/bin root:root 777 drwxrwxrwx\n/usr/local/bin root:root 755 drwxr-xr-x"
      )
    ).toThrow("privileged directory /opt/bin is not root-owned");
  });
});
