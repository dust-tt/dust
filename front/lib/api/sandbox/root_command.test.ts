import {
  renderRootCommand,
  rootCommand,
} from "@app/lib/api/sandbox/root_command";
import { describe, expect, test } from "vitest";

describe("rootCommand", () => {
  test("requires absolute executables", () => {
    expect(() => rootCommand.exec("cat", ["/tmp/file"])).toThrow(
      "Root command executable must be absolute"
    );
  });

  test("requires non-empty command lists", () => {
    expect(() => rootCommand.and([])).toThrow(
      "Root command list must not be empty"
    );
  });

  test("requires positive integer timeouts", () => {
    expect(() => rootCommand.timeout(rootCommand.exec("/bin/true"), 0)).toThrow(
      "Root command timeout must be a positive integer"
    );
    expect(() =>
      rootCommand.timeout(rootCommand.exec("/bin/true"), 1.5)
    ).toThrow("Root command timeout must be a positive integer");
  });

  test("quotes command arguments", () => {
    expect(
      renderRootCommand(rootCommand.exec("/usr/bin/cat", ["/tmp/a file"]))
    ).toBe("/usr/bin/cat '/tmp/a file'");
  });

  test("composes root commands without parsing shell", () => {
    const command = rootCommand.background(
      rootCommand.redirectStdout(
        rootCommand.nohup(
          rootCommand.env(rootCommand.exec("/opt/bin/dsbx", ["forward"]), {
            unset: ["SSL_CERT_FILE"],
          })
        ),
        "/tmp/dsbx.log",
        { stderrToStdout: true }
      )
    );

    expect(renderRootCommand(command)).toBe(
      "/usr/bin/nohup /usr/bin/env -u SSL_CERT_FILE /opt/bin/dsbx forward >'/tmp/dsbx.log' 2>&1 &"
    );
  });

  test("groups compound commands before applying wrappers", () => {
    const command = rootCommand.timeout(
      rootCommand.and([
        rootCommand.exec("/bin/echo", ["first"]),
        rootCommand.exec("/bin/echo", ["second"]),
      ]),
      5
    );

    expect(renderRootCommand(command)).toBe(
      "/usr/bin/timeout 5 /bin/bash --noprofile --norc -c '/bin/echo first && /bin/echo second'"
    );
  });

  test("groups compound commands before joining with and", () => {
    const command = rootCommand.and([
      rootCommand.unsafeShell(
        "/bin/echo first; /bin/echo still-first",
        "compound test command"
      ),
      rootCommand.background(rootCommand.exec("/bin/echo", ["second"])),
    ]);

    expect(renderRootCommand(command)).toBe(
      "/bin/bash --noprofile --norc -c '/bin/echo first; /bin/echo still-first' && /bin/bash --noprofile --norc -c '/bin/echo second &'"
    );
  });

  test("makes unsafe shell explicit", () => {
    expect(() => rootCommand.unsafeShell("", "empty command")).toThrow(
      "Unsafe root shell commands must not be empty"
    );
    expect(() =>
      rootCommand.unsafeShell("if true; then echo ok; fi", "")
    ).toThrow("Unsafe root shell commands must include a reason");

    const command = rootCommand.unsafeShell(
      "if true; then echo ok; fi",
      "compound shell flow"
    );

    expect(renderRootCommand(command)).toBe("if true; then echo ok; fi");
    expect(command.unsafeReason).toBe("compound shell flow");
  });
});
