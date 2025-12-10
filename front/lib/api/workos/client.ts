import { WorkOS } from "@workos-inc/node";

import config from "@app/lib/api/config";

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
