import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";

export async function hasDsbxToolsEnabled(
  auth: Authenticator
): Promise<boolean> {
  const flags = await getFeatureFlags(auth);

  return (
    flags.includes("sandbox_tools") && flags.includes("sandbox_dsbx_tools")
  );
}
