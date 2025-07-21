import * as yaml from "js-yaml";
import { z } from "zod";

import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import type {
  AgentYAMLAction,
  AgentYAMLConfig,
  AgentYAMLDataSourceConfiguration,
  AgentYAMLEditor,
  AgentYAMLSlackIntegration,
  AgentYAMLTag,
} from "@app/lib/agent_yaml_converter/types";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";
import { normalizeError } from "@app/types/shared/utils/error_utils";

import { agentYAMLConfigSchema } from "./schemas";

const yamlConverterMetadataSchema = z.object({
  agentSId: z.string().min(1, "Agent ID is required"),
  createdBy: z.string().min(1, "Created by user ID is required"),
  lastModified: z.date(),
  version: z.string().min(1, "Version is required"),
});

type YamlConverterMetadata = z.infer<typeof yamlConverterMetadataSchema>;

/**
 * AgentYAMLConverter provides utilities for converting between AgentBuilderFormData
 * and YAML format, with proper error handling and type safety.
 *
 * This converter follows the Result pattern for error handling and validates all inputs
 * to ensure data integrity during conversion.
 */
export class AgentYAMLConverter {
  /**
   * Converts AgentBuilderFormData to YAML configuration format.
   *
   * @param formData - The form data from the agent builder
   * @param metadata - Metadata including agent ID, creator, version info
   * @returns Result containing the YAML configuration or error
   */
  static fromBuilderFormData(
    formData: AgentBuilderFormData,
    metadata: YamlConverterMetadata
  ): Result<AgentYAMLConfig, Error> {
    try {
      const validatedMetadata = yamlConverterMetadataSchema.parse(metadata);

      const actionsResult = this.convertActions(formData.actions);
      if (actionsResult.isErr()) {
        return actionsResult;
      }

      const yamlConfig = {
        metadata: {
          version: validatedMetadata.version,
          agent_id: validatedMetadata.agentSId,
          last_modified: validatedMetadata.lastModified.toISOString(),
          created_by: validatedMetadata.createdBy,
        },
        agent: {
          handle: formData.agentSettings.name,
          description: formData.agentSettings.description,
          scope: formData.agentSettings.scope,
          avatar_url: formData.agentSettings.pictureUrl,
          max_steps_per_run: formData.maxStepsPerRun,
          visualization_enabled: formData.actions.some(
            (action) => action.type === "DATA_VISUALIZATION"
          ),
        },
        instructions: formData.instructions,
        generation_settings: {
          model_id: formData.generationSettings.modelSettings.modelId,
          provider_id: formData.generationSettings.modelSettings.providerId,
          temperature: formData.generationSettings.temperature,
          reasoning_effort: formData.generationSettings.reasoningEffort,
          response_format: formData.generationSettings.responseFormat,
        },
        tags: this.convertTags(formData.agentSettings.tags),
        editors: this.convertEditors(formData.agentSettings.editors),
        toolset: actionsResult.value,
        slack_integration: this.convertSlackIntegration(formData.agentSettings),
      };

      const validatedConfig = agentYAMLConfigSchema.parse(yamlConfig);
      return new Ok(validatedConfig);
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }

  /**
   * Converts form data tags to YAML format
   */
  private static convertTags(
    tags: AgentBuilderFormData["agentSettings"]["tags"]
  ): AgentYAMLTag[] {
    return tags
      .filter((tag) => tag.name && tag.kind)
      .map((tag) => ({
        name: tag.name,
        kind: tag.kind,
      }));
  }

  /**
   * Converts form data editors to YAML format
   */
  private static convertEditors(
    editors: AgentBuilderFormData["agentSettings"]["editors"]
  ): AgentYAMLEditor[] {
    return editors
      .filter((editor) => editor.sId && editor.email)
      .map((editor) => ({
        user_id: editor.sId,
        email: editor.email,
        full_name: editor.fullName,
      }));
  }

  /**
   * Converts form data actions to YAML format
   */
  private static convertActions(
    actions: AgentBuilderFormData["actions"]
  ): Result<AgentYAMLAction[], Error> {
    try {
      const convertedActions: AgentYAMLAction[] = [];
      for (const action of actions) {
        const baseAction = {
          id: action.id,
          name: action.name,
          description: action.description,
        };

        switch (action.type) {
          case "SEARCH":
            convertedActions.push({
              ...baseAction,
              type: "SEARCH",
              configuration: {
                data_sources: this.convertDataSourceConfigurations(
                  action.configuration.dataSourceConfigurations
                ),
              },
            });
            break;

          case "DATA_VISUALIZATION":
            convertedActions.push({
              ...baseAction,
              type: "DATA_VISUALIZATION",
              configuration: {},
            });
            break;

          case "INCLUDE_DATA":
            convertedActions.push({
              ...baseAction,
              type: "INCLUDE_DATA",
              configuration: {
                data_sources: this.convertDataSourceConfigurations(
                  action.configuration.dataSourceConfigurations
                ),
                time_frame: action.configuration.timeFrame,
              },
            });
            break;

          case "EXTRACT_DATA":
            convertedActions.push({
              ...baseAction,
              type: "EXTRACT_DATA",
              configuration: {
                data_sources: this.convertDataSourceConfigurations(
                  action.configuration.dataSourceConfigurations
                ),
                time_frame: action.configuration.timeFrame,
                json_schema: action.configuration.jsonSchema,
              },
            });
            break;

          case "QUERY_TABLES":
            convertedActions.push({
              ...baseAction,
              type: "QUERY_TABLES",
              configuration: {
                data_sources: this.convertDataSourceConfigurations(
                  action.configuration.dataSourceConfigurations
                ),
                time_frame: action.configuration.timeFrame,
              },
            });
            break;

          default:
            return new Err(
              new Error(
                `Unsupported action type: ${(action as { type: string }).type}`
              )
            );
        }
      }

      return new Ok(convertedActions);
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }

  /**
   * Converts data source configurations to YAML format
   */
  private static convertDataSourceConfigurations(
    configurations: Record<
      string,
      {
        dataSourceView: { sId: string };
        selectedResources: Array<{ internalId: string }>;
        isSelectAll: boolean;
        tagsFilter: {
          in: string[];
          not: string[];
          mode: "custom" | "auto";
        } | null;
      }
    >
  ): Record<string, AgentYAMLDataSourceConfiguration> {
    const result: Record<string, AgentYAMLDataSourceConfiguration> = {};

    for (const [key, config] of Object.entries(configurations)) {
      result[key] = {
        view_id: config.dataSourceView.sId,
        selected_resources: config.selectedResources
          .map((resource) => resource.internalId)
          .filter(Boolean),
        is_select_all: Boolean(config.isSelectAll),
        tags_filter: config.tagsFilter
          ? {
              in: config.tagsFilter.in ?? [],
              not: config.tagsFilter.not ?? [],
              mode: config.tagsFilter.mode,
            }
          : null,
      };
    }

    return result;
  }

  /**
   * Converts Slack integration settings to YAML format
   */
  private static convertSlackIntegration(
    agentSettings: AgentBuilderFormData["agentSettings"]
  ): AgentYAMLSlackIntegration | undefined {
    if (
      !agentSettings.slackProvider ||
      !agentSettings.slackChannels ||
      agentSettings.slackChannels.length === 0
    ) {
      return undefined;
    }

    const validChannels = agentSettings.slackChannels.filter(
      (channel) => channel.slackChannelId && channel.slackChannelName
    );

    if (validChannels.length === 0) {
      return undefined;
    }

    return {
      provider: agentSettings.slackProvider,
      channels: validChannels.map((channel) => ({
        channel_id: channel.slackChannelId,
        channel_name: channel.slackChannelName,
      })),
    };
  }

  /**
   * Converts AgentYAMLConfig to YAML string
   */
  static toYAMLString(config: AgentYAMLConfig): Result<string, Error> {
    try {
      const yamlString = yaml.dump(config, {
        indent: 2,
        lineWidth: 120,
        noRefs: true,
        sortKeys: true,
      });

      if (!yamlString || yamlString.trim() === "") {
        return new Err(new Error("Generated YAML string is empty"));
      }

      return new Ok(yamlString);
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }
}
