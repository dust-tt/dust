import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { formatAvailableModels } from "@app/lib/api/assistant/global_agents/sidekick_context";
import { getEnabledModelsForAuth } from "@app/lib/model_tiers/enabled_models";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";
import { Ok } from "@app/types/shared/result";

/**
 * @cc [owner:fabiencelier,label:product;mcp] lists-accepted-models
 * The listed models and reasoning efforts MUST be exactly the ones an agent model change
 * suggestion accepts (`validateAgentModelChange`): the caller's selectable models, restricted to
 * the reasoning efforts their model tiers allow.
 */
export async function listModels(
  { providerId }: { providerId?: ModelProviderIdType },
  { auth }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const models = (await getEnabledModelsForAuth(auth)).filter(
    (m) => m.isSelectable && (!providerId || m.providerId === providerId)
  );

  if (models.length === 0) {
    return new Ok([{ type: "text" as const, text: "No models found." }]);
  }

  return new Ok([
    { type: "text" as const, text: formatAvailableModels(models) },
  ]);
}
