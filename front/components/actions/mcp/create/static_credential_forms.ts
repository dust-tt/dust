import type { ForwardRefExoticComponent, RefAttributes } from "react";

import type { StaticCredentialFormHandle } from "@app/components/actions/mcp/create/SnowflakeKeypairCredentialForm";
import { SnowflakeKeypairCredentialForm } from "@app/components/actions/mcp/create/SnowflakeKeypairCredentialForm";
import type { MCPOAuthUseCase, OAuthProvider } from "@app/types/oauth/lib";
import type { LightWorkspaceType } from "@app/types/user";

export interface StaticCredentialFormProps {
  owner: LightWorkspaceType;
  onValidityChange: (isValid: boolean) => void;
  onCredentialCreated: (credentialId: string) => void;
}

export type StaticCredentialFormComponent = ForwardRefExoticComponent<
  StaticCredentialFormProps & RefAttributes<StaticCredentialFormHandle>
>;

const STATIC_CREDENTIAL_FORMS: Record<string, StaticCredentialFormComponent> = {
  "snowflake:platform_actions": SnowflakeKeypairCredentialForm,
};

/**
 * Registry lookup: returns a form component for providers that use
 * static credentials for a given use case, or null if the standard
 * OAuth flow should be used.
 */
export function getStaticCredentialForm(
  provider: OAuthProvider,
  useCase: MCPOAuthUseCase
): StaticCredentialFormComponent | null {
  return STATIC_CREDENTIAL_FORMS[`${provider}:${useCase}`] ?? null;
}
