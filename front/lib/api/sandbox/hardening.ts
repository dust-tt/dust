import { shellEscape } from "@app/lib/api/sandbox/shell";

export const SANDBOX_ROOT_SAFE_PATH = "/usr/sbin:/usr/bin:/sbin:/bin:/opt/bin";
export const SANDBOX_ROOT_CONSUMED_DIRS = [
  "/opt/bin",
  "/usr/local",
  "/usr/local/sbin",
  "/usr/local/bin",
  "/usr/local/lib",
  "/usr/local/lib/systemd",
  "/usr/local/lib/systemd/system",
  "/usr/local/lib/systemd/system-generators",
  "/usr/local/lib/tmpfiles.d",
  "/usr/local/share",
  "/usr/local/share/dbus-1",
  "/usr/local/share/dbus-1/system-services",
  "/etc/dbus-1",
  "/etc/dbus-1/system.d",
  "/etc/environment.d",
  "/etc/ld.so.conf.d",
  "/etc/profile.d",
  "/etc/systemd",
  "/etc/systemd/system",
  "/etc/systemd/system-generators",
  "/etc/tmpfiles.d",
  "/run/environment.d",
  "/run/systemd",
  "/run/systemd/system",
  "/run/systemd/system-generators",
  "/run/tmpfiles.d",
  "/usr/lib/environment.d",
  "/usr/lib/systemd",
  "/usr/lib/systemd/system",
  "/usr/lib/systemd/system-generators",
  "/usr/lib/tmpfiles.d",
  "/usr/share/dbus-1",
  "/usr/share/dbus-1/system-services",
  "/lib/systemd",
  "/lib/systemd/system",
  "/lib/systemd/system-generators",
  "/lib/tmpfiles.d",
] as const;
export const SANDBOX_ROOT_INVOKED_HELPERS = [
  "/opt/bin/dsbx",
  "/usr/local/bin/dust-install-trust-bundle",
] as const;

const ROOT_SAFE_PATH_PROFILE = "/etc/profile.d/zz-dust-root-safe-path.sh";
const ROOT_CONSUMED_DIRS = SANDBOX_ROOT_CONSUMED_DIRS.join(" ");
const ROOT_INVOKED_HELPERS = SANDBOX_ROOT_INVOKED_HELPERS.join(" ");

