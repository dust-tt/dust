import { ManagementClient } from "auth0";

import config from "@app/lib/api/config";

let auth0ManagemementClient: ManagementClient | null = null;

export function getAuth0ManagemementClient(): ManagementClient {
  if (!auth0ManagemementClient) {
    auth0ManagemementClient = new ManagementClient({
      domain: config.getAuth0TenantUrl(),
      clientId: config.getAuth0M2MClientId(),
      clientSecret: config.getAuth0M2MClientSecret(),
    });
  }

  return auth0ManagemementClient;
}
