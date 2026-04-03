import { AGENT_SIDEKICK_CONTEXT_TOOL_NAME } from "@app/lib/api/actions/servers/agent_sidekick_context/metadata";
import type {
  AvailableSkill,
  AvailableTool,
} from "@app/lib/api/assistant/workspace_capabilities";
import {
  getAvailableModelsForWorkspace,
  listAvailableSkills,
  listAvailableTools,
} from "@app/lib/api/assistant/workspace_capabilities";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import type { FavoritePlatform } from "@app/types/favorite_platforms";
import { isFavoritePlatform } from "@app/types/favorite_platforms";
import type { JobType } from "@app/types/job_type";
import { isJobType, JOB_TYPE_LABELS } from "@app/types/job_type";
import { isStringArray } from "@app/types/shared/utils/general";
import { safeParseJSON } from "@app/types/shared/utils/json_utils";

interface SidekickUserMetadata {
  jobType: JobType | null;
  favoritePlatforms: FavoritePlatform[];
}

export interface SidekickContext {
  mcpServerViews: {
    context: MCPServerViewResource;
  } | null;
}

export function formatAvailableModels(
  models: ModelConfigurationType[]
): string {
  const byProvider = new Map<string, ModelConfigurationType[]>();
  for (const m of models) {
    const list = byProvider.get(m.providerId) ?? [];
    list.push(m);
    byProvider.set(m.providerId, list);
  }

  const sections = Array.from(byProvider.entries()).map(
    ([provider, providerModels]) => {
      const modelLines = providerModels
        .map(
          (m) =>
            `- **${m.displayName}** (modelId: ${m.modelId}): ${m.description}${m.supportsVision ? " (vision)" : " (no vision)"}`
        )
        .join("\n");
      return `<provider id="${provider}">\n${modelLines}\n</provider>`;
    }
  );

  return `<available_models>\n${sections.join("\n\n")}\n</available_models>`;
}

export function formatAvailableSkills(skills: AvailableSkill[]): string {
  const skillLines = skills
    .map((s) => {
      const desc = (s.agentFacingDescription ?? "No description").replace(
        /\n/g,
        " "
      );
      let line = `- **${s.name}** (ID: ${s.sId}): ${desc}`;
      if (s.toolSIds.length > 0) {
        line += ` with tools: ${s.toolSIds.join(", ")}`;
      }
      return line;
    })
    .join("\n");
  return `<available_skills>\n${skillLines}\n</available_skills>`;
}

export function formatAvailableTools(tools: AvailableTool[]): string {
  const toolLines = tools
    .map(
      (t) =>
        `- **${t.name}** (ID: ${t.sId}): ${t.description.replace(/\n/g, " ")}`
    )
    .join("\n");
  return `<available_tools>\n${toolLines}\n</available_tools>`;
}

async function fetchSidekickUserMetadata(
  auth: Authenticator
): Promise<SidekickUserMetadata | null> {
  const user = auth.user();
  if (!user) {
    return null;
  }

  const owner = auth.getNonNullableWorkspace();

  const [jobTypeMeta, platformsMeta] = await Promise.all([
    user.getMetadata("job_type"),
    user.getMetadata("favorite_platforms", owner.id),
  ]);

  let favoritePlatforms: FavoritePlatform[] = [];
  if (platformsMeta?.value) {
    const parsed = safeParseJSON(platformsMeta.value);
    if (
      parsed.isOk() &&
      isStringArray(parsed.value) &&
      parsed.value.every(isFavoritePlatform)
    ) {
      favoritePlatforms = parsed.value;
    }
  }

  const jobType = isJobType(jobTypeMeta?.value) ? jobTypeMeta.value : null;

  return { jobType, favoritePlatforms };
}

function formatUserContext(
  userMetadata: SidekickUserMetadata | null
): string | null {
  if (
    !userMetadata ||
    (!userMetadata.jobType && userMetadata.favoritePlatforms.length === 0)
  ) {
    return null;
  }

  const jobTypeLabel = userMetadata.jobType
    ? JOB_TYPE_LABELS[userMetadata.jobType]
    : "Not specified";
  const platforms =
    userMetadata.favoritePlatforms.join(", ") || "None specified";

  return `- Job function: ${jobTypeLabel}\n- Preferred platforms: ${platforms}`;
}

function formatWorkspaceContext(
  models: ModelConfigurationType[],
  skills: AvailableSkill[],
  tools: AvailableTool[]
): string {
  return [
    formatAvailableModels(models),
    formatAvailableSkills(skills),
    formatAvailableTools(tools),
  ].join("\n\n");
}

export async function buildUserContext(
  auth: Authenticator
): Promise<string | null> {
  const userMetadata = await fetchSidekickUserMetadata(auth);
  const formatted = formatUserContext(userMetadata);
  if (!formatted) {
    return null;
  }
  return `<user_context>\n${formatted}\n</user_context>`;
}

export async function buildToolsAndSkillsContext(
  auth: Authenticator
): Promise<string> {
  const [skills, tools] = await Promise.all([
    listAvailableSkills(auth),
    listAvailableTools(auth),
  ]);
  return [formatAvailableSkills(skills), formatAvailableTools(tools)].join(
    "\n\n"
  );
}

export async function buildWorkspaceContext(
  auth: Authenticator
): Promise<string> {
  const [models, skills, tools] = await Promise.all([
    getAvailableModelsForWorkspace(auth),
    listAvailableSkills(auth),
    listAvailableTools(auth),
  ]);
  const formatted = formatWorkspaceContext(models, skills, tools);
  return `<workspace_context>\n${formatted}\n</workspace_context>`;
}

export async function buildSidekickContext(
  auth: Authenticator,
  agentsIdsToFetch: string[]
): Promise<SidekickContext | null> {
  if (!agentsIdsToFetch.includes(GLOBAL_AGENTS_SID.SIDEKICK)) {
    return null;
  }

  const context =
    await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
      auth,
      AGENT_SIDEKICK_CONTEXT_TOOL_NAME
    );

  return {
    mcpServerViews: context ? { context } : null,
  };
}
