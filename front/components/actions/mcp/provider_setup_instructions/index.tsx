import type { OAuthProvider } from "@app/types";

import { SnowflakeSetupInstructions } from "./SnowflakeSetupInstructions";

/**
 * Renders provider-specific setup instructions in the connection dialog.
 * These guide admins through provider-specific setup steps
 * (e.g., creating security integrations in Snowflake).
 *
 * Returns null if the provider has no setup instructions.
 */
export function ProviderSetupInstructions({
  provider,
}: {
  provider: OAuthProvider;
}) {
  switch (provider) {
    case "snowflake":
      return <SnowflakeSetupInstructions />;
    default:
      return null;
  }
}
