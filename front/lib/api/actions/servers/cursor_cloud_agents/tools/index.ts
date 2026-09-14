import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
  ToolHandlers,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { ToolContext } from "@app/lib/actions/types";
import type {
  CreateCursorAgentRequest,
  CursorCloudAgentsClient,
} from "@app/lib/api/actions/servers/cursor_cloud_agents/client";
import { getCursorCloudAgentsClient } from "@app/lib/api/actions/servers/cursor_cloud_agents/client";
import { CURSOR_CLOUD_AGENTS_TOOLS_METADATA } from "@app/lib/api/actions/servers/cursor_cloud_agents/metadata";
import {
  renderAgent,
  renderAgentList,
  renderRun,
  renderRunList,
} from "@app/lib/api/actions/servers/cursor_cloud_agents/rendering";
import type { Authenticator } from "@app/lib/auth";
import { Err, Ok } from "@app/types/shared/result";

function textResult(text: string): ToolHandlerResult {
  return new Ok([{ type: "text" as const, text }]);
}

async function withClient(
  extra: ToolHandlerExtra,
  action: (client: CursorCloudAgentsClient) => Promise<ToolHandlerResult>
): Promise<ToolHandlerResult> {
  const client = getCursorCloudAgentsClient(extra.authInfo);
  if (client.isErr()) {
    return client;
  }
  return action(client.value);
}

function apiError(action: string, error: Error): ToolHandlerResult {
  return new Err(new MCPError(`Failed to ${action}: ${error.message}`));
}

