import type { MCPOAuthUseCase, OAuthProvider } from "@app/types";

import { SnowflakeSetupInstructions } from "./SnowflakeSetupInstructions";

interface ProviderSetupInstructionsProps {
  provider: OAuthProvider;
  useCase: MCPOAuthUseCase | null;
}

/**
 * Renders provider-specific setup instructions in the connection dialog.
 * These guide admins through provider-specific setup steps
 * (e.g., creating security integrations in Snowflake).
 *
 * Returns null if the provider has no setup instructions.
 */
export function ProviderSetupInstructions({
  provider,
  useCase,
}: ProviderSetupInstructionsProps) {
  switch (provider) {
    case "snowflake":
      return <SnowflakeSetupInstructions useCase={useCase} />;
    default:
      return null;
  }
}
