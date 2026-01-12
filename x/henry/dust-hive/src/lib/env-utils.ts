// Environment variable utilities

/**
 * Load environment variables from a bash env.sh file.
 * Sources the file and captures all exported environment variables.
 */
export async function loadEnvVars(envShPath: string): Promise<Record<string, string>> {
  const command = `source "${envShPath}" && env`;
  const proc = Bun.spawn(["bash", "-c", command], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdoutPromise = new Response(proc.stdout).text();
  const stderrPromise = new Response(proc.stderr).text();
  await proc.exited;
  const output = await stdoutPromise;
  const stderr = await stderrPromise;

  if (proc.exitCode !== 0) {
    throw new Error(`Failed to load env vars: ${stderr.trim() || "unknown error"}`);
  }

  const env: Record<string, string> = {};
  for (const line of output.split("\n")) {
    const idx = line.indexOf("=");
    if (idx > 0) {
      const key = line.substring(0, idx);
      const value = line.substring(idx + 1);
      env[key] = value;
    }
  }
  return env;
}

/**
 * Build a PostgreSQL connection URI from environment variables.
 * Uses POSTGRES_HOST and POSTGRES_PORT with defaults for local dev.
 */
export function buildPostgresUri(envVars: Record<string, string>, database?: string): string {
  const host = envVars["POSTGRES_HOST"] ?? "localhost";
  const port = envVars["POSTGRES_PORT"] ?? "5432";
  const db = database ? `/${database}` : "/";
  return `postgres://dev:dev@${host}:${port}${db}`;
}
