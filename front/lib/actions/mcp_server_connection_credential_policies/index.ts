import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import type { CredentialsProvider } from "@app/types/oauth/lib";

import { SNOWFLAKE_INTERNAL_SERVER_CREDENTIAL_POLICY } from "./snowflake";

export interface InternalServerCredentialPolicy {
  provider: CredentialsProvider;
  validateContent: (content: unknown) => boolean;
  invalidContentMessage: string;
}

const INTERNAL_SERVER_CREDENTIAL_POLICIES: Partial<
  Record<InternalMCPServerNameType, InternalServerCredentialPolicy>
> = {
  snowflake: SNOWFLAKE_INTERNAL_SERVER_CREDENTIAL_POLICY,
};

export function getInternalServerCredentialPolicy(
  serverName: InternalMCPServerNameType
): InternalServerCredentialPolicy | null {
  return INTERNAL_SERVER_CREDENTIAL_POLICIES[serverName] ?? null;
}
