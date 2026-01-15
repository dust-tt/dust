import type { RemoteHost } from "./remote-host";
import { getRemoteMountPoint } from "./remote-sshfs";

/**
 * Translate a local path (in SSHFS mount) to the corresponding remote path
 */
export function localToRemotePath(localPath: string, host: RemoteHost, envName: string): string {
  const localMountPoint = getRemoteMountPoint(host.name, envName);
  const remoteBase = `/home/${host.remoteUser}/dust-hive/${envName}`;

  if (localPath.startsWith(localMountPoint)) {
    return localPath.replace(localMountPoint, remoteBase);
  }

  // Path is not in the mount point, return as-is
  return localPath;
}

/**
 * Translate a remote path to the corresponding local path (in SSHFS mount)
 */
export function remoteToLocalPath(remotePath: string, host: RemoteHost, envName: string): string {
  const localMountPoint = getRemoteMountPoint(host.name, envName);
  const remoteBase = `/home/${host.remoteUser}/dust-hive/${envName}`;

  if (remotePath.startsWith(remoteBase)) {
    return remotePath.replace(remoteBase, localMountPoint);
  }

  // Path is not in the remote worktree, return as-is
  return remotePath;
}

/**
 * Translate all paths in a command string from local to remote
 * Handles common git command patterns
 */
export function translatePathsInCommand(
  command: string,
  host: RemoteHost,
  envName: string
): string {
  const localMountPoint = getRemoteMountPoint(host.name, envName);
  const remoteBase = `/home/${host.remoteUser}/dust-hive/${envName}`;

  // Replace all occurrences of the local mount point with the remote path
  return command.replaceAll(localMountPoint, remoteBase);
}

/**
 * Translate all paths in command arguments from local to remote
 */
export function translateArgsToRemote(args: string[], host: RemoteHost, envName: string): string[] {
  return args.map((arg) => {
    const localMountPoint = getRemoteMountPoint(host.name, envName);
    const remoteBase = `/home/${host.remoteUser}/dust-hive/${envName}`;

    if (arg.startsWith(localMountPoint)) {
      return arg.replace(localMountPoint, remoteBase);
    }
    return arg;
  });
}
