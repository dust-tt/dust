import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { hasFeatureFlag } from "@app/lib/auth";

// Two gates, both required: the workspace must be flagged, and the host must be named in
// config. The allowlist is global, so on its own it would let any workspace admin reach an
// in-cluster service.
export async function isInClusterMCPUrlAllowed(
  auth: Authenticator,
  url: string | URL
): Promise<boolean> {
  if (
    !(await hasFeatureFlag(
      auth,
      "dust_internal_dangerous_in_cluster_mcp_servers"
    ))
  ) {
    return false;
  }

  const allowedHosts = config.getInClusterMCPHosts();
  if (allowedHosts.length === 0) {
    return false;
  }

  let parsed: URL;
  if (url instanceof URL) {
    parsed = url;
  } else {
    try {
      parsed = new URL(url);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_) {
      return false;
    }
  }

  return allowedHosts.includes(parsed.host.toLowerCase());
}
