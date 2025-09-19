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
  const config = getActionConfig(auth);

  const res = await runAction(auth, _ACTION_NAME, config, [
    {
      agents_list: agents,
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
    run_id,
  } = res.value;

  logger.info("Action runId : " + run_id);

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

      return results[0][0].value as AugmentedMessage[];
    case "running":
      logger.error(
        `Action ${_ACTION_NAME} is still running, expected to be done`
      );
      return [{ type: "message", text: message }];
    default:
      assertNever(run);
  }
};
