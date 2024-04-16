import type {
  ActionPreset,
  AgentActionConfigurationType,
  DustAppRunConfigurationType,
  Result,
  RetrievalConfigurationType,
  SupportedModel,
  TablesQueryConfigurationType,
  TemplateAgentConfigurationType,
} from "@dust-tt/types";
import {
  ASSISTANT_CREATIVITY_LEVEL_TEMPERATURES,
  Err,
  Ok,
  removeNulls,
} from "@dust-tt/types";

import type { BuilderFlow } from "@app/components/assistant_builder/AssistantBuilder";
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
    actions: removeNulls([getAction(template.presetAction)]),
    description: template.description ?? "",
    instructions: template.presetInstructions ?? "",
    generation: {
      model: {
        providerId: template.presetProviderId,
        modelId: template.presetModelId,
      } as SupportedModel,
      temperature:
        ASSISTANT_CREATIVITY_LEVEL_TEMPERATURES[template.presetTemperature],
      forceUseAtIteration: 1,
    },
    name: template.handle,
    scope: flow === "personal_assistants" ? "private" : "workspace",
    isTemplate: true,
  });
}

function getAction(action: ActionPreset): AgentActionConfigurationType | null {
  switch (action) {
    case "reply":
      return null;

    case "retrieval_configuration":
      return {
        dataSources: [],
        id: -1,
        query: "auto",
        relativeTimeFrame: "auto",
        sId: "template",
        topK: "auto",
        type: "retrieval_configuration",
        forceUseAtIteration: 0,
      } satisfies RetrievalConfigurationType;

    case "tables_query_configuration":
      return {
        id: -1,
        sId: "template",
        tables: [],
        type: "tables_query_configuration",
        forceUseAtIteration: 0,
      } satisfies TablesQueryConfigurationType;

    case "dust_app_run_configuration":
      return {
        id: -1,
        sId: "template",
        type: "dust_app_run_configuration",
        appWorkspaceId: "template",
        appId: "template",
        forceUseAtIteration: 0,
      } satisfies DustAppRunConfigurationType;

    default:
      return null;
  }
}
