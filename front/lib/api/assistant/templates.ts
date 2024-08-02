import type {
  Result,
  SupportedModel,
  TemplateAgentConfigurationType,
} from "@dust-tt/types";
import {
  ASSISTANT_CREATIVITY_LEVEL_TEMPERATURES,
  Err,
  Ok,
} from "@dust-tt/types";

import type { BuilderFlow } from "@app/components/assistant_builder/types";
import { TemplateResource } from "@app/lib/resources/template_resource";

export async function generateMockAgentConfigurationFromTemplate(
  templateId: string,
  flow: BuilderFlow
): Promise<Result<TemplateAgentConfigurationType, Error>> {
  const template = await TemplateResource.fetchByExternalId(templateId);
  if (!template) {
    return new Err(new Error("Template not found"));
  }

  return new Ok({
    actions: [],
    description: "",
    instructions: template.presetInstructions ?? "",
    model: {
      providerId: template.presetProviderId,
      modelId: template.presetModelId,
      temperature:
        ASSISTANT_CREATIVITY_LEVEL_TEMPERATURES[template.presetTemperature],
    },
    generation: {
      model: {
        providerId: template.presetProviderId,
        modelId: template.presetModelId,
      } as SupportedModel,
      temperature:
        ASSISTANT_CREATIVITY_LEVEL_TEMPERATURES[template.presetTemperature],
    },
    name: template.handle,
    scope: flow === "personal_assistants" ? "private" : "workspace",
    pictureUrl: template.pictureUrl,
    visualizationEnabled: false,
    isTemplate: true,
  });
}
