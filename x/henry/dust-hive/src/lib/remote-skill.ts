// Generate Claude skill file for remote environments

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RemoteHost } from "./remote-host";
import { getRemoteMountPoint } from "./remote-sshfs";

/**
 * Generate the Claude skill markdown content for a remote environment
 */
export function generateRemoteSkillContent(host: RemoteHost, envName: string): string {
  const localMountPoint = getRemoteMountPoint(host.name, envName);
  const remotePath = `/home/${host.remoteUser}/dust-hive/${envName}`;

  return `# Remote Environment: ${host.name}/${envName}

You are working in a **remote dust-hive environment**. Files are mounted via SSHFS from a GCP VM.

## Key Facts

- **Remote Host**: ${host.instance} (${host.project} / ${host.zone})
- **Files**: Mounted via SSHFS from the remote machine
- **git**: Commands are proxied to the remote automatically (via PATH override)
- **Services**: front, core, connectors, oauth run on the remote machine
- **Ports**: Forwarded via IAP tunnels to localhost

## Path Mapping

| Context | Path |
|---------|------|
| Local (your view) | ${localMountPoint}/... |
| Remote (actual) | ${remotePath}/... |

When showing file paths to the user, use local paths. When discussing remote operations, paths are auto-translated.

## Running Commands on the Remote

\`\`\`bash
# Run any command on the remote environment
dust-hive remote:exec ${host.name}/${envName} "npm test"
dust-hive remote:exec ${host.name}/${envName} "cargo build"

# Restart a service on the remote
dust-hive remote:exec ${host.name}/${envName} "dust-hive restart ${envName} front"

# SSH directly to the remote
dust-hive remote:ssh ${host.name}/${envName}
\`\`\`

## What Runs Where

| Operation | Where | How |
|-----------|-------|-----|
| File editing | Local | SSHFS mount provides transparent access |
| git commands | Remote | Automatically proxied via \`dust-hive remote:git\` |
| npm install | Remote | Use \`dust-hive remote:exec\` |
| cargo build | Remote | Use \`dust-hive remote:exec\` |
| Running tests | Remote | Use \`dust-hive remote:exec\` |
| Services | Remote | Managed by dust-hive on the remote |

## Important: Do NOT Run Locally

The following operations must be run on the remote, not locally:

- \`npm install\` - Dependencies are for the remote Linux environment
- \`cargo build\` - Compiles for the remote architecture
- \`npm test\` / \`bun test\` - Tests require the remote database and services
- Any command that modifies \`node_modules\` or \`target/\`

Use \`dust-hive remote:exec ${host.name}/${envName} "<command>"\` for these.

## Accessing Services

Services are forwarded to localhost via IAP tunnels:

| Service | URL |
|---------|-----|
| Front | http://localhost:10000 |
| Core | http://localhost:10001 |
| Connectors | http://localhost:10002 |
| OAuth | http://localhost:10006 |

(Port numbers may vary based on the environment's allocation on the remote)

## Troubleshooting

### Connection issues
\`\`\`bash
# Check if SSHFS mount is active
mount | grep ${localMountPoint}

# Check if IAP tunnels are running
dust-hive remote:status ${host.name}/${envName}

# Reconnect everything
dust-hive remote:close ${host.name}/${envName}
dust-hive remote:open ${host.name}/${envName}
\`\`\`

### Git issues
If git commands fail, they may be running locally instead of being proxied.
Ensure you're in the correct directory: \`${localMountPoint}\`
`;
}

/**
 * Get the path for the remote environment's Claude skill directory
 */
export function getRemoteSkillDir(remoteName: string, envName: string): string {
  return join(getRemoteMountPoint(remoteName, envName), ".claude", "skills", "remote-env");
}

/**
 * Write the Claude skill file for a remote environment
 * This writes to the SSHFS mount point so it's available when Claude Code runs there
 */
export async function writeRemoteSkill(host: RemoteHost, envName: string): Promise<void> {
  const skillDir = getRemoteSkillDir(host.name, envName);
  const skillPath = join(skillDir, "skill.md");

  await mkdir(skillDir, { recursive: true });

  const content = generateRemoteSkillContent(host, envName);
  await writeFile(skillPath, content);
}

/**
 * Generate the .envrc content for git proxying
 */
export function generateEnvrcContent(remoteName: string, envName: string): string {
  return `# dust-hive remote environment
# Auto-generated - do not edit

export DUST_HIVE_REMOTE="${remoteName}/${envName}"
export PATH="$HOME/.dust-hive/bin/remote-git:$PATH"

# Source the main env.sh for environment variables
# (These are for local tooling that needs to know about ports, etc.)
`;
}
