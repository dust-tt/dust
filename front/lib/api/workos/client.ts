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
