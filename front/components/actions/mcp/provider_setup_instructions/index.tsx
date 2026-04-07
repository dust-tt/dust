import type { MCPOAuthUseCase, OAuthProvider } from "@app/types/oauth/lib";
import { Icon, InformationCircleIcon } from "@dust-tt/sparkle";

import { NetSuiteSetupInstructions } from "./NetSuiteSetupInstructions";
import { PowerBiSetupInstructions } from "./PowerBiSetupInstructions";
import { SnowflakeSetupInstructions } from "./SnowflakeSetupInstructions";

interface ProviderSetupInstructionsProps {
  provider: OAuthProvider;
  useCase: MCPOAuthUseCase | null;
  serverId?: number;
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
  serverId,
}: ProviderSetupInstructionsProps) {
  switch (provider) {
    case "snowflake":
      return <SnowflakeSetupInstructions useCase={useCase} />;
    case "mcp_static":
      if (serverId === 10015) {
        return <PowerBiSetupInstructions />;
      }
      if (serverId === 10017) {
        return <NetSuiteSetupInstructions />;
      }
      return null;
    default:
      return null;
  }
}

interface ProviderAuthNoteProps {
  provider: OAuthProvider;
}

/**
 * Renders a provider-specific informational note shown after the credential
 * inputs and before the user clicks "Setup connection".
 *
 * Returns null if the provider has no auth note.
 */
export function ProviderAuthNote({ provider }: ProviderAuthNoteProps) {
  switch (provider) {
    case "snowflake":
      return (
        <div className="flex w-full items-start gap-2 rounded-lg border border-border-dark/50 bg-muted-background p-3 dark:border-border-dark-night/50 dark:bg-muted-background-night">
          <Icon
            visual={InformationCircleIcon}
            size="sm"
            className="mt-0.5 shrink-0 text-muted-foreground dark:text-muted-foreground-night"
          />
          <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            Clicking "Setup connection" will start a Snowflake OAuth flow using
            the role above. Your Snowflake user must have access to this role to
            complete authentication.
          </span>
        </div>
      );
    default:
      return null;
  }
}
