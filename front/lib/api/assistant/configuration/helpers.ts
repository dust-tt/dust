import type { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";

export async function getAgentIdFromName(
  auth: Authenticator,
  name: string
): Promise<string | null> {
  return AgentResource.getAgentIdFromName(auth, name);
}
