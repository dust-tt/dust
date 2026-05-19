import type { ModelConfig } from "@app/types/assistant/models/types";
import type {
  CreateTemplateFormType,
  TemplateTagCodeType,
} from "@app/types/assistant/templates";

/**
 * Shared subset of `TemplateModel` attributes that the poke create and
 * update endpoints both write. Each endpoint adds its own extras
 * (`presetTemperature` on create; `timeFrameDuration` / `timeFrameUnit` on
 * update) on top.
 */
export function buildSharedTemplateAttributes(
  body: CreateTemplateFormType & { tags: TemplateTagCodeType[] },
  model: Pick<ModelConfig, "modelId" | "providerId">
) {
  return {
    backgroundColor: body.backgroundColor,
    userFacingDescription: body.userFacingDescription ?? null,
    agentFacingDescription: body.agentFacingDescription ?? null,
    emoji: body.emoji,
    handle: body.handle,
    helpActions: body.helpActions ?? null,
    helpInstructions: body.helpInstructions ?? null,
    sidekickInstructions: body.sidekickInstructions ?? null,
    presetActions: body.presetActions,
    presetDescription: null,
    presetInstructions: body.presetInstructions ?? null,
    presetModelId: model.modelId,
    presetProviderId: model.providerId,
    tags: body.tags,
    visibility: body.visibility,
  };
}
