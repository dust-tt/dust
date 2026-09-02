import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SANDBOX_ROOT_SAFE_PATH,
  SANDBOX_STATIC_ROOT_CONSUMED_DIRS,
} from "@app/lib/api/sandbox/hardening";
import { getSandboxImageFromRegistry } from "@app/lib/api/sandbox/image/registry";
import type { Operation } from "@app/lib/api/sandbox/image/types";
import { SANDBOX_EGRESS_CONTROLLED_UIDS } from "@app/lib/api/sandbox/image/types";
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

function getCommandPath(command: string): string {
  const result = spawnSync("sh", ["-c", `command -v ${command}`], {
    encoding: "utf8",
  });

  expect(result.status).toBe(0);
  return result.stdout.trim();
}

describe("sandbox image registry", () => {
  test("pins the current dust-base and sbx bedrock image tags", () => {
    expect(getDustBaseImage().imageId).toEqual({
      imageName: "dust-base",
      tag: "0.8.106",
    });
    expect(getDustBaseImage().baseImage).toEqual({
      type: "docker",
      imageRef: "dust-sbx-bedrock:1.11.0",
    });
    expect(getDustBaseImage().hasCapability("dust_filesystem")).toBe(true);
  });

  test("loads Fluent Bit credentials from a root-only runtime file", () => {
    const serviceUnit = getCopiedContent(
      getCopyOperations(getDustBaseImageOperations()),
      "/etc/systemd/system/fluent-bit.service"
    );

    expect(serviceUnit).toContain("EnvironmentFile=/run/dust/fluent-bit.env");
    expect(serviceUnit).not.toContain("Environment=DD_API_KEY");
  });

  test("creates the dormant proxied user and shared-path permissions", () => {
    const operations = getDustBaseImageOperations();
    const runCommands = getRunCommands(operations);

    expect(runCommands).toEqual(
      expect.arrayContaining([
        expect.stringContaining("groupadd --gid 1003 agent-proxied"),
        expect.stringContaining(
          "useradd --create-home --uid 1003 --gid agent-proxied --groups agent --shell /bin/bash agent-proxied"
        ),
        expect.stringContaining("chgrp agent /files"),
        expect.stringContaining("chmod 2775 /files"),
        expect.stringContaining("setfacl -R -d -m g::rwx /files"),
        expect.stringContaining("setfacl -R -m g::rwx /files"),
        expect.stringContaining(
          "useradd --system --no-create-home --gid dust-egress-resolver --shell /usr/sbin/nologin dust-egress-resolver"
        ),
      ])
    );

    expect(runCommands.join("\n")).not.toContain("chmod g+ws /home/agent");
    expect(runCommands.join("\n")).not.toContain(
      "setfacl -R -d -m g::rwx /home/agent"
    );
  });

  test("locks service-owned runtime paths after all package installs", () => {
    const runCommands = getRunCommands(getDustBaseImageOperations());
    const permissionCommand = runCommands.find((command) =>
      command.includes("sandbox service paths must not be group/other writable")
    );

    expect(permissionCommand).toBeDefined();
    expect(permissionCommand).toContain(
      "/usr/bin/chown -R root:agent /home/agent"
    );
    expect(permissionCommand).toContain(
      "/usr/sbin/usermod --home /var/empty agent"
    );
    expect(permissionCommand).toContain(
      "/bin/rm -f /home/agent/.bash_profile /home/agent/.bash_login /home/agent/.profile /home/agent/.bashrc"
    );
    expect(permissionCommand).toContain(
      "/usr/bin/find /home/agent -type d -exec /bin/chmod 2750 {} +"
    );
    expect(permissionCommand).toContain(
      "/usr/bin/chown -R root:root /opt/venv"
    );
    expect(permissionCommand).toContain("/bin/chmod -R go-w /opt/venv");
    expect(permissionCommand).toContain(
      "/usr/bin/chown -R root:root /opt/dust/profile"
    );
    expect(permissionCommand).toContain(
      "/bin/chmod 644 /opt/dust/profile/*.sh"
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
      expect(command).toContain("/usr/bin/systemd-analyze unit-paths");
      expect(command).toContain("systemd unit path must be absolute");
      expect(command).toContain(
        "for path in /opt/bin/dsbx /usr/local/bin/dust-install-trust-bundle /usr/local/bin/dust-gcs-token-server.py /usr/local/bin/dust-gcs-write-token.sh /usr/local/bin/dust-gcs-token-firewall.sh /opt/bin/litestream"
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
    const staticRootConsumedDirs = SANDBOX_STATIC_ROOT_CONSUMED_DIRS.join(" ");

    expect(SANDBOX_STATIC_ROOT_CONSUMED_DIRS).toContain(
      "/usr/local/share/ca-certificates"
    );
    expect(runCommands).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          `/usr/bin/install -d -o root -g root -m 755 ${staticRootConsumedDirs}`
        ),
      ])
    );
    expect(runCommands.join("\n")).toContain(
      "/usr/bin/systemd-analyze unit-paths"
    );
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
    const resolve1Policy = getCopiedContent(
      copyOperations,
      "/etc/dbus-1/system.d/dust-resolve1.conf"
    );
    const systemd1Policy = getCopiedContent(
      copyOperations,
      "/etc/dbus-1/system.d/dust-systemd1.conf"
    );
    const resolvedIpcDropIn = getCopiedContent(
      copyOperations,
      "/etc/systemd/system/systemd-resolved.service.d/dust-ipc.conf"
    );

    expect(runCommands).toEqual(
      expect.arrayContaining([
        "chmod 755 /etc/dust/egress-nftables.sh",
        "mkdir -p /etc/dbus-1/system.d /etc/systemd/system/systemd-resolved.service.d",
        "systemctl daemon-reload && systemctl enable systemd-resolved.service dust-egress-resolver.service dust-egress-nftables.service",
      ])
    );
    expect(runCommands.join("\n")).toContain(
      "ln -sfn /run/systemd/resolve/stub-resolv.conf /etc/resolv.conf"
    );
    expect(runCommands.join("\n")).toContain("DNSStubListener=yes");

    expect(runCommands.join("\n")).not.toContain(
      "chmod 755 /etc/dust/egress-nftables.sh && /etc/dust/egress-nftables.sh"
    );
    expect(runCommands.join("\n")).not.toContain("iptables");

    expect(serviceUnit).toContain(
      "Description=Dust egress nftables rules for sandbox-controlled accounts"
    );
    expect(serviceUnit).toContain(
      "After=network.target systemd-resolved.service"
    );
    expect(serviceUnit).toContain("Type=oneshot");
    expect(serviceUnit).toContain("RemainAfterExit=yes");
    expect(serviceUnit).toContain("ExecStart=/etc/dust/egress-nftables.sh");
    expect(serviceUnit).toContain("WantedBy=multi-user.target");
    expect(serviceUnit).not.toContain("Requires=dust-egress-resolver.service");

    expect(resolverUnit).toContain(
      "Description=Dust synthetic DNS resolver for sandbox-controlled accounts"
    );
    expect(resolverUnit).toContain("Wants=systemd-resolved.service");
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

    for (const user of ["agent", "agent-proxied"]) {
      expect(resolve1Policy).toContain(`<policy user="${user}">`);
    }
    expect(
      resolve1Policy.match(
        /<deny send_destination="org\.freedesktop\.resolve1"\/>/g
      )
    ).toHaveLength(2);
    for (const user of ["agent", "agent-proxied"]) {
      expect(systemd1Policy).toContain(`<policy user="${user}">`);
    }
    expect(
      systemd1Policy.match(
        /<deny send_destination="org\.freedesktop\.systemd1"\/>/g
      )
    ).toHaveLength(2);
    expect(resolvedIpcDropIn).toContain("[Service]");
    expect(resolvedIpcDropIn).toContain(
      "ExecStartPost=/bin/chmod 0600 /run/systemd/resolve/io.systemd.Resolve"
    );

    expect(nftablesScript).toContain("nft add table ip dust-egress");
    expect(nftablesScript).toContain('CONTROLLED_UIDS="1002 1003"');
    expect(nftablesScript).toContain("DNS_STUB_PORT=1053");
    expect(nftablesScript).toContain("GCS_TOKEN_SERVER_PORT=987");
    expect(nftablesScript).toContain(
      "SYSTEM_RESOLV_CONF=/run/systemd/resolve/stub-resolv.conf"
    );
    expect(nftablesScript).toContain(
      '/bin/ln -sfn "$SYSTEM_RESOLV_CONF" /etc/resolv.conf'
    );
    expect(nftablesScript).toContain(
      "nft add chain ip dust-egress nat_output '{ type nat hook output priority -100 ; policy accept ; }'"
    );
    expect(nftablesScript).toContain(
      "nft add chain ip dust-egress filter_output '{ type filter hook output priority 0 ; policy accept ; }'"
    );
    expect(nftablesScript).toContain(
      "nft add rule ip dust-egress nat_output meta skuid $CONTROLLED_UID ip daddr 127.0.0.0/8 return"
    );
    expect(nftablesScript).toContain(
      "nft add rule ip dust-egress nat_output meta skuid $CONTROLLED_UID udp dport 53 redirect to :$DNS_STUB_PORT"
    );
    expect(nftablesScript).toContain(
      "nft add rule ip dust-egress nat_output meta skuid $CONTROLLED_UID tcp dport 53 redirect to :$DNS_STUB_PORT"
    );
    expect(nftablesScript).toContain(
      "nft add rule ip dust-egress nat_output meta skuid $CONTROLLED_UID tcp dport != 0 redirect to :9990"
    );
    expect(nftablesScript).toContain(
      "nft add rule ip dust-egress filter_output meta skuid $CONTROLLED_UID ip daddr 127.0.0.1 udp dport $DNS_STUB_PORT accept"
    );
    expect(nftablesScript).toContain(
      "nft add rule ip dust-egress filter_output meta skuid $CONTROLLED_UID ip daddr 127.0.0.0/8 tcp dport $GCS_TOKEN_SERVER_PORT drop"
    );
    expect(nftablesScript).toContain(
      "nft add rule ip dust-egress filter_output meta skuid $CONTROLLED_UID ip daddr 127.0.0.0/8 tcp dport 22 drop"
    );
    expect(nftablesScript).toContain(
      "nft add rule ip dust-egress filter_output meta skuid $CONTROLLED_UID ip daddr 169.254.169.254 drop"
    );
    expect(nftablesScript).toContain(
      "nft add rule ip6 dust-egress filter_output meta skuid $CONTROLLED_UID drop"
    );
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
      "tcp dport $GCS_TOKEN_SERVER_PORT drop"
    );
    expectContentInOrder(
      nftablesScript,
      "tcp dport $GCS_TOKEN_SERVER_PORT drop",
      "tcp dport 22 drop"
    );
    expectContentInOrder(
      nftablesScript,
      "tcp dport 22 drop",
      "meta l4proto udp drop"
    );
  });

  test("installs the root-owned GCS token broker without the compatibility broker", () => {
    const operations = getDustBaseImageOperations();
    const runCommands = getRunCommands(operations);
    const copyOperations = getCopyOperations(operations);
    const server = getCopiedContent(
      copyOperations,
      "/usr/local/bin/dust-gcs-token-server.py"
    );
    const writer = getCopiedContent(
      copyOperations,
      "/usr/local/bin/dust-gcs-write-token.sh"
    );
    const firewall = getCopiedContent(
      copyOperations,
      "/usr/local/bin/dust-gcs-token-firewall.sh"
    );

    expect(runCommands).toEqual(
      expect.arrayContaining([
        "apt-get update && apt-get install -y python3",
        "mkdir -p /usr/local/bin",
        expect.stringContaining(
          "chown root:root /usr/local/bin/dust-gcs-token-server.py /usr/local/bin/dust-gcs-write-token.sh /usr/local/bin/dust-gcs-token-firewall.sh"
        ),
      ])
    );
    expect(runCommands.join("\n")).not.toContain(
      "/home/agent/.bin/token-server.sh"
    );
    expect(server).toMatch(/^#!\/usr\/bin\/python3$/m);
    expect(server).toContain('self.path == "/token/mount-0"');
    expect(server).toContain('self.path == "/healthz"');
    expect(server).toContain('Server(("127.0.0.1", 987), Handler)');
    expect(server).not.toContain("/tmp/token.json");
    expect(writer).toContain("^/run/dust-gcs/mount-[0-9]+\\.json$");
    expect(writer).toContain("chmod 600");
    expect(writer).toContain("mv -f");
    expect(firewall).toContain("dust-gcs-token");
    expect(firewall).toContain("/usr/bin/flock -x 9");
    expect(firewall).toContain('CONTROLLED_UIDS="1002 1003"');
    expect(firewall).toContain("for CONTROLLED_UID in $CONTROLLED_UIDS");
    expect(firewall).toContain(
      'meta skuid "$CONTROLLED_UID" ip daddr 127.0.0.0/8 tcp dport 987 drop'
    );
    expect(firewall).not.toContain("delete table ip dust-gcs-token");
  });

  test("installs the current dsbx CLI release", () => {
    const runCommands = getRunCommands(getDustBaseImageOperations());

    expect(runCommands).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "https://github.com/dust-tt/dust/releases/download/dsbx-v0.1.57/dsbx-linux-x86_64"
        ),
        expect.stringContaining(
          "chown root:root /opt/bin/dsbx && chmod 755 /opt/bin/dsbx"
        ),
      ])
    );
  });

  test("installs the pinned dbt Cloud CLI release to /opt/bin", () => {
    const operations = getDustBaseImageOperations();
    const runCommands = getRunCommands(operations);
    const image = getDustBaseImage();
    const installCommand = runCommands.find((command) =>
      command.includes("dbt-labs/dbt-cli/releases/download")
    );

    expect(installCommand).toBeDefined();
    expect(installCommand).toContain(
      "https://github.com/dbt-labs/dbt-cli/releases/download/v0.40.18/dbt_0.40.18_linux_amd64.tar.gz"
    );
    expect(installCommand).toContain(
      "chown root:root /opt/bin/dbt && chmod 755 /opt/bin/dbt"
    );
    expect(image.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "dbt", version: "0.40.18" }),
      ])
    );
  });

  test("installs the pinned Snowflake CLI release to /opt/bin", () => {
    const operations = getDustBaseImageOperations();
    const runCommands = getRunCommands(operations);
    const image = getDustBaseImage();
    const installCommand = runCommands.find((command) =>
      command.includes("sfc-repo.snowflakecomputing.com/snowflake-cli")
    );

    expect(installCommand).toBeDefined();
    expect(installCommand).toContain(
      "https://sfc-repo.snowflakecomputing.com/snowflake-cli/linux_x86_64/3.23.0/snowflake-cli-3.23.0.x86_64.deb"
    );
    expect(installCommand).toContain(
      "bb1a3e645c171f43dac44965daa4047c256424bf47c954fef8b2a00d38e84775  /tmp/snowflake-cli.deb"
    );
    expect(installCommand).toContain(
      "ln -sf /usr/lib/snowflake/snowflake-cli/snow /opt/bin/snow"
    );
    expect(image.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "snow", version: "3.23.0" }),
      ])
    );
  });

  test("installs the pinned litestream release to /opt/bin", () => {
    const runCommands = getRunCommands(getDustBaseImageOperations());
    const installCommand = runCommands.find((command) =>
      command.includes("benbjohnson/litestream/releases/download")
    );

    expect(installCommand).toBeDefined();
    expect(installCommand).toContain(
      "https://github.com/benbjohnson/litestream/releases/download/v0.5.13/litestream-0.5.13-linux-x86_64.tar.gz"
    );
    expect(installCommand).toContain(
      "chown root:root /opt/bin/litestream && chmod 755 /opt/bin/litestream"
    );
  });

  test("creates the dust-state user and the pod-state directory layout", () => {
    const runCommands = getRunCommands(getDustBaseImageOperations());

    expect(runCommands).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "useradd --system --no-create-home --gid dust-state --groups agent --shell /usr/sbin/nologin dust-state"
        ),
        expect.stringContaining("install -d -o root -g root -m 755 /pod-state"),
        expect.stringContaining(
          "install -d -o dust-state -g agent -m 2770 /pod-state/databases"
        ),
        expect.stringContaining("setfacl -R -d -m g::rwx /pod-state/databases"),
        expect.stringContaining("setfacl -R -m g::rwx /pod-state/databases"),
        expect.stringContaining(
          "install -d -o root -g root -m 755 /sandbox-state"
        ),
        expect.stringContaining(
          "install -d -o dust-state -g dust-state -m 700 /sandbox-state/replica"
        ),
      ])
    );
  });

  test("copies the litestream systemd unit for runtime start only", () => {
    const operations = getDustBaseImageOperations();
    const runCommands = getRunCommands(operations);
    const copyOperations = getCopyOperations(operations);
    const litestreamUnit = getCopiedContent(
      copyOperations,
      "/etc/systemd/system/litestream.service"
    );

    expect(litestreamUnit).toContain(
      "Description=Dust Litestream replication daemon for pod state"
    );
    expect(litestreamUnit).toContain("User=dust-state");
    expect(litestreamUnit).toContain("Group=dust-state");
    expect(litestreamUnit).toContain(
      "ExecStart=/opt/bin/litestream replicate -config /etc/litestream.yml"
    );
    expect(litestreamUnit).toContain("Restart=always");
    // fluent-bit's journal grep filter forwards on this identifier.
    expect(litestreamUnit).toContain("SyslogIdentifier=litestream");
    expect(litestreamUnit).toContain("RuntimeDirectory=litestream");
    expect(litestreamUnit).toContain("NoNewPrivileges=yes");
    expect(litestreamUnit).toContain("ProtectSystem=strict");
    expect(litestreamUnit).toContain(
      "ReadWritePaths=/pod-state /sandbox-state"
    );
    expect(litestreamUnit).toContain("RestrictAddressFamilies=AF_UNIX");
    expect(litestreamUnit).toContain("MemoryDenyWriteExecute=yes");

    // The unit must NOT be enabled at build: front starts the daemon at
    // runtime AFTER the replica mount + restore. Enabled at boot, the daemon
    // would write to the unmounted local replica dir (the silent-unmount
    // failure mode) and manage files mid-restore.
    const enableCommands = runCommands.filter((command) =>
      command.includes("systemctl enable")
    );
    expect(enableCommands.length).toBeGreaterThan(0);
    for (const command of enableCommands) {
      expect(command).not.toContain("litestream");
    }
  });

  test("bakes the static litestream directory-watcher config", () => {
    const copyOperations = getCopyOperations(getDustBaseImageOperations());
    const litestreamConfig = getCopiedContent(
      copyOperations,
      "/etc/litestream.yml"
    );

    // JSON logs so fluent-bit's json parser structures the journal entries.
    expect(litestreamConfig).toContain("logging:");
    expect(litestreamConfig).toContain("type: json");

    // Control socket for the pre-sleep `litestream sync -wait`.
    expect(litestreamConfig).toContain("socket:");
    expect(litestreamConfig).toContain("enabled: true");
    expect(litestreamConfig).toContain("path: /run/litestream/litestream.sock");

    // Directory watcher: post-cold-start databases are discovered
    // automatically; the replica subdir is named by db FILENAME ({db}.db).
    expect(litestreamConfig).toContain("dir: /pod-state/databases");
    expect(litestreamConfig).toContain('pattern: "*.db"');
    expect(litestreamConfig).toContain("watch: true");
    expect(litestreamConfig).toContain("type: file");
    expect(litestreamConfig).toContain("path: /sandbox-state/replica");
  });

  test("pins drizzle packages and vendors @dust/pod", () => {
    const operations = getDustBaseImageOperations();
    const runCommands = getRunCommands(operations);
    const copyOperations = getCopyOperations(operations);
    const image = getDustBaseImage();

    expect(runCommands).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "npm install -g typescript tsx pptxgenjs@4.0.1 zod@4.4.3 drizzle-orm@0.45.2 drizzle-kit@0.31.10 @libsql/client@0.17.4"
        ),
        expect.stringContaining(
          "mkdir -p /opt/npm-global/lib/node_modules/@dust"
        ),
      ])
    );

    // Vendored copy of @dust/pod. Do NOT materialize the content here: the
    // generator bun-builds cli/dust-sandbox/pod, which is written by a
    // parallel track and may be absent in this checkout.
    const podCopy = copyOperations.find(
      (operation) =>
        operation.dest === "/opt/npm-global/lib/node_modules/@dust/pod"
    );
    expect(podCopy).toBeDefined();
    expect(podCopy?.src.type).toBe("content");

    expect(image.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "drizzle-orm", version: "0.45.2" }),
        expect.objectContaining({ name: "drizzle-kit", version: "0.31.10" }),
        expect.objectContaining({ name: "@libsql/client", version: "0.17.4" }),
        expect.objectContaining({ name: "@dust/pod", version: "0.3.2" }),
      ])
    );
  });

  test("runs pod-state install ops before the final hardening re-run", () => {
    const runCommands = getRunCommands(getDustBaseImageOperations());
    const lastHardeningIndex = runCommands.reduce(
      (last, command, index) =>
        command.includes("sudo must not be installed in sandbox images")
          ? index
          : last,
      -1
    );
    const litestreamIndex = runCommands.findIndex((command) =>
      command.includes("benbjohnson/litestream/releases/download")
    );
    const podStateIndex = runCommands.findIndex((command) =>
      command.includes("install -d -o dust-state -g agent -m 2770")
    );
    const drizzleIndex = runCommands.findIndex((command) =>
      command.includes("drizzle-orm@0.45.2")
    );
    const podPackageMkdirIndex = runCommands.findIndex((command) =>
      command.includes("mkdir -p /opt/npm-global/lib/node_modules/@dust")
    );

    expect(lastHardeningIndex).toBeGreaterThanOrEqual(0);
    for (const index of [
      litestreamIndex,
      podStateIndex,
      drizzleIndex,
      podPackageMkdirIndex,
    ]) {
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(lastHardeningIndex);
    }
  });

  test("keeps the nftables UID filter aligned with controlled sandbox UIDs", () => {
    const copyOperations = getCopyOperations(getDustBaseImageOperations());
    const nftablesScript = getCopiedContent(
      copyOperations,
      "/etc/dust/egress-nftables.sh"
    );
    const tokenFirewallScript = getCopiedContent(
      copyOperations,
      "/usr/local/bin/dust-gcs-token-firewall.sh"
    );
    const controlledUidsMatch = /^CONTROLLED_UIDS="([\d ]+)"$/m.exec(
      nftablesScript
    );
    const tokenFirewallUidsMatch = /^CONTROLLED_UIDS="([\d ]+)"$/m.exec(
      tokenFirewallScript
    );
    const configuredUids = controlledUidsMatch
      ? controlledUidsMatch[1].split(" ").map(Number)
      : [];
    const tokenFirewallUids = tokenFirewallUidsMatch
      ? tokenFirewallUidsMatch[1].split(" ").map(Number)
      : [];

    expect(configuredUids).toEqual([...SANDBOX_EGRESS_CONTROLLED_UIDS]);
    expect(tokenFirewallUids).toEqual([...SANDBOX_EGRESS_CONTROLLED_UIDS]);
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

    expect(tmpfilesConfig).toBe(
      "d /run/dust 0755 root root -\nd /run/dust-gcs 0700 root root -\n"
    );
    expect(installer).toContain(
      '/usr/bin/openssl x509 -in "$CA_PATH" -out "$normalized_ca_tmp" -outform PEM'
    );
    expect(installer).toContain(
      '/usr/bin/install -d -o root -g root -m 755 "$SYSTEM_CA_DIR"'
    );
    expect(installer).toContain(
      '/usr/bin/find "$SYSTEM_CA_DIR" -mindepth 1 -maxdepth 1 -exec /bin/rm -rf'
    );
    expect(installer).toContain('/bin/rm -f "$SYSTEM_CA_DEST"');
    expect(installer).toContain(
      '/usr/bin/install -o root -g root -m 644 "$normalized_ca_tmp" "$SYSTEM_CA_DEST"'
    );
    expect(installer).not.toContain("/usr/sbin/update-ca-certificates");
    expect(installer).toContain(
      'PRISTINE_SYSTEM_BUNDLE="/etc/dust/system-ca-certificates.crt.orig"'
    );
    expect(installer).toContain(
      'system_tmp="$(/usr/bin/mktemp "${SYSTEM_CA_CERTS_DIR}/.ca-certificates.crt.XXXXXX")"'
    );
    expect(installer).toContain('/bin/cat "$PRISTINE_SYSTEM_BUNDLE"');
    expect(installer).toContain('/bin/cat "$normalized_ca_tmp"');
    expect(installer).toContain(
      '/usr/bin/openssl x509 -hash -noout -in "$normalized_ca_tmp"'
    );
    expect(installer).toContain(
      '/usr/bin/readlink -f "${SYSTEM_CA_CERTS_DIR}/${ca_hash}.${slot}"'
    );
    expect(installer).toContain(
      '/bin/ln -sf "$SYSTEM_CA_DEST" "${SYSTEM_CA_CERTS_DIR}/${ca_hash}.${slot}"'
    );
    expect(installer).toContain("/etc/ssl/certs/java/cacerts");
    expect(installer).toContain("if [ -x /usr/bin/keytool ]; then");
    expect(installer).toContain(
      "/usr/bin/keytool -importcert -noprompt -trustcacerts"
    );
    expect(installer).toContain("already exists");
  });

  test("trust helper drops staged symlinks and normalizes the installed CA", () => {
    const copyOperations = getCopyOperations(getDustBaseImageOperations());
    const installer = getCopiedContent(
      copyOperations,
      "/usr/local/bin/dust-install-trust-bundle"
    );
    const sandboxRoot = mkdtempSync(join(tmpdir(), "dust-trust-helper-"));
    const runDustDir = join(sandboxRoot, "run", "dust");
    const etcDustDir = join(sandboxRoot, "etc", "dust");
    const systemSslCertsDir = join(sandboxRoot, "etc", "ssl", "certs");
    const javaCertsDir = join(systemSslCertsDir, "java");
    const stubBinDir = join(sandboxRoot, "bin");
    const systemCaDir = join(
      sandboxRoot,
      "usr",
      "local",
      "share",
      "ca-certificates"
    );
    const systemCaBundle = join(systemSslCertsDir, "ca-certificates.crt");
    const pristineSystemCaBundle = join(
      etcDustDir,
      "system-ca-certificates.crt.orig"
    );
    const mergedBundle = join(etcDustDir, "ca-bundle.pem");
    const caPath = join(runDustDir, "egress-ca.pem");
    const keyPath = join(runDustDir, "egress-ca.key");
    const leakedSecretPath = join(runDustDir, "egress-secrets.json");
    const commandPaths = {
      cat: getCommandPath("cat"),
      chmod: getCommandPath("chmod"),
      chown: getCommandPath("chown"),
      find: getCommandPath("find"),
      install: getCommandPath("install"),
      ln: getCommandPath("ln"),
      mkdir: getCommandPath("mkdir"),
      mktemp: getCommandPath("mktemp"),
      mv: getCommandPath("mv"),
      openssl: getCommandPath("openssl"),
      readlink: join(stubBinDir, "readlink"),
      rm: getCommandPath("rm"),
    };

    try {
      mkdirSync(runDustDir, { recursive: true });
      mkdirSync(stubBinDir, { recursive: true });
      mkdirSync(systemCaDir, { recursive: true });
      mkdirSync(systemSslCertsDir, { recursive: true });
      chmodSync(systemCaDir, 0o777);
      writeFileSync(systemCaBundle, "system-root\n");
      writeFileSync(
        commandPaths.readlink,
        "#!/bin/sh\n" +
          'if [ "$1" = "-f" ]; then\n' +
          "  shift\n" +
          "fi\n" +
          '/usr/bin/readlink "$1"\n'
      );
      chmodSync(commandPaths.readlink, 0o755);
      writeFileSync(leakedSecretPath, "DSEC_SECRET=should-not-leak\n");
      symlinkSync(leakedSecretPath, join(systemCaDir, "secrets.crt"));
      writeFileSync(
        join(systemCaDir, "garbage.crt"),
        "not a cert\nDSEC_GARBAGE=should-not-leak\n"
      );

      const opensslResult = spawnSync(
        commandPaths.openssl,
        [
          "req",
          "-x509",
          "-newkey",
          "rsa:2048",
          "-nodes",
          "-keyout",
          keyPath,
          "-out",
          caPath,
          "-subj",
          "/CN=dust-test",
          "-days",
          "1",
        ],
        { encoding: "utf8" }
      );
      expect(opensslResult.status).toBe(0);
      writeFileSync(caPath, "\nDSEC_APPENDED=should-not-leak\n", {
        flag: "a",
      });

      const rewrittenInstaller = installer
        .replace('CA_PATH="/run/dust/egress-ca.pem"', `CA_PATH="${caPath}"`)
        .replace(
          'SYSTEM_CA_DIR="/usr/local/share/ca-certificates"',
          `SYSTEM_CA_DIR="${systemCaDir}"`
        )
        .replace(
          'SYSTEM_CA_CERTS_DIR="/etc/ssl/certs"',
          `SYSTEM_CA_CERTS_DIR="${systemSslCertsDir}"`
        )
        .replaceAll("/etc/dust", etcDustDir)
        .replaceAll("/etc/ssl/certs/java", javaCertsDir)
        .replaceAll(
          "/usr/bin/install -d -o root -g root -m 755",
          "/usr/bin/install -d -m 755"
        )
        .replaceAll(
          "/usr/bin/install -o root -g root -m 644",
          "/usr/bin/install -m 644"
        )
        .replace('/usr/bin/chown root:root "$SYSTEM_CA_DIR"', ":")
        .replace("if [ -x /usr/bin/keytool ]; then", "if false; then")
        .replaceAll("/bin/cat", commandPaths.cat)
        .replaceAll("/usr/bin/chmod", commandPaths.chmod)
        .replaceAll("/usr/bin/chown", commandPaths.chown)
        .replaceAll("/usr/bin/find", commandPaths.find)
        .replaceAll("/usr/bin/install", commandPaths.install)
        .replaceAll("/bin/ln", commandPaths.ln)
        .replaceAll("/usr/bin/mkdir", commandPaths.mkdir)
        .replaceAll("/usr/bin/mktemp", commandPaths.mktemp)
        .replaceAll("/usr/bin/mv", commandPaths.mv)
        .replaceAll("/usr/bin/openssl", commandPaths.openssl)
        .replaceAll("/usr/bin/readlink", commandPaths.readlink)
        .replaceAll("/bin/rm", commandPaths.rm);
      const scriptPath = join(sandboxRoot, "install-trust-bundle.sh");
      writeFileSync(scriptPath, rewrittenInstaller);

      const runInstaller = () =>
        spawnSync("bash", [scriptPath], {
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${stubBinDir}:${process.env.PATH ?? ""}`,
          },
        });

      const runResult = runInstaller();

      if (runResult.status !== 0) {
        throw new Error(
          `trust helper failed:\nstdout:\n${runResult.stdout}\nstderr:\n${runResult.stderr}`
        );
      }

      const hashResult = spawnSync(
        commandPaths.openssl,
        [
          "x509",
          "-hash",
          "-noout",
          "-in",
          join(systemCaDir, "dust-egress.crt"),
        ],
        { encoding: "utf8" }
      );
      expect(hashResult.status).toBe(0);
      const hashSymlink = join(
        systemSslCertsDir,
        `${hashResult.stdout.trim()}.0`
      );
      const mergedBundleContent = readFileSync(mergedBundle, "utf8");
      const systemCaBundleContent = readFileSync(systemCaBundle, "utf8");
      const installedCaContent = readFileSync(
        join(systemCaDir, "dust-egress.crt"),
        "utf8"
      );
      const hashSymlinkTarget = readlinkSync(hashSymlink);

      expect(readdirSync(systemCaDir)).toEqual(["dust-egress.crt"]);
      expect(readFileSync(pristineSystemCaBundle, "utf8")).toBe(
        "system-root\n"
      );
      expect(systemCaBundleContent).toBe(mergedBundleContent);
      expect(systemCaBundleContent).toContain("system-root");
      expect(systemCaBundleContent).toContain("BEGIN CERTIFICATE");
      expect(systemCaBundleContent).not.toContain("DSEC_SECRET");
      expect(systemCaBundleContent).not.toContain("DSEC_GARBAGE");
      expect(systemCaBundleContent).not.toContain("DSEC_APPENDED");
      expect(mergedBundleContent).not.toContain("DSEC_SECRET");
      expect(mergedBundleContent).not.toContain("DSEC_GARBAGE");
      expect(mergedBundleContent).not.toContain("DSEC_APPENDED");
      expect(installedCaContent).not.toContain("DSEC_APPENDED");
      expect(realpathSync(hashSymlink)).toBe(
        realpathSync(join(systemCaDir, "dust-egress.crt"))
      );

      const secondRunResult = runInstaller();

      if (secondRunResult.status !== 0) {
        throw new Error(
          `trust helper failed on second run:\nstdout:\n${secondRunResult.stdout}\nstderr:\n${secondRunResult.stderr}`
        );
      }

      expect(readFileSync(systemCaBundle, "utf8")).toBe(systemCaBundleContent);
      expect(readFileSync(mergedBundle, "utf8")).toBe(mergedBundleContent);
      expect(readFileSync(join(systemCaDir, "dust-egress.crt"), "utf8")).toBe(
        installedCaContent
      );
      expect(readlinkSync(hashSymlink)).toBe(hashSymlinkTarget);
      expect(readdirSync(systemCaDir)).toEqual(["dust-egress.crt"]);
    } finally {
      rmSync(sandboxRoot, { recursive: true, force: true });
    }
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
