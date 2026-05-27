import {
  SANDBOX_ROOT_CONSUMED_DIRS,
  SANDBOX_ROOT_SAFE_PATH,
} from "@app/lib/api/sandbox/hardening";
import {
  assertLocalAuthHelpersNotSetuid,
  assertNoEmptyPasswordAccounts,
  assertNoPasswordlessSudoers,
  assertNoPrivilegedGroupMembers,
  assertRootConsumedDirsSafe,
  assertRootInvokedHelpersSafe,
  assertRootPathSafe,
  assertSudoAbsent,
  buildBashCommand,
  containsUnrestrictedSudo,
} from "@app/scripts/sandbox_security_check";
import { describe, expect, test } from "vitest";

describe("sandbox security check assertions", () => {
  test("runs audit scripts in a non-login bash shell", () => {
    expect(buildBashCommand("echo 'ok'")).toBe(
      "/bin/bash -c 'echo '\\''ok'\\'''"
    );
  });

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
    expect(() =>
      assertNoPrivilegedGroupMembers(
        "user:x:1001:27::/home/user:/bin/bash\nsudo:x:27:\n"
      )
    ).toThrow("privileged group sudo is the primary group");
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

  test("detects unsafe root-consumed directory ownership or modes", () => {
    const safeOutput = SANDBOX_ROOT_CONSUMED_DIRS.map(
      (dir) => `${dir} root:root 755 drwxr-xr-x`
    ).join("\n");

    expect(() => assertRootConsumedDirsSafe(safeOutput)).not.toThrow();
    expect(() =>
      assertRootConsumedDirsSafe(
        safeOutput.replace(
          "/usr/local/lib root:root 755",
          "/usr/local/lib agent:agent 755"
        )
      )
    ).toThrow("root-consumed directory /usr/local/lib is not root-owned");
    expect(() =>
      assertRootConsumedDirsSafe(
        safeOutput.replace(
          "/usr/local/lib/systemd/system root:root 755",
          "/usr/local/lib/systemd/system root:root 777"
        )
      )
    ).toThrow(
      "root-consumed directory /usr/local/lib/systemd/system is not root-owned"
    );
  });

  test("detects unsafe root-invoked helper ownership or modes", () => {
    expect(() =>
      assertRootInvokedHelpersSafe(
        "/opt/bin/dsbx root:root 755 -rwxr-xr-x\n/usr/local/bin/dust-install-trust-bundle root:root 755 -rwxr-xr-x"
      )
    ).not.toThrow();
    expect(() =>
      assertRootInvokedHelpersSafe(
        "/opt/bin/dsbx root:root 777 -rwxrwxrwx\n/usr/local/bin/dust-install-trust-bundle root:root 755 -rwxr-xr-x"
      )
    ).toThrow("root-invoked helper is not root-owned");
    expect(() =>
      assertRootInvokedHelpersSafe("/opt/bin/dsbx root:root 755 -rwxr-xr-x")
    ).toThrow(
      "missing root-invoked helper audit for /usr/local/bin/dust-install-trust-bundle"
    );
  });

  test("detects root PATH entries that can resolve agent-writable binaries", () => {
    expect(() =>
      assertRootPathSafe(
        `ROOT_EXEC_PATH=${SANDBOX_ROOT_SAFE_PATH}\nROOT_LOGIN_PATH=${SANDBOX_ROOT_SAFE_PATH}`
      )
    ).not.toThrow();
    expect(() =>
      assertRootPathSafe(
        `ROOT_EXEC_PATH=${SANDBOX_ROOT_SAFE_PATH}\nROOT_LOGIN_PATH=/root/.local/bin:/opt/bin:/opt/venv/bin:/usr/bin`
      )
    ).toThrow("root PATH must only contain root-owned executable directories");
  });
});
