import {
  SANDBOX_ROOT_CONSUMED_DIRS,
  SANDBOX_ROOT_SAFE_PATH,
} from "@app/lib/api/sandbox/hardening";
import { getSandboxImageFromRegistry } from "@app/lib/api/sandbox/image/registry";
import {
  type Operation,
  SANDBOX_UNTRUSTED_UIDS,
} from "@app/lib/api/sandbox/image/types";
import { SANDBOX_TRUST_ENV_VARS } from "@app/lib/api/sandbox/trust_env";
import { describe, expect, test } from "vitest";

function getDustBaseImage() {
  const imageResult = getSandboxImageFromRegistry({ name: "dust-base" });
  if (imageResult.isErr()) {
    throw imageResult.error;
  }

  return imageResult.value;
}

function getDustBaseImageOperations(): readonly Operation[] {
  return getDustBaseImage().operations;
}

function getRunCommands(operations: readonly Operation[]): string[] {
  return operations.flatMap((operation) =>
    operation.type === "run" ? [operation.command] : []
  );
}

function getCopyOperations(
  operations: readonly Operation[]
): Extract<Operation, { type: "copy" }>[] {
  return operations.flatMap((operation) =>
    operation.type === "copy" ? [operation] : []
  );
}

function getCopiedContent(
  copyOperations: readonly Extract<Operation, { type: "copy" }>[],
  dest: string
): string {
  const operation = copyOperations.find(
    (copyOperation) => copyOperation.dest === dest
  );
  expect(operation).toBeDefined();
  expect(operation?.src.type).toBe("content");

  if (!operation || operation.src.type !== "content") {
    throw new Error(`missing copied content for ${dest}`);
  }

  const content = operation.src.getContent();
  return typeof content === "string" ? content : content.toString("utf-8");
}

function expectContentInOrder(
  content: string,
  firstNeedle: string,
  secondNeedle: string
): void {
  const firstIndex = content.indexOf(firstNeedle);
  const secondIndex = content.indexOf(secondNeedle);

  expect(firstIndex).toBeGreaterThanOrEqual(0);
  expect(secondIndex).toBeGreaterThanOrEqual(0);
  expect(firstIndex).toBeLessThan(secondIndex);
}