export function createCursorCloudAgentsTools(
  _auth: Authenticator,
  _toolContext?: ToolContext
) {
  const handlers: ToolHandlers<typeof CURSOR_CLOUD_AGENTS_TOOLS_METADATA> = {
    launch_agent: async (
      {
        prompt,
        name,
        repositoryUrls,
        startingRef,
        pullRequestUrl,
        environmentType,
        environmentName,
        modelId,
        modelParams,
        mode,
        imageUrls,
        workOnCurrentBranch,
        autoCreatePR,
        skipReviewerRequest,
      },
      extra
    ) => {
      if (pullRequestUrl && repositoryUrls?.length !== 1) {
        return new Err(
          new MCPError("pullRequestUrl requires exactly one repository URL.", {
            tracked: false,
          })
        );
      }
      if (environmentName && !environmentType) {
        return new Err(
          new MCPError(
            "environmentType is required when environmentName is provided.",
            { tracked: false }
          )
        );
      }

      const body: CreateCursorAgentRequest = {
        prompt: {
          text: prompt,
          images: imageUrls?.map((url) => ({ url })),
        },
        name,
        repos: repositoryUrls?.map((url) => ({
          url,
          startingRef,
          ...(pullRequestUrl ? { prUrl: pullRequestUrl } : {}),
        })),
        env: environmentType
          ? { type: environmentType, name: environmentName }
          : undefined,
        model: modelId ? { id: modelId, params: modelParams } : undefined,
        mode,
        workOnCurrentBranch,
        autoCreatePR,
        skipReviewerRequest,
      };

      return withClient(extra, async (client) => {
        const result = await client.createAgent(body);
        if (result.isErr()) {
          return apiError("launch Cursor Cloud Agent", result.error);
        }
        return textResult(
          `${renderAgent(result.value.agent)}\n\n### Initial run\n${renderRun(result.value.run)}`
        );
      });
    },

    list_agents: async ({ limit, cursor, includeArchived }, extra) =>
      withClient(extra, async (client) => {
        const result = await client.listAgents({
          limit,
          cursor,
          includeArchived,
        });
        if (result.isErr()) {
          return apiError("list Cursor Cloud Agents", result.error);
        }
        return textResult(
          renderAgentList(result.value.items, result.value.nextCursor)
        );
      }),

    get_agent: async ({ agentId }, extra) =>
      withClient(extra, async (client) => {
        const result = await client.getAgent(agentId);
        return result.isErr()
          ? apiError("get Cursor Cloud Agent", result.error)
          : textResult(renderAgent(result.value));
      }),

    create_run: async ({ agentId, prompt, mode, imageUrls }, extra) =>
      withClient(extra, async (client) => {
        const result = await client.createRun(agentId, {
          prompt: {
            text: prompt,
            images: imageUrls?.map((url) => ({ url })),
          },
          mode,
        });
        return result.isErr()
          ? apiError("create Cursor Cloud Agent run", result.error)
          : textResult(renderRun(result.value.run));
      }),

    list_runs: async ({ agentId, limit, cursor }, extra) =>
      withClient(extra, async (client) => {
        const result = await client.listRuns(agentId, { limit, cursor });
        return result.isErr()
          ? apiError("list Cursor Cloud Agent runs", result.error)
          : textResult(
              renderRunList(result.value.items, result.value.nextCursor)
            );
      }),

    get_run: async ({ agentId, runId }, extra) =>
      withClient(extra, async (client) => {
        const result = await client.getRun(agentId, runId);
        return result.isErr()
          ? apiError("get Cursor Cloud Agent run", result.error)
          : textResult(renderRun(result.value));
      }),

    cancel_run: async ({ agentId, runId }, extra) =>
      withClient(extra, async (client) => {
        const result = await client.cancelRun(agentId, runId);
        return result.isErr()
          ? apiError("cancel Cursor Cloud Agent run", result.error)
          : textResult(`Cancelled Cursor run ${result.value.id}.`);
      }),

    get_agent_usage: async ({ agentId, runId }, extra) =>
      withClient(extra, async (client) => {
        const result = await client.getAgentUsage(agentId, runId);
        if (result.isErr()) {
          return apiError("get Cursor Cloud Agent usage", result.error);
        }
        const { totalUsage, runs } = result.value;
        return textResult(
          [
            `## Cursor usage for agent ${agentId}`,
            `- Total tokens: ${totalUsage.totalTokens}`,
            `- Input: ${totalUsage.inputTokens}`,
            `- Output: ${totalUsage.outputTokens}`,
            `- Cache writes: ${totalUsage.cacheWriteTokens}`,
            `- Cache reads: ${totalUsage.cacheReadTokens}`,
            "",
            "### Runs",
            ...runs.map(
              (run) => `- ${run.id}: ${run.usage.totalTokens} total tokens`
            ),
          ].join("\n")
        );
      }),

    list_artifacts: async ({ agentId }, extra) =>
      withClient(extra, async (client) => {
        const result = await client.listArtifacts(agentId);
        if (result.isErr()) {
          return apiError("list Cursor Cloud Agent artifacts", result.error);
        }
        return textResult(
          result.value.items.length
            ? [
                `Found ${result.value.items.length} artifact${result.value.items.length === 1 ? "" : "s"}.`,
                "",
                ...result.value.items.map(
                  (artifact) =>
                    `- \`${artifact.path}\` — ${artifact.sizeBytes} bytes; updated ${artifact.updatedAt}`
                ),
              ].join("\n")
            : "No artifacts found for this Cursor Cloud Agent."
        );
      }),

    get_artifact_download_url: async ({ agentId, path }, extra) =>
      withClient(extra, async (client) => {
        const result = await client.getArtifactDownloadUrl(agentId, path);
        return result.isErr()
          ? apiError("get Cursor artifact download URL", result.error)
          : textResult(
              `[Download \`${path}\`](${result.value.url})\n\nLink expires at ${result.value.expiresAt}.`
            );
      }),

    archive_agent: async ({ agentId }, extra) =>
      withClient(extra, async (client) => {
        const result = await client.archiveAgent(agentId);
        return result.isErr()
          ? apiError("archive Cursor Cloud Agent", result.error)
          : textResult(`Archived Cursor Cloud Agent ${result.value.id}.`);
      }),

    unarchive_agent: async ({ agentId }, extra) =>
      withClient(extra, async (client) => {
        const result = await client.unarchiveAgent(agentId);
        return result.isErr()
          ? apiError("unarchive Cursor Cloud Agent", result.error)
          : textResult(`Unarchived Cursor Cloud Agent ${result.value.id}.`);
      }),

    delete_agent: async ({ agentId }, extra) =>
      withClient(extra, async (client) => {
        const result = await client.deleteAgent(agentId);
        return result.isErr()
          ? apiError("delete Cursor Cloud Agent", result.error)
          : textResult(
              `Permanently deleted Cursor Cloud Agent ${result.value.id}.`
            );
      }),

    get_api_key_info: async (_params, extra) =>
      withClient(extra, async (client) => {
        const result = await client.getApiKeyInfo();
        if (result.isErr()) {
          return apiError("get Cursor API key info", result.error);
        }
        const info = result.value;
        return textResult(
          [
            `## ${info.apiKeyName}`,
            `- Created: ${info.createdAt}`,
            ...(info.userEmail ? [`- User: ${info.userEmail}`] : []),
            ...(info.userId !== undefined ? [`- User ID: ${info.userId}`] : []),
          ].join("\n")
        );
      }),

    list_models: async (_params, extra) =>
      withClient(extra, async (client) => {
        const result = await client.listModels();
        return result.isErr()
          ? apiError("list Cursor models", result.error)
          : textResult(
              [
                `Found ${result.value.items.length} Cursor model${result.value.items.length === 1 ? "" : "s"}.`,
                "",
                ...result.value.items.map(
                  (model) =>
                    `- **${model.displayName}** — \`${model.id}\`${model.description ? `: ${model.description}` : ""}`
                ),
              ].join("\n")
            );
      }),

    list_repositories: async (_params, extra) =>
      withClient(extra, async (client) => {
        const result = await client.listRepositories();
        return result.isErr()
          ? apiError("list Cursor repositories", result.error)
          : textResult(
              [
                `Found ${result.value.items.length} GitHub repositor${result.value.items.length === 1 ? "y" : "ies"}.`,
                "",
                ...result.value.items.map((repo) => `- ${repo.url}`),
              ].join("\n")
            );
      }),
  };

  return buildTools(CURSOR_CLOUD_AGENTS_TOOLS_METADATA, handlers);
}
