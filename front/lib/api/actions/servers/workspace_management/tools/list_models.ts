import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { formatAvailableModels } from "@app/lib/api/assistant/global_agents/sidekick_context";
import { getSelectableModelsForAuth } from "@app/lib/model_tiers/enabled_models";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";
import { Ok } from "@app/types/shared/result";

// Same listing as sidekick's `get_available_models`: both list what `getSelectableModelsForAuth`
// returns, so every listed model and effort is accepted by an agent model change suggestion.
export async function listModels(
  { providerId }: { providerId?: ModelProviderIdType },
  { auth }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const models = await getSelectableModelsForAuth(auth, { providerId });

  if (models.length === 0) {
    return new Ok([{ type: "text" as const, text: "No models found." }]);
  }

  return new Ok([
    { type: "text" as const, text: formatAvailableModels(models) },
  ]);
}
