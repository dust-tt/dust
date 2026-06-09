import { config } from "@app/lib/api/regions/config";
import type {
  FetchAgentTemplateResponse,
  FetchAssistantTemplatesResponse,
} from "@app/lib/resources/template_resource";
import { TemplateResource } from "@app/lib/resources/template_resource";
import logger from "@app/logger/logger";
import type { ModelConfig } from "@app/types/assistant/models/types";
import type {
  CreateTemplateFormType,
  TemplateTagCodeType,
} from "@app/types/assistant/templates";
import { Err, Ok, type Result } from "@app/types/shared/result";

export type PokeFetchAssistantTemplateResponse = ReturnType<
  TemplateResource["toJSON"]
>;

export interface PokeCreateTemplateResponseBody {
  success: boolean;
}

export type PullTemplatesResponseBody = {
  success: true;
  count: number;
};

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

export type PullTemplatesError = "main_region_fetch_failed";

/**
 * Pulls every published template from the main region and upserts it
 * locally by handle. Used by the poke "sync templates" tool in non-main
 * regions; individual per-template fetch failures are logged but do not
 * fail the overall pull (the count reflects only successful upserts).
 */
export async function pullTemplatesFromMainRegion(): Promise<
  Result<{ count: number }, PullTemplatesError>
> {
  const mainRegionUrl = config.getDustRegionSyncMasterUrl();
  // eslint-disable-next-line no-restricted-globals
  const response = await fetch(`${mainRegionUrl}/api/templates`, {
    method: "GET",
  });

  if (!response.ok) {
    return new Err("main_region_fetch_failed");
  }

  const templatesResponse: FetchAssistantTemplatesResponse =
    await response.json();
  let count = 0;

  for (const templateFromList of templatesResponse.templates) {
    // eslint-disable-next-line no-restricted-globals
    const templateResponse = await fetch(
      `${mainRegionUrl}/api/templates/${templateFromList.sId}`,
      { method: "GET" }
    );

    if (!templateResponse.ok) {
      logger.error(
        `Failed to fetch template ${templateFromList.sId}: ${templateResponse.status}`
      );
      continue;
    }

    const template: FetchAgentTemplateResponse = await templateResponse.json();

    await TemplateResource.upsertByHandle(template);

    count++;
  }

  return new Ok({ count });
}
