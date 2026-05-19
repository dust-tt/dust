import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { processAdditionalConfiguration } from "@app/components/agent_builder/submitAgentBuilderForm";
import type { AutoInternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import {
  isAutoInternalMCPServerName,
  isInternalMCPServerName,
} from "@app/lib/actions/mcp_internal_actions/constants";
import type {
  AgentYAMLAction,
  AgentYAMLConfig,
  AgentYAMLDataSourceConfiguration,
  AgentYAMLSkill,
  AgentYAMLSlackIntegration,
  AgentYAMLSpace,
  AgentYAMLTableConfiguration,
  AgentYAMLTag,
} from "@app/lib/agent_yaml_converter/schemas";
import { agentYAMLConfigSchema } from "@app/lib/agent_yaml_converter/schemas";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { PostOrPatchAgentConfigurationRequestBody } from "@app/types/api/internal/agent_configuration";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { isString } from "@app/types/shared/utils/general";
import * as yaml from "js-yaml";

export class AgentYAMLConverter {
  static async fromBuilderFormData(
    auth: Authenticator,
    formData: AgentBuilderFormData,
    spaces: AgentYAMLSpace[]
  ): Promise<Result<AgentYAMLConfig, Error>> {
    try {
      const actionsResult = await this.convertActions(auth, formData.actions);
      if (actionsResult.isErr()) {
        return actionsResult;
      }

      const skills = this.convertSkills(formData.skills);

      const yamlConfig = {
        agent: {
          handle: formData.agentSettings.name,
          description: formData.agentSettings.description,
          scope: formData.agentSettings.scope,
          avatar_url: formData.agentSettings.pictureUrl,
          max_steps_per_run: formData.maxStepsPerRun,
          visualization_enabled: false, // Hardcoding until removed.
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
        editors: this.convertEditorEmails(formData.agentSettings.editors),
        toolset: actionsResult.value,
        spaces,
        skills: skills.length > 0 ? skills : undefined,
        slack_integration: this.convertSlackIntegration(formData.agentSettings),
      };

      const validatedConfig = agentYAMLConfigSchema.parse(yamlConfig);
      return new Ok(validatedConfig);
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }

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

  private static convertEditorEmails(
    editors: AgentBuilderFormData["agentSettings"]["editors"]
  ): string[] {
    return editors
      .filter((editor) => editor.email)
      .map((editor) => editor.email);
  }

  private static convertSkills(
    skills: AgentBuilderFormData["skills"]
  ): AgentYAMLSkill[] {
    return skills
      .filter((skill) => skill.sId && skill.name)
      .map((skill) => ({
        sId: skill.sId,
        name: skill.name,
      }));
  }

  private static convertTablesConfigurations(
    configurations: Record<
      string,
      {
        dataSourceView: { sId: string };
        selectedResources: Array<{ internalId: string }>;
      }
    >
  ): AgentYAMLTableConfiguration[] {
    const tables: AgentYAMLTableConfiguration[] = [];
    for (const config of Object.values(configurations)) {
      for (const resource of config.selectedResources) {
        if (resource.internalId) {
          tables.push({
            view_id: config.dataSourceView.sId,
            table_id: resource.internalId,
          });
        }
      }
    }
    return tables;
  }

  private static async convertActions(
    auth: Authenticator,
    actions: AgentBuilderFormData["actions"]
  ): Promise<Result<AgentYAMLAction[], Error>> {
    const convertedActions: AgentYAMLAction[] = [];
    for (const action of actions) {
      const mcpServerName = await this.getMCPServerNameFromConfig(
        auth,
        action.configuration
      );
      if (!mcpServerName) {
        return new Err(
          new Error("Could not determine MCP server name from configuration")
        );
      }

      const tablesConfig = action.configuration.tablesConfigurations
        ? this.convertTablesConfigurations(
            action.configuration.tablesConfigurations
          )
        : undefined;

      convertedActions.push({
        name: action.name,
        description: action.description,
        type: "MCP",
        configuration: {
          mcp_server_name: mcpServerName,
          mcp_server_view_id: action.configuration.mcpServerViewId ?? undefined,
          data_sources: action.configuration.dataSourceConfigurations
            ? this.convertDataSourceConfigurations(
                action.configuration.dataSourceConfigurations
              )
            : undefined,
          tables:
            tablesConfig && tablesConfig.length > 0 ? tablesConfig : undefined,
          child_agent_id: action.configuration.childAgentId ?? undefined,
          time_frame: action.configuration.timeFrame ?? undefined,
          json_schema: action.configuration.jsonSchema ?? undefined,
          additional_configuration:
            Object.keys(action.configuration.additionalConfiguration || {})
              .length > 0
              ? action.configuration.additionalConfiguration
              : undefined,
          dust_app_configuration: action.configuration.dustAppConfiguration
            ? {
                type: "dust_app_run_configuration",
                app_workspace_id:
                  action.configuration.dustAppConfiguration.appWorkspaceId,
                app_id: action.configuration.dustAppConfiguration.appId,
              }
            : undefined,
          secret_name: action.configuration.secretName ?? undefined,
          dust_project: action.configuration.dustProject
            ? {
                workspace_id: action.configuration.dustProject.workspaceId,
                project_id: action.configuration.dustProject.projectId,
              }
            : undefined,
        },
      });
    }

    return new Ok(convertedActions);
  }

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

  private static async getMCPServerNameFromConfig(
    auth: Authenticator,
    configuration: { mcpServerViewId: string | null }
  ): Promise<string | null> {
    if (!configuration.mcpServerViewId) {
      return null;
    }

    try {
      const mcpServerView = await MCPServerViewResource.fetchById(
        auth,
        configuration.mcpServerViewId
      );
      return mcpServerView?.toJSON().server.name ?? null;
    } catch {
      return null;
    }
  }

  private static convertDataSources(
    dataSources: Record<string, AgentYAMLDataSourceConfiguration>,
    workspaceId: string
  ) {
    return Object.values(dataSources).map((config) => ({
      dataSourceViewId: config.view_id,
      workspaceId,
      filter: {
        parents:
          config.selected_resources.length > 0
            ? {
                in: config.selected_resources,
                not: [],
              }
            : null,
        tags: config.tags_filter,
      },
    }));
  }

  private static convertTables(
    tables: AgentYAMLTableConfiguration[],
    workspaceId: string
  ) {
    return tables.map((table) => ({
      dataSourceViewId: table.view_id,
      tableId: table.table_id,
      workspaceId,
    }));
  }

  static async convertYAMLActionsToMCPConfigurations(
    auth: Authenticator,
    actions: AgentYAMLAction[]
  ): Promise<
    Result<
      {
        configurations: PostOrPatchAgentConfigurationRequestBody["assistant"]["actions"][number][];
        skipped: { action: AgentYAMLAction; reason: string }[];
      },
      Error
    >
  > {
    try {
      const viewIds = actions
        .map((a) => a.configuration.mcp_server_view_id)
        .filter(isString);

      const viewsById = new Map<string, MCPServerViewResource>();
      if (viewIds.length > 0) {
        const views = await MCPServerViewResource.fetchByIds(auth, viewIds);
        for (const view of views) {
          viewsById.set(view.sId, view);
        }
      }

      const resolvedActions: {
        action: AgentYAMLAction;
        mcpServerViewId: string;
      }[] = [];
      const unresolvedActions: AgentYAMLAction[] = [];
      const autoInternalNames: AutoInternalMCPServerNameType[] = [];

      for (const action of actions) {
        const { mcp_server_view_id, mcp_server_name } = action.configuration;
        const view = mcp_server_view_id
          ? viewsById.get(mcp_server_view_id)
          : undefined;

        if (view) {
          resolvedActions.push({ action, mcpServerViewId: view.sId });
        } else {
          // if we cannot resolve by id, we fall back to name resolution
          unresolvedActions.push(action);
          if (
            mcp_server_name &&
            isInternalMCPServerName(mcp_server_name) &&
            isAutoInternalMCPServerName(mcp_server_name)
          ) {
            autoInternalNames.push(mcp_server_name);
          }
        }
      }

      const viewsByAutoInternalName =
        autoInternalNames.length > 0
          ? await MCPServerViewResource.getMCPServerViewsForAutoInternalToolsAsMap(
              auth,
              autoInternalNames
            )
          : undefined;

      const skippedActions: { action: AgentYAMLAction; reason: string }[] = [];

      // Resolve view IDs for unresolved actions via auto internal name lookup.
      for (const action of unresolvedActions) {
        const { mcp_server_name } = action.configuration;

        const mcpServerViewId =
          mcp_server_name &&
          isInternalMCPServerName(mcp_server_name) &&
          isAutoInternalMCPServerName(mcp_server_name)
            ? viewsByAutoInternalName?.get(mcp_server_name)?.sId
            : undefined;

        if (mcpServerViewId) {
          resolvedActions.push({ action, mcpServerViewId });
        } else {
          skippedActions.push({
            action,
            reason: `MCP server view not found for: ${mcp_server_name}`,
          });
        }
      }

      const mcpConfigurations = resolvedActions.map(
        ({ action, mcpServerViewId }) =>
          this.getMCPActionConfigurationFromYaml(auth, action, mcpServerViewId)
      );

      return new Ok({
        configurations: mcpConfigurations,
        skipped: skippedActions,
      });
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }

  private static getMCPActionConfigurationFromYaml(
    auth: Authenticator,
    action: AgentYAMLAction,
    mcpServerViewId: string
  ): PostOrPatchAgentConfigurationRequestBody["assistant"]["actions"][number] {
    const workspaceId = auth.getNonNullableWorkspace().sId;
    const { configuration } = action;

    return {
      type: "mcp_server_configuration",
      mcpServerViewId,
      name: action.name ?? "",
      description: action.description ?? null,
      dataSources: configuration.data_sources
        ? this.convertDataSources(configuration.data_sources, workspaceId)
        : null,
      tables: configuration.tables
        ? this.convertTables(configuration.tables, workspaceId)
        : null,
      childAgentId: configuration.child_agent_id ?? null,
      jsonSchema: configuration.json_schema ?? null,
      additionalConfiguration: configuration.additional_configuration
        ? processAdditionalConfiguration(configuration.additional_configuration)
        : {},
      dustAppConfiguration: configuration.dust_app_configuration
        ? {
            type: "dust_app_run_configuration",
            appWorkspaceId:
              configuration.dust_app_configuration.app_workspace_id,
            appId: configuration.dust_app_configuration.app_id,
          }
        : null,
      secretName: configuration.secret_name ?? null,
      dustProject: configuration.dust_project
        ? {
            workspaceId: configuration.dust_project.workspace_id,
            projectId: configuration.dust_project.project_id,
          }
        : null,
      timeFrame: configuration.time_frame ?? null,
    };
  }

  static fromYAMLString(yamlString: string): Result<AgentYAMLConfig, Error> {
    if (!yamlString?.trim()) {
      return new Err(new Error("YAML string is empty"));
    }

    try {
      const parsedYaml = yaml.load(yamlString, { schema: yaml.JSON_SCHEMA });
      const result = agentYAMLConfigSchema.safeParse(parsedYaml);

      if (!result.success) {
        const errorMessages = result.error.errors
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join(", ");
        return new Err(new Error(`YAML validation failed: ${errorMessages}`));
      }

      return new Ok(result.data);
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }

  static toYAMLString(config: AgentYAMLConfig): Result<string, Error> {
    try {
      return new Ok(
        yaml.dump(config, {
          indent: 2,
          lineWidth: 120,
          noRefs: true,
          sortKeys: true,
        })
      );
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }
}
