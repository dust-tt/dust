import { runActionStreamed } from "@app/lib/actions/server";
import type { Authenticator } from "@app/lib/auth";
import { cloneBaseConfig, getDustProdAction } from "@app/lib/registry";
import type { LightAgentConfigurationType, Result } from "@app/types";
import { GEMINI_2_5_FLASH_MODEL_CONFIG } from "@app/types";
import {
  Err,
  getSmallWhitelistedModel,
  isProviderWhitelisted,
  removeNulls,
} from "@app/types";
import { Ok } from "@app/types";

export async function getSuggestedAgentsForContent(
  auth: Authenticator,
  {
    content,
    agents,
    conversationId,
  }: {
    content: string;
    agents: LightAgentConfigurationType[];
    conversationId?: string;
  }
): Promise<Result<LightAgentConfigurationType[], Error>> {
  const owner = auth.getNonNullableWorkspace();

  let model = getSmallWhitelistedModel(owner);
  if (!model) {
    return new Err(
      new Error("Error suggesting agents: failed to find a whitelisted model.")
    );
  }

  // TODO(daphne): See if we can put Flash 2 as the default model.
  if (isProviderWhitelisted(owner, "google_ai_studio")) {
    model = GEMINI_2_5_FLASH_MODEL_CONFIG;
  }

  const config = cloneBaseConfig(
    getDustProdAction("suggest-agent-from-message").config
  );
  config.MODEL.provider_id = model.providerId;
  config.MODEL.model_id = model.modelId;

  const formattedAgents = agents.map((a) => ({
    id: a.sId,
    displayName: `@${a.name}`,
    description: a.description,
    userFavorite: a.userFavorite,
  }));

  const tracingRecords: Record<string, string> = { workspaceId: owner.sId };
  if (conversationId) {
    tracingRecords.conversationId = conversationId;
  }

  const res = await runActionStreamed(
    auth,
    "suggest-agent-from-message",
    config,
    [
      {
        agents: formattedAgents,
        message: content,
      },
    ],
    tracingRecords
  );

  if (res.isErr()) {
    return new Err(new Error(`Error suggesting agents: ${res.error}`));
  }

  const { eventStream } = res.value;

  let suggestions: LightAgentConfigurationType[] = [];

  for await (const event of eventStream) {
    if (event.type === "error") {
      return new Err(
        new Error(`Error suggesting agents: ${event.content.message}`)
      );
    }

    if (event.type === "block_execution") {
      const e = event.content.execution[0][0];
      if (e.error) {
        return new Err(new Error(`Error suggesting agents: ${e.error}`));
      }

      if (event.content.block_name === "OUTPUT" && e.value) {
        const output = e.value as {
          suggested_agents: {
            id: string;
          }[];
        };
        suggestions = removeNulls(
          output.suggested_agents.map((a) =>
            agents.find((a2) => a2.sId === a.id)
          )
        );
      }
    }
  }

  return new Ok(suggestions);
}
