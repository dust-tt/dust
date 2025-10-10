import { runAction } from "@app/lib/actions/server";
import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import type { Authenticator } from "@app/lib/auth";
import { cloneBaseConfig, getDustProdAction } from "@app/lib/registry";
import logger from "@app/logger/logger";
import {
  assertNever,
  getSmallWhitelistedModel,
  GPT_4_1_MINI_MODEL_ID,
  removeNulls,
} from "@app/types";

const _ACTION_NAME = "voice-find-agent-and-tools";

export interface Mention {
  type: "mention";
  id: string;
  name: string;
}

export interface Text {
  type: "text";
  text: string;
}

export type AugmentedMessage = Mention | Text;

interface MentionFromLLM {
  type: "mention";
  name: string;
}
type AugmentedMessageFromLLM = MentionFromLLM | Text;

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

function getActionConfig(auth: Authenticator) {
  const config = cloneBaseConfig(getDustProdAction(_ACTION_NAME).config);
  const model = getSmallWhitelistedModel(auth.getNonNullableWorkspace());
  config.GET_AUGMENTED_MESSAGE.provider_id = model?.providerId ?? "openai";
  config.GET_AUGMENTED_MESSAGE.model_id =
    model?.modelId ?? GPT_4_1_MINI_MODEL_ID;
  return config;
}

export const findAgentsInMessage = async (
  auth: Authenticator,
  message: string
) => {
  const agents = await listAgents(auth);
  const agentListForLLM = agents.map((a) => a.name);
  const config = getActionConfig(auth);

  const res = await runAction(auth, _ACTION_NAME, config, [
    {
      agents_list: agentListForLLM,
      message,
    },
  ]);

  if (res.isErr()) {
    logger.error(
      `Action ${_ACTION_NAME} failed to process message: ${res.error.type} ${res.error.message}`
    );
    return [{ type: "message", text: message }];
  }

  const {
    status: { run },
    traces,
    results,
  } = res.value;

  switch (run) {
    case "errored":
      const error = removeNulls(traces.map((t) => t[1][0][0].error)).join(", ");
      logger.error(
        `Action ${_ACTION_NAME} failed to process message: ${error}`
      );

      return [{ type: "message", text: message }];
    case "succeeded":
      if (!results || results.length === 0) {
        logger.error(
          `Action ${_ACTION_NAME} failed to process message: no results returned while run was successful`
        );
        return [{ type: "message", text: message }];
      }

      logger.debug(
        `Action ${_ACTION_NAME} output: ${JSON.stringify(results[0][0])}`
      );

      // as it's the output of a LLM we ensure we only keep valid augmented messages
      const augmentedMessagesFromLLM = asAugmentedMessageFromLLMArray(
        results[0][0]?.value
      );
      // then we transform the LLM output to something the frontend understands
      return augmentedMessagesFromLLM.map((m) =>
        messageFromLLMToAugmentedMessage(agents, m)
      );

    case "running":
      logger.error(
        `Action ${_ACTION_NAME} is still running, expected to be done`
      );
      return [{ type: "message", text: message }];
    default:
      assertNever(run);
  }
};

function asAugmentedMessageFromLLMArray(
  value: unknown
): AugmentedMessageFromLLM[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item) => {
    if (!item || typeof item !== "object") {
      return false;
    }

    const obj = item as Record<string, unknown>;

    if (obj.type === "mention" && typeof obj.name === "string") {
      return true;
    }

    return obj.type === "text" && typeof obj.text === "string";
  });
}

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
