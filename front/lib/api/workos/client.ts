import config from "@app/lib/api/config";
import { WorkOS } from "@workos-inc/node";

let workos: WorkOS | null = null;

export function getWorkOS() {
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  if (!workos) {
    workos = new WorkOS(config.getWorkOSApiKey(), {
      clientId: config.getWorkOSClientId(),
      apiHostname: "auth-api.dust.tt",
    });
  }

  return workos;
}

// The WorkOS SDK defaults to a 60s request timeout. Session resolution runs
// synchronously on every request, so a WorkOS outage would otherwise add up
// to 60s of latency before falling back to a locally cached session. This
// client is dedicated to that path so it can fail fast; other call sites
// (admin scripts, migrations, background sync) keep the default client.
const SESSION_AUTH_TIMEOUT_MS = 5_000;

let workosForSessionAuth: WorkOS | null = null;

export function getWorkOSForSessionAuth() {
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  if (!workosForSessionAuth) {
    workosForSessionAuth = new WorkOS(config.getWorkOSApiKey(), {
      clientId: config.getWorkOSClientId(),
      apiHostname: "auth-api.dust.tt",
      timeout: SESSION_AUTH_TIMEOUT_MS,
    });
  }

  return workosForSessionAuth;
}
