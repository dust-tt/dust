import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import {
  parseExactEgressDomain,
  readSandboxPolicy,
  readWorkspacePolicy,
} from "@app/lib/api/sandbox/egress_policy";
import { SANDBOX_TOOLS_METADATA } from "@app/lib/api/actions/servers/sandbox/metadata";
import type { Authenticator } from "@app/lib/auth";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import { domainMatchesAllowlist } from "@app/types/sandbox/egress_policy";
import { z } from "zod";

type AutoApprovePredicate = (params: {
  auth: Authenticator;
  rawInputs: unknown;
  conversationId: string;
}) => Promise<boolean>;

const AddEgressDomainInputSchema = z.object(
  SANDBOX_TOOLS_METADATA.add_egress_domain.schema,
);

async function shouldAutoApproveAddEgressDomain({
  auth,
  rawInputs,
  conversationId,
}: {
  auth: Authenticator;
  rawInputs: unknown;
  conversationId: string;
}): Promise<boolean> {
  const input = AddEgressDomainInputSchema.safeParse(rawInputs);
  if (!input.success) {
    return false;
  }

  const domain = parseExactEgressDomain(input.data.domain);
  if (domain.isErr()) {
    return false;
  }

  const workspacePolicy = await readWorkspacePolicy(auth);
  if (workspacePolicy.isErr()) {
    return false;
  }

  if (
    domainMatchesAllowlist(domain.value, workspacePolicy.value.allowedDomains)
  ) {
    return true;
  }

  const sandbox = await SandboxResource.fetchByConversationId(
    auth,
    conversationId,
  );
  if (!sandbox) {
    return false;
  }

  const sandboxPolicy = await readSandboxPolicy(sandbox.providerId);
  if (sandboxPolicy.isErr()) {
    return false;
  }

  return domainMatchesAllowlist(
    domain.value,
    sandboxPolicy.value.allowedDomains,
  );
}

export function lookupAutoApprovePredicate(
  server: InternalMCPServerNameType,
  toolName: string,
): AutoApprovePredicate | null {
  if (
    server === "sandbox" &&
    toolName === SANDBOX_TOOLS_METADATA.add_egress_domain.name
  ) {
    return shouldAutoApproveAddEgressDomain;
  }
  return null;
}