export function getLocalAccountPrivilegeHardeningCommand(): string {
  const installRootSafePathProfile = [
    "/usr/bin/mkdir -p /etc/profile.d",
    [
      "printf '%s\\n'",
      shellEscape(
        "# Managed by Dust. Root must not resolve agent-writable paths."
      ),
      shellEscape('if [ "$(/usr/bin/id -u)" = "0" ]; then'),
      shellEscape(`  export PATH=${shellEscape(SANDBOX_ROOT_SAFE_PATH)}`),
      shellEscape("  export HOME=/root"),
      shellEscape("  export BASH_ENV=/dev/null"),
      shellEscape("  export ENV=/dev/null"),
      shellEscape("fi"),
      `> ${shellEscape(ROOT_SAFE_PATH_PROFILE)}`,
    ].join(" "),
    `/usr/bin/chmod 644 ${shellEscape(ROOT_SAFE_PATH_PROFILE)}`,
  ].join(" && ");
  const lockRootPassword = [
    "if getent passwd root >/dev/null 2>&1; then",
    "passwd -l root >/dev/null 2>&1 || usermod --lock root >/dev/null 2>&1 || true;",
    "fi",
  ].join(" ");
  const lockEmptyPasswordAccounts = [
    "if getent shadow >/dev/null 2>&1; then",
    `getent shadow | awk -F: '$2 == "" {print $1}' | while IFS= read -r account; do`,
    '[ -z "$account" ] && continue;',
    'passwd -l "$account" >/dev/null 2>&1 || usermod --lock "$account" >/dev/null 2>&1 || true;',
    "done;",
    "fi",
  ].join(" ");
  const lockProviderUser = [
    "if getent passwd user >/dev/null 2>&1; then",
    "usermod --lock --expiredate 1 --shell /usr/sbin/nologin user",
    "&& for group in sudo admin wheel; do",
    'if getent group "$group" >/dev/null 2>&1; then',
    'gpasswd -d user "$group" >/dev/null 2>&1 || true;',
    "fi;",
    "done;",
    "fi",
  ].join(" ");
  const removePrivilegedGroupMembers = [
    "for group in sudo admin wheel; do",
    "members=$(getent group \"$group\" | awk -F: '{print $4}') || continue;",
    'old_ifs="$IFS";',
    "IFS=,;",
    "for member in $members; do",
    '[ -z "$member" ] || [ "$member" = root ] || gpasswd -d "$member" "$group" >/dev/null 2>&1 || true;',
    "done;",
    'IFS="$old_ifs";',
    "done",
  ].join(" ");
  const removePasswordlessSudoersRules = [
    "if [ -f /etc/sudoers ]; then",
    "sed -i -E '/^[[:space:]]*#/!{/NOPASSWD[[:space:]]*:[[:space:]]*ALL/d;}' /etc/sudoers;",
    "fi",
    "&& if [ -d /etc/sudoers.d ]; then",
    "find /etc/sudoers.d -maxdepth 1 -type f",
    "-exec sed -i -E '/^[[:space:]]*#/!{/NOPASSWD[[:space:]]*:[[:space:]]*ALL/d;}' {} +;",
    "fi",
  ].join(" ");
  const removeSudoBinary = [
    "if command -v sudo >/dev/null 2>&1; then",
    "DEBIAN_FRONTEND=noninteractive apt-get purge -y sudo >/dev/null 2>&1",
    '|| { sudo_path=$(command -v sudo); chmod u-s "$sudo_path"; mv "$sudo_path" "$sudo_path.disabled-by-dust"; };',
    "hash -r 2>/dev/null || true;",
    "fi",
  ].join(" ");
  const hardenLocalAuthHelpers = [
    "for path in /bin/su /usr/bin/su /bin/sg /usr/bin/sg /usr/bin/newgrp /usr/bin/passwd /usr/bin/chsh /usr/bin/chfn /usr/bin/gpasswd; do",
    'if [ -e "$path" ]; then chmod u-s "$path"; fi;',
    "done",
  ].join(" ");
  const hardenRootConsumedDirs = [
    `/usr/bin/install -d -o root -g root -m 755 ${ROOT_CONSUMED_DIRS}`,
    `/usr/bin/chown root:root ${ROOT_CONSUMED_DIRS}`,
    `/usr/bin/chmod 755 ${ROOT_CONSUMED_DIRS}`,
  ].join(" && ");
  const hardenRootInvokedHelpers = [
    `for path in ${ROOT_INVOKED_HELPERS}; do`,
    'if [ -e "$path" ]; then /usr/bin/chown root:root "$path"; /usr/bin/chmod 755 "$path"; fi;',
    "done",
  ].join(" ");
  const assertNoEmptyPasswordAccounts = [
    `if getent shadow | awk -F: '$2 == "" {print $1}' | grep -q .; then`,
    "echo 'empty-password local accounts must not exist' >&2;",
    "exit 1;",
    "fi",
  ].join(" ");
  const assertNoPrivilegedGroupMembers = [
    "for group in sudo admin wheel; do",
    "members=$(getent group \"$group\" | awk -F: '{print $4}') || continue;",
    'old_ifs="$IFS";',
    "IFS=,;",
    "for member in $members; do",
    'if [ -n "$member" ] && [ "$member" != root ]; then echo "privileged group $group must not include $member" >&2; exit 1; fi;',
    "done;",
    'IFS="$old_ifs";',
    "done",
  ].join(" ");
  const assertNoPrivilegedPrimaryGroups = [
    "for group in sudo admin wheel; do",
    "gid=$(getent group \"$group\" | awk -F: '{print $3}') || continue;",
    '[ -z "$gid" ] && continue;',
    "primary_members=$(getent passwd | awk -F: -v gid=\"$gid\" '$3 != 0 && $4 == gid {print $1}');",
    'if [ -n "$primary_members" ]; then echo "privileged primary group $group must not include $primary_members" >&2; exit 1; fi;',
    "done",
  ].join(" ");
  const assertNoPasswordlessSudoers = [
    "if grep -RIsnE '^[[:space:]]*[^#].*NOPASSWD[[:space:]]*:[[:space:]]*ALL' /etc/sudoers /etc/sudoers.d 2>/dev/null | grep -q .; then",
    "echo 'passwordless unrestricted sudoers entries must not exist' >&2;",
    "exit 1;",
    "fi",
  ].join(" ");
  const assertLocalAuthHelpersNotSetuid = [
    "for path in /bin/su /usr/bin/su /bin/sg /usr/bin/sg /usr/bin/newgrp /usr/bin/passwd /usr/bin/chsh /usr/bin/chfn /usr/bin/gpasswd; do",
    'if [ -e "$path" ] && [ -u "$path" ]; then echo "local auth helper must not be setuid: $path" >&2; exit 1; fi;',
    "done",
  ].join(" ");
  const assertRootConsumedDirsSafe = [
    `for dir in ${ROOT_CONSUMED_DIRS}; do`,
    'if [ "$(stat -c \'%U:%G\' "$dir")" != root:root ] || find "$dir" -maxdepth 0 -perm /022 | grep -q .; then',
    'echo "root-consumed directory must be root-owned and not group/other writable: $dir" >&2;',
    "exit 1;",
    "fi;",
    "done",
  ].join(" ");
  const assertRootInvokedHelpersSafe = [
    `for path in ${ROOT_INVOKED_HELPERS}; do`,
    '[ -e "$path" ] || continue;',
    'if [ "$(stat -c \'%U:%G\' "$path")" != root:root ] || find "$path" -maxdepth 0 -perm /022 | grep -q .; then',
    'echo "root-invoked helper must be root-owned and not group/other writable: $path" >&2;',
    "exit 1;",
    "fi;",
    "done",
  ].join(" ");

  return [
    installRootSafePathProfile,
    lockRootPassword,
    lockEmptyPasswordAccounts,
    lockProviderUser,
    removePrivilegedGroupMembers,
    removePasswordlessSudoersRules,
    removeSudoBinary,
    hardenLocalAuthHelpers,
    hardenRootConsumedDirs,
    hardenRootInvokedHelpers,
    assertNoEmptyPasswordAccounts,
    assertNoPrivilegedGroupMembers,
    assertNoPrivilegedPrimaryGroups,
    assertNoPasswordlessSudoers,
    assertLocalAuthHelpersNotSetuid,
    assertRootConsumedDirsSafe,
    assertRootInvokedHelpersSafe,
    "if command -v sudo >/dev/null 2>&1; then echo 'sudo must not be installed in sandbox images' >&2; exit 1; fi",
  ].join(" && ");
}
