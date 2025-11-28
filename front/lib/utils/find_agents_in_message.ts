import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import type { AugmentedMessageFromLLM } from "@app/lib/api/assistant/voice_agent_finder";
import { findAgentsInMessageGeneration } from "@app/lib/api/assistant/voice_agent_finder";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { assertNever } from "@app/types";

export type AugmentedMessage =
  | {
      type: "mention";
      id: string;
      name: string;
    }
  | {
      type: "text";
      text: string;
    };

async function listAgents(auth: Authenticator) {
  const agents = await getAgentConfigurationsForView({
    auth,
    agentsGetView: "list",
    variant: "extra_light",
  });

  return agents.map((a) => ({
    id: a.sId,
    name: a.name,
  }));
}

export const findAgentsInMessage = async (
  auth: Authenticator,
  message: string
): Promise<AugmentedMessage[]> => {
  const agents = await listAgents(auth);
  const agentListForLLM = agents.map((a) => a.name);

  const res = await findAgentsInMessageGeneration(auth, {
    agentsList: agentListForLLM,
    message,
  });

  if (res.isErr()) {
    logger.error(`Failed to find agents in message: ${res.error.message}`);
    return [{ type: "text", text: message }];
  }

  // Transform the LLM output to something the frontend understands.
  return res.value.augmentedMessages.map((m) =>
    messageFromLLMToAugmentedMessage(agents, m)
  );
};

const messageFromLLMToAugmentedMessage = (
  agentLists: { id: string; name: string }[],
  augmentedMessageFromLLM: AugmentedMessageFromLLM
): AugmentedMessage => {
  switch (augmentedMessageFromLLM.type) {
    case "text":
      // passthrough if it's a text message
      return augmentedMessageFromLLM;
    case "mention":
      // if it's a mention, we try to find the agent in the list from its name
      const found = agentLists.find(
        (a) =>
          a.name.trim().toLowerCase() ===
          augmentedMessageFromLLM.name.trim().toLowerCase()
      );
      if (found) {
        // if we found it, we return a mention
        return { type: "mention", id: found.id, name: found.name };
      }

      // if we didn't find it, we return a text message with the name of the agent
      return { type: "text", text: augmentedMessageFromLLM.name };
    default:
      assertNever(augmentedMessageFromLLM);
  }
};
