import type { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";

/**
 * @cc [owner:sfriquet,label:security] returned-sid-not-exposed-to-caller
 * The lookup ignores the agent's scope and the caller's read permission. Callers MUST NOT expose
 * the returned `sId` to the user; they may only reveal whether an active agent with that name
 * exists.
 */
export async function getAgentIdFromName(
  auth: Authenticator,
  name: string
): Promise<string | null> {
  const owner = auth.getNonNullableWorkspace();

  const agent = await AgentConfigurationModel.findOne({
    attributes: ["sId"],
    where: {
      workspaceId: owner.id,
      name,
      status: "active",
    },
  });

  if (!agent) {
    return null;
  }

  return agent.sId;
}