describe("sandbox image registry", () => {
  test("pins the current dust-base image tag", () => {
    expect(getDustBaseImage().imageId).toEqual({
      imageName: "dust-base",
      tag: "0.8.30",
    });
  });

  test("creates the dormant proxied user and shared-path permissions", () => {
    const operations = getDustBaseImageOperations();
    const runCommands = getRunCommands(operations);

    expect(runCommands).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "install -d -o agent -g agent -m 2775 /home/agent/.local /home/agent/.local/bin"
        ),
        expect.stringContaining(
          "useradd --create-home --uid 1003 --gid agent --shell /bin/bash agent-proxied"
        ),
        expect.stringContaining(
          "chgrp agent /home/agent /home/agent/.local /home/agent/.local/bin /files/conversation"
        ),
        expect.stringContaining(
          "chmod g+ws /home/agent /home/agent/.local /home/agent/.local/bin /files/conversation"
        ),
        expect.stringContaining(
          "setfacl -R -d -m g::rwx /home/agent /home/agent/.local /home/agent/.local/bin /files/conversation"
        ),
        expect.stringContaining(
          "setfacl -R -m g::rwx /home/agent /home/agent/.local /home/agent/.local/bin /files/conversation"
        ),
        expect.stringContaining(
          "useradd --system --no-create-home --gid dust-egress-resolver --shell /usr/sbin/nologin dust-egress-resolver"
        ),
      ])
    );
  });

  test("hardens provider-created local accounts and sudo before agent code exists", () => {
    const runCommands = getRunCommands(getDustBaseImageOperations());
    const hardeningCommands = runCommands.filter((command) =>
      command.includes("sudo must not be installed in sandbox images")
    );
    const firstHardeningIndex = runCommands.findIndex((command) =>
      command.includes("sudo must not be installed in sandbox images")
    );
    const agentProxiedIndex = runCommands.findIndex((command) =>
      command.includes("useradd --create-home --uid 1003")
    );

    expect(hardeningCommands.length).toBeGreaterThanOrEqual(2);
    for (const command of hardeningCommands) {
      expect(command).toContain("passwd -l root");
      expect(command).toContain("zz-dust-root-safe-path.sh");
      expect(command).toContain(SANDBOX_ROOT_SAFE_PATH);
      expect(command).toContain("awk -F: '$2 == \"\" {print $1}'");
      expect(command).toContain('passwd -l "$account"');
      expect(command).toContain(
        "usermod --lock --expiredate 1 --shell /usr/sbin/nologin user"
      );
      expect(command).toContain("gpasswd -d user");
      expect(command).toContain("for member in $members");
      expect(command).toContain("NOPASSWD");
      expect(command).toContain("apt-get purge -y sudo");
      expect(command).toContain("sudo_path.disabled-by-dust");
      expect(command).toContain("/usr/bin/su");
      expect(command).toContain("/usr/bin/passwd");
      expect(command).toContain("chmod u-s");
      expect(command).toContain(
        "install -d -o root -g root -m 755 /opt/bin /usr/local /usr/local/sbin /usr/local/bin /usr/local/lib"
      );
      expect(command).toContain("/usr/local/lib/systemd/system");
      expect(command).toContain("/run/systemd/system");
      expect(command).toContain(
        "for path in /opt/bin/dsbx /usr/local/bin/dust-install-trust-bundle"
      );
      expect(command).toContain("empty-password local accounts must not exist");
      expect(command).toContain("privileged primary group");
      expect(command).toContain(
        "passwordless unrestricted sudoers entries must not exist"
      );
      expect(command).toContain("local auth helper must not be setuid");
      expect(command).toContain("root-consumed directory must be root-owned");
    }
    expect(firstHardeningIndex).toBeGreaterThanOrEqual(0);
    expect(agentProxiedIndex).toBeGreaterThan(firstHardeningIndex);
  });

  test("keeps root-consumed lookup directories root-owned", () => {
    const runCommands = getRunCommands(getDustBaseImageOperations());
    const rootConsumedDirs = SANDBOX_ROOT_CONSUMED_DIRS.join(" ");

    expect(runCommands).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          `/usr/bin/install -d -o root -g root -m 755 ${rootConsumedDirs}`
        ),
      ])
    );
    expect(runCommands.join("\n")).toContain("/usr/local/lib/systemd/system");
    expect(runCommands.join("\n")).toContain("/run/systemd/system");
  });

  test("disables and hardens sshd in the base image", () => {
    const runCommands = getRunCommands(getDustBaseImageOperations());
    const hardeningCommand = runCommands.find((command) =>
      command.includes("00-dust-sandbox-hardening.conf")
    );

    expect(hardeningCommand).toBeDefined();
    expect(hardeningCommand).toContain("Include /etc/ssh/sshd_config.d/*.conf");
    expect(hardeningCommand).toContain("PermitRootLogin no");
    expect(hardeningCommand).toContain("UsePAM no");
    expect(hardeningCommand).toContain("AuthorizedKeysCommand none");
    expect(hardeningCommand).toContain(
      "AuthorizedKeysFile /etc/ssh/authorized_keys/%u"
    );
    expect(hardeningCommand).toContain("AllowUsers agent");
    expect(hardeningCommand).toContain("DenyUsers root agent-proxied");
    expect(hardeningCommand).toContain("pam_permit\\.so");
    expect(hardeningCommand).toContain(
      "systemctl disable --now ssh.service ssh.socket"
    );
    expect(hardeningCommand).toContain("systemctl mask ssh.service ssh.socket");
  });

  test("copies the egress boot assets and enables the systemd units", () => {
    const operations = getDustBaseImageOperations();
    const runCommands = getRunCommands(operations);
    const copyOperations = getCopyOperations(operations);
    const nftablesScript = getCopiedContent(
      copyOperations,
      "/etc/dust/egress-nftables.sh"
    );
    const serviceUnit = getCopiedContent(
      copyOperations,
      "/etc/systemd/system/dust-egress-nftables.service"
    );
    const resolverUnit = getCopiedContent(
      copyOperations,
      "/etc/systemd/system/dust-egress-resolver.service"
    );

    expect(runCommands).toEqual(
      expect.arrayContaining([
        "chmod 755 /etc/dust/egress-nftables.sh",
        "systemctl daemon-reload && systemctl enable dust-egress-resolver.service dust-egress-nftables.service",
      ])
    );

    expect(runCommands.join("\n")).not.toContain(
      "chmod 755 /etc/dust/egress-nftables.sh && /etc/dust/egress-nftables.sh"
    );
    expect(runCommands.join("\n")).not.toContain("iptables");

    expect(serviceUnit).toContain(
      "Description=Dust egress nftables rules for agent-proxied"
    );
    expect(serviceUnit).toContain("Type=oneshot");
    expect(serviceUnit).toContain("RemainAfterExit=yes");
    expect(serviceUnit).toContain("ExecStart=/etc/dust/egress-nftables.sh");
    expect(serviceUnit).toContain("WantedBy=multi-user.target");
    expect(serviceUnit).not.toContain("Requires=dust-egress-resolver.service");

    expect(resolverUnit).toContain(
      "Description=Dust local DNS resolver for agent-proxied"
    );
    expect(resolverUnit).toContain("Before=dust-egress-nftables.service");
    expect(resolverUnit).toContain("User=dust-egress-resolver");
    expect(resolverUnit).toContain("Group=dust-egress-resolver");
    expect(resolverUnit).toContain(
      "ExecStart=/opt/bin/dsbx resolve --listen 127.0.0.1:1053"
    );
    expect(resolverUnit).toContain("Restart=on-failure");
    expect(resolverUnit).toContain("RestartSec=2s");
    expect(resolverUnit).toContain("WantedBy=multi-user.target");
    expect(resolverUnit).toContain("NoNewPrivileges=yes");
    expect(resolverUnit).toContain("ProtectSystem=strict");
    expect(resolverUnit).toContain("RestrictAddressFamilies=AF_INET");
    expect(resolverUnit).toContain("MemoryDenyWriteExecute=yes");

    expect(nftablesScript).toContain("nft add table ip dust-egress");
    expect(nftablesScript).toContain("DNS_STUB_PORT=1053");
    expect(nftablesScript).toContain(
      "nft add chain ip dust-egress nat_output '{ type nat hook output priority -100 ; policy accept ; }'"
    );
    expect(nftablesScript).toContain(
      "nft add chain ip dust-egress filter_output '{ type filter hook output priority 0 ; policy accept ; }'"
    );
    expect(nftablesScript).toContain(
      "nft add rule ip dust-egress nat_output meta skuid $PROXIED_UID ip daddr 127.0.0.0/8 return"
    );
    expect(nftablesScript).toContain(
      "nft add rule ip dust-egress nat_output meta skuid $PROXIED_UID udp dport 53 redirect to :$DNS_STUB_PORT"
    );
    expect(nftablesScript).toContain(
      "nft add rule ip dust-egress nat_output meta skuid $PROXIED_UID tcp dport 53 redirect to :$DNS_STUB_PORT"
    );
    expect(nftablesScript).toContain(
      "nft add rule ip dust-egress nat_output meta skuid $PROXIED_UID tcp dport != 0 redirect to :9990"
    );
    expect(nftablesScript).toContain(
      "nft add rule ip dust-egress filter_output meta skuid $PROXIED_UID ip daddr 127.0.0.1 udp dport $DNS_STUB_PORT accept"
    );
    expect(nftablesScript).toContain(
      "nft add rule ip dust-egress filter_output meta skuid $PROXIED_UID ip daddr 127.0.0.0/8 tcp dport 22 drop"
    );
    expect(nftablesScript).toContain(
      "nft add rule ip dust-egress filter_output meta skuid $PROXIED_UID ip daddr 169.254.169.254 drop"
    );
    expect(nftablesScript).toContain(
      "nft add rule ip6 dust-egress filter_output meta skuid $PROXIED_UID drop"
    );
    expect(nftablesScript).not.toContain("/etc/resolv.conf");
    expect(nftablesScript).not.toContain('ip daddr "$NS"');

    expectContentInOrder(
      nftablesScript,
      "udp dport 53 redirect to :$DNS_STUB_PORT",
      "ip daddr 127.0.0.0/8 return"
    );
    expectContentInOrder(
      nftablesScript,
      "tcp dport 53 redirect to :$DNS_STUB_PORT",
      "tcp dport != 0 redirect to :9990"
    );
    expectContentInOrder(
      nftablesScript,
      "udp dport $DNS_STUB_PORT accept",
      "tcp dport 22 drop"
    );
    expectContentInOrder(
      nftablesScript,
      "tcp dport 22 drop",
      "meta l4proto udp drop"
    );
  });

  test("installs the current dsbx CLI release", () => {
    const runCommands = getRunCommands(getDustBaseImageOperations());

    expect(runCommands).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "https://github.com/dust-tt/dust/releases/download/dsbx-v0.1.23/dsbx-linux-x86_64"
        ),
        expect.stringContaining(
          "chown root:root /opt/bin/dsbx && chmod 755 /opt/bin/dsbx"
        ),
      ])
    );
  });

  test("keeps the nftables UID filter aligned with untrusted sandbox UIDs", () => {
    const copyOperations = getCopyOperations(getDustBaseImageOperations());
    const nftablesScript = getCopiedContent(
      copyOperations,
      "/etc/dust/egress-nftables.sh"
    );
    const proxiedUidMatch = /^PROXIED_UID=(\d+)$/m.exec(nftablesScript);
    const configuredUids = proxiedUidMatch ? [Number(proxiedUidMatch[1])] : [];

    expect(configuredUids).toEqual([...SANDBOX_UNTRUSTED_UIDS]);
  });

  test("installs trust env defaults and the runtime trust helper", () => {
    const operations = getDustBaseImageOperations();
    const runCommands = getRunCommands(operations);
    const copyOperations = getCopyOperations(operations);
    const environment = getCopiedContent(
      copyOperations,
      "/etc/dust/dust-trust.environment"
    );
    const profileScript = getCopiedContent(
      copyOperations,
      "/etc/profile.d/dust-trust.sh"
    );
    const tmpfilesConfig = getCopiedContent(
      copyOperations,
      "/etc/tmpfiles.d/dust-run-dust.conf"
    );
    const installer = getCopiedContent(
      copyOperations,
      "/usr/local/bin/dust-install-trust-bundle"
    );

    expect(runCommands).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "cat /etc/dust/dust-trust.environment >> /etc/environment"
        ),
        "chmod 644 /etc/profile.d/dust-trust.sh",
        "chown root:root /usr/local/bin/dust-install-trust-bundle && chmod 755 /usr/local/bin/dust-install-trust-bundle",
      ])
    );

    // Derive expected contents directly from SANDBOX_TRUST_ENV_VARS so any
    // future drift between the const and the image-baked files fails this
    // test rather than silently shipping a stale env file.
    const expectedEnvironment =
      Object.entries(SANDBOX_TRUST_ENV_VARS)
        .map(([k, v]) => `${k}=${formatExpectedEnvironmentValue(v)}`)
        .join("\n") + "\n";
    const expectedProfile =
      Object.entries(SANDBOX_TRUST_ENV_VARS)
        .map(([k, v]) => `export ${k}=${formatExpectedShellValue(v)}`)
        .join("\n") + "\n";

    expect(environment).toBe(expectedEnvironment);
    expect(profileScript).toBe(expectedProfile);
    expect(environment).toContain(
      `JAVA_TOOL_OPTIONS=${JSON.stringify(SANDBOX_TRUST_ENV_VARS.JAVA_TOOL_OPTIONS)}\n`
    );
    expect(profileScript).toContain(
      `export JAVA_TOOL_OPTIONS='${SANDBOX_TRUST_ENV_VARS.JAVA_TOOL_OPTIONS}'\n`
    );

    expect(tmpfilesConfig).toBe("d /run/dust 0755 root root -\n");
    expect(installer).toContain("update-ca-certificates");
    expect(installer).toContain('cat "$SYSTEM_CA_BUNDLE"');
    expect(installer).toContain('cat "$CA_PATH"');
    expect(installer).toContain("/etc/ssl/certs/java/cacerts");
    expect(installer).toContain("if command -v keytool >/dev/null 2>&1");
    expect(installer).toContain("keytool -importcert -noprompt -trustcacerts");
    expect(installer).toContain("already exists");
  });
});

function formatExpectedEnvironmentValue(value: string): string {
  return isBareExpectedEnvironmentValue(value) ? value : JSON.stringify(value);
}

function formatExpectedShellValue(value: string): string {
  if (isBareExpectedEnvironmentValue(value)) {
    return value;
  }

  return `'${value.replace(/'/g, "'\\''")}'`;
}

function isBareExpectedEnvironmentValue(value: string): boolean {
  return /^[A-Za-z0-9_./:,@%+=-]+$/.test(value);
}
