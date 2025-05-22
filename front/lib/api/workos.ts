import type { User} from "@workos-inc/node";
import { WorkOS } from "@workos-inc/node";

import config from "@app/lib/api/config";

import type { RegionType } from "./regions/config";

let workos: WorkOS | null = null;

export function getWorkOS() {
  if (!workos) {
    workos = new WorkOS(config.getWorkOSApiKey(), {
      clientId: config.getWorkOSClientId(),
    });
  }

  return workos;
}

// Store the region in the user's app_metadata to redirect to the right region.
// A JWT Template include this metadta in https://dust.tt/region ( https://dashboard.workos.com/environment_01JGCT54YDGZAAD731M0GQKZGM/authentication/edit-jwt-template )
export async function setRegionForUser(user: User, region: RegionType) {
  // Update user metadata
  await getWorkOS().userManagement.updateUser({
    userId: user.id,
    metadata: {
      region,
    },
  });
}
