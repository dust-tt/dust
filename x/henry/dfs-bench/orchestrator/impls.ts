// How the orchestrator mounts each implementation inside a sandbox. Everything else (sandboxes,
// workloads, results) is shared.

export interface MountSpec {
  // Local path of the client binary, uploaded to every sandbox.
  binaryPath: string;
  // Shell command (run as root) that mounts at `mountPoint` and stays in the foreground.
  command: (binary: string, mountPoint: string) => string;
  envs: Record<string, string>;
  // Printed on stdout once the mount serves requests.
  readyMarker: string;
  // Log line message carrying the client's totals after SIGTERM.
  totalsMessage: string;
}

export interface Impl {
  name: string;
  image: string;
  endpoint: string;
  mount: MountSpec;
}

export function henryImpl(endpoint: string, token: string, buildDir: string): MountSpec {
  return {
    binaryPath: `${buildDir}/dfs-mount`,
    command: (binary, mountPoint) =>
      `exec ${binary} --addr ${endpoint} --max-delay-ms 1000 ${mountPoint}`,
    envs: { DFS_TOKEN: token, RUST_LOG: "info" },
    readyMarker: "mounted",
    totalsMessage: "mount totals",
  };
}
