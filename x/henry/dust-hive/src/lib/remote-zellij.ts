// Zellij layout generation for remote environments

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DUST_HIVE_ZELLIJ } from "./paths";
import type { RemoteHost } from "./remote-host";
import { getRemoteMountPoint } from "./remote-sshfs";

/**
 * Generate a zellij layout for a remote environment
 * - Log panes SSH to remote and tail logs
 * - Shell pane starts in the SSHFS mount directory
 * - Extra "Remote Shell" pane for direct SSH access
 */
export function generateRemoteZellijLayout(
  host: RemoteHost,
  envName: string,
  compact = false
): string {
  const localMountPoint = getRemoteMountPoint(host.name, envName);
  const sshPrefix = `gcloud compute ssh ${host.instance} --project=${host.project} --zone=${host.zone} --tunnel-through-iap --`;

  // Build log tail commands for each service
  const services = ["front", "core", "connectors", "oauth", "front-workers"];
  const logPanes = services
    .map((service) => {
      const logPath = `~/.dust-hive/envs/${envName}/${service}.log`;
      return `        pane command="bash" {
            args "-c" "${sshPrefix} 'tail -F ${logPath} 2>/dev/null || echo Waiting for ${service}...'"
            name "${service}"
        }`;
    })
    .join("\n");

  const layout = `layout {
    ${compact ? "" : 'default_tab_template {\n        pane size=1 borderless=true {\n            plugin location="tab-bar"\n        }\n        children\n    }'}

    tab name="${host.name}/${envName}" focus=true {
        pane split_direction="vertical" {
            pane split_direction="horizontal" size="70%" {
                pane command="zsh" {
                    args "-c" "cd '${localMountPoint}' && exec zsh"
                    name "shell"
                    focus true
                }
            }
            pane split_direction="horizontal" size="30%" {
${logPanes}
            }
        }
    }

    tab name="remote-shell" {
        pane command="bash" {
            args "-c" "${sshPrefix} -t 'cd ~/dust-hive/${envName} && exec \\$SHELL -l'"
            name "remote"
        }
    }
}
`;

  return layout;
}

/**
 * Get the path for the remote environment's zellij layout file
 */
export function getRemoteZellijLayoutPath(remoteName: string, envName: string): string {
  return join(DUST_HIVE_ZELLIJ, `remote-${remoteName}-${envName}.kdl`);
}

/**
 * Write the zellij layout file for a remote environment
 */
export async function writeRemoteZellijLayout(
  host: RemoteHost,
  envName: string,
  compact = false
): Promise<string> {
  await mkdir(DUST_HIVE_ZELLIJ, { recursive: true });

  const layout = generateRemoteZellijLayout(host, envName, compact);
  const layoutPath = getRemoteZellijLayoutPath(host.name, envName);

  await writeFile(layoutPath, layout);

  return layoutPath;
}

/**
 * Get the zellij session name for a remote environment
 */
export function getRemoteZellijSessionName(remoteName: string, envName: string): string {
  return `dust-hive-${remoteName}-${envName}`;
}
