import config from "@app/lib/api/config";
import { SANDBOX_ROOT_SAFE_PATH } from "@app/lib/api/sandbox/hardening";
import {
  formatSandboxImageId,
  getRegisteredImages,
  getSandboxImageFromRegistry,
  type SandboxImage,
} from "@app/lib/api/sandbox/image";
import type { ExecResult } from "@app/lib/api/sandbox/provider";
import { E2BSandboxProvider } from "@app/lib/api/sandbox/providers/e2b";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { isString } from "@app/types/shared/utils/general";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

const TRACE_OPTS = { workspaceId: "sandbox-image-security-check" };
const AGENT_PROXIED_USER = "agent-proxied";
const COMMAND_TIMEOUT_MS = 15_000;
const ROOT_ID_PATTERN = /\buid=0\(root\)\b/;
const UNRESTRICTED_SUDO_PATTERN =
  /\([^)]*ALL[^)]*\)\s*NOPASSWD:\s*ALL|NOPASSWD:\s*ALL/;
const PRIVILEGED_GROUP_PATTERN = /\b\d+\((sudo|wheel|admin)\)/;
const ROOT_PATH_PREFIXES = ["ROOT_EXEC_PATH=", "ROOT_LOGIN_PATH="] as const;
const LOCAL_AUTH_HELPER_PATHS = [
  "/bin/su",
  "/usr/bin/su",
  "/bin/sg",
  "/usr/bin/sg",
  "/usr/bin/newgrp",
  "/usr/bin/passwd",
  "/usr/bin/chsh",
  "/usr/bin/chfn",
  "/usr/bin/gpasswd",
] as const;

