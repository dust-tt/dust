import {
  getSandboxServicePathHardeningCommand,
  SANDBOX_AGENT_PROXIED_SAFE_PATH,
  SANDBOX_ROOT_INVOKED_HELPERS,
  SANDBOX_STATIC_ROOT_CONSUMED_DIRS,
} from "@app/lib/api/sandbox/hardening";
import {
  SANDBOX_AGENT_PROXIED_UID,
  SANDBOX_AGENT_UID,
} from "@app/lib/api/sandbox/image/types";
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const POLLER_JOB_SOURCE = path.resolve(
  __dirname,
  "../../../../cli/dust-sandbox/src/commands/poller/job.rs"
);

function readPollerJobSource(): string {
  return fs.readFileSync(POLLER_JOB_SOURCE, "utf-8");
}

describe("sandbox root-consumed path hardening", () => {
  it("covers the directory root reads the poller's identity out of", () => {
    // The poller's credential and settings live under /etc/dust, and root installs them there. A
    // workload able to write it would be running as root without needing to hijack a command.
    expect(SANDBOX_STATIC_ROOT_CONSUMED_DIRS).toContain("/etc/dust");
  });

  it("keeps the runner root-owned, since a root process spawns it", () => {
    expect(SANDBOX_ROOT_INVOKED_HELPERS).toContain("/opt/bin/dsbx");
  });

  it("pins the poller's unit to root ownership", () => {
    const command = getSandboxServicePathHardeningCommand();

    expect(command).toContain(
      "/usr/bin/chown root:root /etc/systemd/system/dust-poller.service"
    );
    expect(command).toContain(
      "/bin/chmod 644 /etc/systemd/system/dust-poller.service"
    );
  });

  it("fails the build when the poller's unit is writable by anyone but root", () => {
    const command = getSandboxServicePathHardeningCommand();

    // An assertion rather than a fix-up: if the copy step ever lands it differently, the image
    // build has to stop rather than quietly produce a sandbox a workload can take over.
    expect(command).toContain(
      "/etc/systemd/system/dust-poller.service \\( ! -user root -o ! -group root -o -perm /022 \\)"
    );
    expect(command).toContain(
      "poller service files must be root-owned and not group/other writable"
    );
  });
});

describe("Pod function poller credential drop", () => {
  // The poller runs as root and drops each function to the workload account itself. Neither side
  // can import the other's constants, and getting any of these wrong means function code running
  // with the wrong privileges, so they are asserted equal here.
  it("drops to the same account the exec path runs functions as", () => {
    const source = readPollerJobSource();

    expect(source).toContain(
      `const WORKLOAD_UID: u32 = ${SANDBOX_AGENT_PROXIED_UID};`
    );
    expect(source).toContain(
      `const WORKLOAD_GID: u32 = ${SANDBOX_AGENT_PROXIED_UID};`
    );
  });

  it("keeps the agent group membership that pod state depends on", () => {
    const source = readPollerJobSource();

    // agent-proxied is a supplementary member of `agent`, which is what grants read/write on the
    // shared pod databases. A function that loses it loses its own state.
    expect(source).toContain(`const AGENT_GID: u32 = ${SANDBOX_AGENT_UID};`);
  });

  it("gives the function the workload account's PATH", () => {
    const source = readPollerJobSource();

    // The exec path inherits this from the sandbox exec environment. The poller clears the
    // environment, so it has to state it, and a drifted copy means functions resolving binaries
    // differently depending on which transport ran them.
    expect(source).toContain(`"${SANDBOX_AGENT_PROXIED_SAFE_PATH}"`);
  });
});