interface CheckArgs {
  image?: string;
  tag?: string;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function combinedOutput(result: ExecResult): string {
  return [result.stdout, result.stderr].filter((s) => s.length > 0).join("\n");
}

export function buildBashCommand(script: string): string {
  return `/bin/bash -c ${shellQuote(script)}`;
}

async function runCommand(
  provider: E2BSandboxProvider,
  providerId: string,
  command: string,
  options: { user: string; timeoutMs?: number }
): Promise<ExecResult> {
  const result = await provider.exec(
    providerId,
    command,
    {
      timeoutMs: options.timeoutMs ?? COMMAND_TIMEOUT_MS,
      user: options.user,
    },
    TRACE_OPTS
  );
  if (result.isErr()) {
    throw result.error;
  }
  return result.value;
}

async function runBashScript(
  provider: E2BSandboxProvider,
  providerId: string,
  script: string,
  options: { user: string; timeoutMs?: number }
): Promise<ExecResult> {
  return runCommand(provider, providerId, buildBashCommand(script), {
    timeoutMs: options.timeoutMs,
    user: options.user,
  });
}

function assertNoRootIdentity(label: string, result: ExecResult): void {
  const output = combinedOutput(result);
  if (ROOT_ID_PATTERN.test(output)) {
    throw new Error(`${label} yielded root identity:\n${output}`);
  }
}

function assertCommandSucceeded(label: string, result: ExecResult): void {
  if (result.exitCode !== 0) {
    throw new Error(`${label} failed:\n${combinedOutput(result)}`);
  }
}

export function containsUnrestrictedSudo(output: string): boolean {
  return output
    .split("\n")
    .map((line) => {
      const firstColon = line.indexOf(":");
      const secondColon =
        firstColon >= 0 ? line.indexOf(":", firstColon + 1) : -1;
      return line.startsWith("/etc/") && secondColon >= 0
        ? line.slice(secondColon + 1).trim()
        : line.trim();
    })
    .filter((line) => !line.startsWith("#"))
    .some((line) => UNRESTRICTED_SUDO_PATTERN.test(line));
}

async function checkOriginalExploitPath(
  provider: E2BSandboxProvider,
  providerId: string
): Promise<void> {
  const identity = await runCommand(provider, providerId, "id", {
    user: AGENT_PROXIED_USER,
  });
  assertCommandSucceeded("workload identity check", identity);
  if (ROOT_ID_PATTERN.test(combinedOutput(identity))) {
    throw new Error(
      `workload user unexpectedly runs as root:\n${combinedOutput(identity)}`
    );
  }

  const escalation = await runCommand(
    provider,
    providerId,
    "timeout 5s su -s /bin/bash user -c 'sudo -n /usr/bin/id' < /dev/null",
    { user: AGENT_PROXIED_USER }
  );
  assertNoRootIdentity("original user/sudo escalation", escalation);

  const marker = `root-proof-regression-test-${Date.now()}`;
  const rootWriteScript = [
    "umask 077",
    `printf %s ${shellQuote(marker)} > /root/${marker}`,
    "/usr/bin/id",
    `/usr/bin/stat -c ${shellQuote("%n %U:%G %a")} /root/${marker}`,
    `/bin/rm -f /root/${marker}`,
  ].join("; ");
  const markerProof = await runCommand(
    provider,
    providerId,
    `timeout 5s su -s /bin/bash user -c ${shellQuote(
      `sudo -n /bin/sh -c ${shellQuote(rootWriteScript)}`
    )} < /dev/null`,
    { user: AGENT_PROXIED_USER }
  );
  const markerOutput = combinedOutput(markerProof);
  if (
    markerProof.exitCode === 0 ||
    ROOT_ID_PATTERN.test(markerOutput) ||
    markerOutput.includes(marker)
  ) {
    throw new Error(
      `root marker proof unexpectedly succeeded or leaked root output:\n${markerOutput}`
    );
  }
}

async function checkPamEscalationPaths(
  provider: E2BSandboxProvider,
  providerId: string
): Promise<void> {
  const probes = [
    {
      label: "su login root",
      command: "timeout 5s su - root -c '/usr/bin/id' < /dev/null",
    },
    {
      label: "su root",
      command: "timeout 5s su root -c '/usr/bin/id' < /dev/null",
    },
    {
      label: "su shell root",
      command: "timeout 5s su -s /bin/bash root -c '/usr/bin/id' < /dev/null",
    },
    {
      label: "runuser root",
      command: "timeout 5s runuser -u root -- /usr/bin/id < /dev/null",
    },
    {
      label: "sg sudo",
      command: "timeout 5s sg sudo -c /usr/bin/id < /dev/null",
    },
    {
      label: "newgrp sudo",
      command: "timeout 5s newgrp sudo < /dev/null",
    },
    {
      label: "chsh root",
      command:
        "current_shell=$(getent passwd root | awk -F: '{print $7}'); timeout 5s chsh -s \"$current_shell\" root < /dev/null",
    },
  ] as const;

  for (const probe of probes) {
    const result = await runCommand(provider, providerId, probe.command, {
      user: AGENT_PROXIED_USER,
    });
    const output = combinedOutput(result);
    if (result.exitCode === 0 || ROOT_ID_PATTERN.test(output)) {
      throw new Error(
        `${probe.label} unexpectedly succeeded or yielded root identity:\n${output}`
      );
    }
  }
}

async function checkBasicSandboxFunctionality(
  provider: E2BSandboxProvider,
  providerId: string
): Promise<void> {
  const smoke = await runBashScript(
    provider,
    providerId,
    `
set -euo pipefail
echo "shell-ok"
/opt/bin/dsbx version >/dev/null
for dir in /files/conversation /files/project; do
  test -d "$dir"
  proof="$dir/dust-security-smoke-$$"
  printf 'file-ok' > "$proof"
  test "$(cat "$proof")" = "file-ok"
  rm -f "$proof"
done
`,
    { user: AGENT_PROXIED_USER }
  );

  assertCommandSucceeded("basic shell and file operations", smoke);
}

async function checkTargetUserState(
  provider: E2BSandboxProvider,
  providerId: string
): Promise<void> {
  const audit = await runBashScript(
    provider,
    providerId,
    `
set -euo pipefail
if getent passwd user >/dev/null; then
  echo "USER_EXISTS=1"
  id user
  passwd -S user || true
  for group in sudo wheel admin; do
    getent group "$group" || true
  done
  if command -v sudo >/dev/null 2>&1; then
    sudo -n -l -U user || true
  else
    echo "SUDO_ABSENT=1"
  fi
else
  echo "USER_EXISTS=0"
fi
`,
    { user: "root" }
  );
  const output = combinedOutput(audit);

  const userIdLine = output.split("\n").find((line) => line.startsWith("uid="));
  if (userIdLine && PRIVILEGED_GROUP_PATTERN.test(userIdLine)) {
    throw new Error(
      `local user still belongs to a privileged group:\n${output}`
    );
  }

  const passwordStatus = /^user\s+(\S+)/m.exec(output);
  if (
    passwordStatus &&
    (passwordStatus[1] === "P" || passwordStatus[1] === "NP")
  ) {
    throw new Error(`local user account is not locked:\n${output}`);
  }

  if (containsUnrestrictedSudo(output)) {
    throw new Error(`local user still has unrestricted sudo:\n${output}`);
  }
}

async function checkEquivalentAccountEscalation(
  provider: E2BSandboxProvider,
  providerId: string
): Promise<void> {
  const audit = await runBashScript(
    provider,
    providerId,
    `
set -euo pipefail
bad=0
while IFS=: read -r name _uid _gid _gecos _home _shell; do
  if [ "$name" = "${AGENT_PROXIED_USER}" ]; then
    continue
  fi

  out="$(mktemp)"
  if timeout 3s su -s /bin/sh "$name" -c '/usr/bin/id' < /dev/null > "$out" 2>&1; then
    if grep -q 'uid=0(root)' "$out"; then
      echo "CRITICAL: ${AGENT_PROXIED_USER} can enter $name as root"
      cat "$out"
      bad=1
    fi
    if timeout 3s su -s /bin/sh "$name" -c 'if command -v sudo >/dev/null 2>&1; then sudo -n /usr/bin/id; fi' < /dev/null > "$out" 2>&1; then
      if grep -q 'uid=0(root)' "$out"; then
        echo "CRITICAL: ${AGENT_PROXIED_USER} can reach root through $name"
        cat "$out"
        bad=1
      fi
    fi
  fi
  rm -f "$out"
done < <(getent passwd | awk -F: '$3 == 0 || $3 >= 1000')
exit "$bad"
`,
    { timeoutMs: 60_000, user: AGENT_PROXIED_USER }
  );

  if (audit.exitCode !== 0 || ROOT_ID_PATTERN.test(combinedOutput(audit))) {
    throw new Error(
      `equivalent account-based escalation audit failed:\n${combinedOutput(audit)}`
    );
  }
}

export function assertNoPrivilegedGroupMembers(output: string): void {
  const privilegedGroupIds = new Map<string, string>();
  const groupPattern = /^(sudo|wheel|admin):[^:]*:([^:]*):(.*)$/gm;
  let match = groupPattern.exec(output);

  while (match) {
    privilegedGroupIds.set(match[2], match[1]);

    const members = match[3]
      .split(",")
      .map((member) => member.trim())
      .filter((member) => member.length > 0 && member !== "root");

    if (members.length > 0) {
      throw new Error(
        `privileged group ${match[1]} still has non-root members (${members.join(
          ", "
        )}):\n${output}`
      );
    }

    match = groupPattern.exec(output);
  }

  for (const line of output.split("\n")) {
    const fields = line.split(":");
    if (fields.length < 4) {
      continue;
    }

    const [name, , uid, gid] = fields;
    if (name === "root" || uid === "0") {
      continue;
    }

    const privilegedGroup = privilegedGroupIds.get(gid);
    if (privilegedGroup) {
      throw new Error(
        `privileged group ${privilegedGroup} is the primary group for non-root account ${name}:\n${output}`
      );
    }
  }
}

export function assertNoPasswordlessSudoers(output: string): void {
  const passwordlessSudoers = output
    .split("\n")
    .filter((line) => line.includes("/etc/sudoers"))
    .filter((line) => {
      const firstColon = line.indexOf(":");
      const secondColon =
        firstColon >= 0 ? line.indexOf(":", firstColon + 1) : -1;
      const content =
        secondColon >= 0 ? line.slice(secondColon + 1).trim() : line.trim();
      return (
        !content.startsWith("#") && UNRESTRICTED_SUDO_PATTERN.test(content)
      );
    });

  if (passwordlessSudoers.length > 0) {
    throw new Error(
      `passwordless unrestricted sudoers entries remain:\n${passwordlessSudoers.join(
        "\n"
      )}`
    );
  }
}

export function assertSudoAbsent(output: string): void {
  if (output.split("\n").some((line) => line.startsWith("SUDO_BINARY="))) {
    throw new Error(`sudo binary is still installed:\n${output}`);
  }
}

export function assertNoEmptyPasswordAccounts(output: string): void {
  const emptyPasswordAccounts = output
    .split("\n")
    .filter((line) => line.startsWith("EMPTY_PASSWORD_ACCOUNT="));

  if (emptyPasswordAccounts.length > 0) {
    throw new Error(
      `local accounts with empty passwords remain:\n${emptyPasswordAccounts.join(
        "\n"
      )}`
    );
  }
}

export function assertLocalAuthHelpersNotSetuid(output: string): void {
  const setuidHelpers = output
    .split("\n")
    .filter((line) => line.startsWith("LOCAL_AUTH_HELPER="))
    .filter((line) => {
      const fields = line.replace("LOCAL_AUTH_HELPER=", "").split(/\s+/);
      const mode = Number.parseInt(fields[1], 8);
      return !Number.isNaN(mode) && (mode & 0o4000) !== 0;
    });

  if (setuidHelpers.length > 0) {
    throw new Error(
      `local auth helpers are still setuid:\n${setuidHelpers.join("\n")}`
    );
  }
}

export function assertPrivilegedDirsSafe(output: string): void {
  for (const dir of [
    "/opt/bin",
    "/usr/local",
    "/usr/local/sbin",
    "/usr/local/bin",
  ]) {
    const line = output
      .split("\n")
      .find((candidate) => candidate.startsWith(`${dir} `));
    if (!line) {
      throw new Error(
        `missing privileged directory audit for ${dir}:\n${output}`
      );
    }

    const fields = line.split(/\s+/);
    const owner = fields[1];
    const modeText = fields[2];
    const mode = Number.parseInt(modeText, 8);

    if (owner !== "root:root" || Number.isNaN(mode) || (mode & 0o022) !== 0) {
      throw new Error(
        `privileged directory ${dir} is not root-owned and non-writable by group/other:\n${line}`
      );
    }
  }
}

export function assertRootInvokedHelpersSafe(output: string): void {
  for (const path of [
    "/opt/bin/dsbx",
    "/usr/local/bin/dust-install-trust-bundle",
  ]) {
    const line = output
      .split("\n")
      .find((candidate) => candidate.startsWith(`${path} `));
    if (!line) {
      throw new Error(`missing root-invoked helper audit for ${path}`);
    }

    const fields = line.split(/\s+/);
    const owner = fields[1];
    const modeText = fields[2];
    const mode = Number.parseInt(modeText, 8);

    if (owner !== "root:root" || Number.isNaN(mode) || (mode & 0o022) !== 0) {
      throw new Error(
        `root-invoked helper is not root-owned and non-writable by group/other:\n${line}`
      );
    }
  }
}

export function assertRootPathSafe(output: string): void {
  const rootPathLines = output
    .split("\n")
    .filter((line) =>
      ROOT_PATH_PREFIXES.some((prefix) => line.startsWith(prefix))
    );

  if (rootPathLines.length !== ROOT_PATH_PREFIXES.length) {
    throw new Error(`missing root PATH audit lines:\n${output}`);
  }

  for (const line of rootPathLines) {
    const [, path] = line.split("=", 2);
    if (path !== SANDBOX_ROOT_SAFE_PATH) {
      throw new Error(
        `root PATH must only contain root-owned executable directories (${SANDBOX_ROOT_SAFE_PATH}):\n${line}`
      );
    }
  }
}

async function checkSystemAccountAudit(
  provider: E2BSandboxProvider,
  providerId: string
): Promise<void> {
  const audit = await runBashScript(
    provider,
    providerId,
    `
set -euo pipefail
echo "--- passwd ---"
getent passwd
echo "--- privileged-groups ---"
for group in sudo wheel admin; do
  getent group "$group" || true
done
echo "--- sudo-binary ---"
if command -v sudo >/dev/null 2>&1; then
  sudo_path="$(command -v sudo)"
  echo "SUDO_BINARY=$sudo_path"
  stat -c '%n %U:%G %a %A' "$sudo_path"
else
  echo "SUDO_ABSENT=1"
fi
echo "--- sudoers ---"
grep -RInE 'NOPASSWD|ALL.*ALL' /etc/sudoers /etc/sudoers.d 2>/dev/null || true
echo "--- empty-password-accounts ---"
getent shadow | awk -F: '$2 == "" {print "EMPTY_PASSWORD_ACCOUNT=" $1}'
echo "--- local-auth-setuid ---"
for path in ${LOCAL_AUTH_HELPER_PATHS.map((path) => shellQuote(path)).join(
      " "
    )}; do
  if [ -e "$path" ]; then
    stat -c 'LOCAL_AUTH_HELPER=%n %a %A %U:%G' "$path"
  fi
done
echo "--- privileged-dirs ---"
for dir in /opt/bin /usr/local /usr/local/sbin /usr/local/bin; do
  stat -c '%n %U:%G %a %A' "$dir"
done
echo "--- root-invoked-helpers ---"
for path in /opt/bin/dsbx /usr/local/bin/dust-install-trust-bundle; do
  if [ -e "$path" ]; then
    stat -c '%n %U:%G %a %A' "$path"
  fi
done
echo "--- root-path ---"
printf 'ROOT_EXEC_PATH=%s\n' "$PATH"
/bin/bash --noprofile --norc -c 'source /etc/profile; printf "ROOT_LOGIN_PATH=%s\n" "$PATH"'
`,
    { user: "root" }
  );
  const output = combinedOutput(audit);

  assertNoPrivilegedGroupMembers(output);
  assertSudoAbsent(output);
  assertNoPasswordlessSudoers(output);
  assertNoEmptyPasswordAccounts(output);
  assertLocalAuthHelpersNotSetuid(output);
  assertPrivilegedDirsSafe(output);
  assertRootInvokedHelpersSafe(output);
  assertRootPathSafe(output);
}

async function checkRootExecPathHijack(
  provider: E2BSandboxProvider,
  providerId: string
): Promise<void> {
  const marker = `root-exec-path-proof-${Date.now()}`;
  const secretPath = `/run/dust/${marker}.secret`;
  const leakDir = `/tmp/${marker}`;
  const plantedPath = "/opt/venv/bin/nohup";

  try {
    const seed = await runBashScript(
      provider,
      providerId,
      `
set -euo pipefail
/usr/bin/mkdir -p /run/dust
printf %s ${shellQuote(marker)} > ${shellQuote(secretPath)}
/usr/bin/chown root:root ${shellQuote(secretPath)}
/usr/bin/chmod 600 ${shellQuote(secretPath)}
/usr/bin/rm -rf ${shellQuote(leakDir)}
`,
      { user: "root" }
    );
    assertCommandSucceeded("root exec path hijack seed", seed);

    const plant = await runBashScript(
      provider,
      providerId,
      `
set -euo pipefail
/usr/bin/cat > ${shellQuote(plantedPath)} <<'DUST_HIJACK_EOF'
#!/bin/sh
/bin/mkdir -p ${leakDir}
/usr/bin/id > ${leakDir}/id
/bin/cat ${secretPath} > ${leakDir}/leaked 2>${leakDir}/cat.err || true
/bin/chmod -R a+rX ${leakDir}
exec /usr/bin/nohup "$@"
DUST_HIJACK_EOF
/usr/bin/chmod 755 ${shellQuote(plantedPath)}
`,
      { user: AGENT_PROXIED_USER }
    );
    assertCommandSucceeded("root exec path hijack plant", plant);

    const trigger = await runBashScript(
      provider,
      providerId,
      `
set -euo pipefail
/usr/bin/rm -rf ${shellQuote(leakDir)}
nohup /bin/true >/tmp/dust-root-path-hijack-nohup.log 2>&1 &
/usr/bin/sleep 1
if [ -f ${shellQuote(`${leakDir}/leaked`)} ]; then
  echo "CRITICAL: root command resolved agent-writable ${plantedPath}"
  cat ${shellQuote(`${leakDir}/id`)} || true
  exit 1
fi
command -v nohup
`,
      { user: "root" }
    );
    assertCommandSucceeded("root exec path hijack trigger", trigger);
    if (combinedOutput(trigger).trim() !== "/usr/bin/nohup") {
      throw new Error(
        `root nohup did not resolve to /usr/bin/nohup:\n${combinedOutput(
          trigger
        )}`
      );
    }

    const readback = await runBashScript(
      provider,
      providerId,
      `
set -euo pipefail
if [ -f ${shellQuote(`${leakDir}/leaked`)} ]; then
  echo "CRITICAL: agent can read leaked root file"
  cat ${shellQuote(`${leakDir}/leaked`)}
  exit 1
fi
`,
      { user: AGENT_PROXIED_USER }
    );
    assertCommandSucceeded("root exec path hijack readback", readback);
  } finally {
    try {
      await runBashScript(
        provider,
        providerId,
        `
/usr/bin/rm -f ${shellQuote(plantedPath)} ${shellQuote(secretPath)}
/usr/bin/rm -rf ${shellQuote(leakDir)}
`,
        { user: "root" }
      );
    } catch (error) {
      logger.warn(
        { err: normalizeError(error), providerId },
        "Failed to clean up root exec path hijack regression probe"
      );
    }
  }
}

function assertSshAndDnsHardening(output: string): void {
  if (!output.includes("SSH_PORT_22_LISTENING=0")) {
    throw new Error(`sshd appears to be listening on port 22:\n${output}`);
  }

  for (const expected of [
    "PermitRootLogin no",
    "PasswordAuthentication no",
    "UsePAM no",
    "AllowUsers agent",
    "DenyUsers root agent-proxied",
  ]) {
    if (!output.includes(expected)) {
      throw new Error(
        `missing SSH hardening directive "${expected}":\n${output}`
      );
    }
  }

  for (const expected of [
    "DNS_RESOLVER_ACTIVE=1",
    "DNS_NFTABLES_ACTIVE=1",
    "udp dport 53 redirect",
    "tcp dport 53 redirect",
    "tcp dport 22 drop",
    "meta l4proto",
  ]) {
    if (!output.includes(expected)) {
      throw new Error(
        `missing DNS/egress hardening evidence "${expected}":\n${output}`
      );
    }
  }
}

async function checkSshAndDnsHardening(
  provider: E2BSandboxProvider,
  providerId: string
): Promise<void> {
  const audit = await runBashScript(
    provider,
    providerId,
    `
set -euo pipefail
if /usr/bin/awk '$2 ~ /:0016$/ && $4 == "0A" { found=1 } END { exit found ? 0 : 1 }' /proc/net/tcp /proc/net/tcp6; then
  echo "SSH_PORT_22_LISTENING=1"
else
  echo "SSH_PORT_22_LISTENING=0"
fi
echo "--- sshd-hardening ---"
/usr/bin/cat /etc/ssh/sshd_config.d/00-dust-sandbox-hardening.conf
echo "--- dns-systemd ---"
if /usr/bin/systemctl is-active --quiet dust-egress-resolver.service; then
  echo "DNS_RESOLVER_ACTIVE=1"
else
  /usr/bin/systemctl status dust-egress-resolver.service --no-pager || true
  echo "DNS_RESOLVER_ACTIVE=0"
fi
if /usr/bin/systemctl is-active --quiet dust-egress-nftables.service; then
  echo "DNS_NFTABLES_ACTIVE=1"
else
  /usr/bin/systemctl status dust-egress-nftables.service --no-pager || true
  echo "DNS_NFTABLES_ACTIVE=0"
fi
echo "--- nft-ip ---"
/usr/sbin/nft -n list table ip dust-egress
echo "--- nft-ip6 ---"
/usr/sbin/nft -n list table ip6 dust-egress
`,
    { user: "root" }
  );

  assertCommandSucceeded("SSH and DNS hardening audit", audit);
  assertSshAndDnsHardening(combinedOutput(audit));
}

async function checkImage(image: SandboxImage): Promise<void> {
  if (!image.imageId) {
    throw new Error(
      "Cannot run security check for unregistered sandbox image."
    );
  }

  const imageId = formatSandboxImageId(image.imageId);
  const provider = new E2BSandboxProvider(config.getE2BSandboxConfig());
  let providerId: string | undefined;

  logger.info({ imageId }, "Creating sandbox for security regression check");

  try {
    const createResult = await provider.create(
      image.toCreateConfig(),
      TRACE_OPTS
    );
    if (createResult.isErr()) {
      throw createResult.error;
    }
    providerId = createResult.value.providerId;

    await checkOriginalExploitPath(provider, providerId);
    await checkPamEscalationPaths(provider, providerId);
    await checkBasicSandboxFunctionality(provider, providerId);
    await checkTargetUserState(provider, providerId);
    await checkEquivalentAccountEscalation(provider, providerId);
    await checkSystemAccountAudit(provider, providerId);
    await checkSshAndDnsHardening(provider, providerId);
    await checkRootExecPathHijack(provider, providerId);

    logger.info(
      { imageId, providerId },
      "Sandbox security regression check passed"
    );
  } finally {
    if (providerId) {
      const destroyResult = await provider.destroy(providerId, TRACE_OPTS);
      if (destroyResult.isErr()) {
        logger.error(
          { err: destroyResult.error, imageId, providerId },
          "Failed to destroy sandbox after security regression check"
        );
      }
    }
  }
}

async function parseCheckArgs(): Promise<CheckArgs> {
  const argv = await yargs(hideBin(process.argv))
    .option("image", {
      type: "string",
      describe: "Image name to check. Defaults to all registered images.",
    })
    .option("tag", {
      type: "string",
      describe: "Image tag to check. Requires --image.",
    })
    .strict()
    .help("h")
    .alias("h", "help")
    .parseAsync();

  const image = isString(argv.image) ? argv.image : undefined;
  const tag = isString(argv.tag) ? argv.tag : undefined;

  if (tag && !image) {
    throw new Error("--tag requires --image");
  }

  return { image, tag };
}

function getImagesToCheck(args: CheckArgs): readonly SandboxImage[] {
  if (args.image) {
    const result = getSandboxImageFromRegistry({
      name: args.image,
      tag: args.tag,
    });
    if (result.isErr()) {
      throw result.error;
    }
    return [result.value];
  }

  return getRegisteredImages();
}

export async function main(): Promise<void> {
  const args = await parseCheckArgs();
  const images = getImagesToCheck(args);

  for (const image of images) {
    await checkImage(image);
  }
}

if (process.argv[1]?.endsWith("sandbox_security_check.ts")) {
  main()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      logger.error(
        { err: normalizeError(err) },
        "Sandbox security regression check failed"
      );
      process.exit(1);
    });
}
