import { getInternalMCPServerNameAndWorkspaceId } from "@app/lib/actions/mcp_internal_actions/constants";
import { getDefaultRemoteMCPServerByURL } from "@app/lib/actions/mcp_internal_actions/remote_servers";
import type { UseCaseRequirement } from "@app/lib/api/homepage_use_cases/registry";
import { HOMEPAGE_USE_CASES } from "@app/lib/api/homepage_use_cases/registry";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SkillReference } from "@app/lib/skills/format";
import type { ToolReference } from "@app/lib/tools/format";
import type { HomepageUseCaseType } from "@app/types/api/homepage_use_cases";

type ToolRequirement = Exclude<UseCaseRequirement, { type: "skill" }>;

function toolKey(requirement: ToolRequirement): string {
  return `${requirement.type}:${requirement.name}`;
}

const REQUIRED_SKILL_IDS = [
  ...new Set(
    HOMEPAGE_USE_CASES.flatMap((useCase) =>
      useCase.requires.flatMap((requirement) =>
        requirement.type === "skill" ? [requirement.id] : []
      )
    )
  ),
];

const REQUIRED_TOOL_KEYS = new Set(
  HOMEPAGE_USE_CASES.flatMap((useCase) =>
    useCase.requires.flatMap((requirement) =>
      requirement.type === "skill" ? [] : [toolKey(requirement)]
    )
  )
);

function getViewToolKey(view: MCPServerViewResource): string | null {
  if (view.internalMCPServerId) {
    const server = getInternalMCPServerNameAndWorkspaceId(
      view.internalMCPServerId
    );
    return server.isOk()
      ? toolKey({ type: "internalServer", name: server.value.name })
      : null;
  }

  const config = getDefaultRemoteMCPServerByURL(view.remoteMCPServerUrl);

  return config ? toolKey({ type: "remoteServer", name: config.name }) : null;
}

/**
 * @cc [owner:adrsimon,label:security] tools-scoped-to-readable-spaces
 * A returned tool MUST come from a view in a space the caller holds `read` on, per
 * [space-verbs]. `listByWorkspace` only scopes to the workspace, so the verb is ours to check.
 */
async function getToolsByKey(
  auth: Authenticator
): Promise<Map<string, ToolReference>> {
  const views = await MCPServerViewResource.listByWorkspace(auth);

  const tools = new Map<string, ToolReference>();
  for (const view of views) {
    const key = getViewToolKey(view);
    if (!key || !REQUIRED_TOOL_KEYS.has(key)) {
      continue;
    }
    if (
      view.space.isSystem() ||
      !auth.can("read", view.space) ||
      (tools.has(key) && !view.space.isGlobal())
    ) {
      continue;
    }
    tools.set(key, view.toRefJSON());
  }

  return tools;
}

async function getSkillsById(
  auth: Authenticator
): Promise<Map<string, SkillReference>> {
  const skills = await SkillResource.fetchByIds(auth, REQUIRED_SKILL_IDS, {
    withInstructions: false,
    withTools: false,
    withFileAttachments: false,
  });

  return new Map(skills.map((skill) => [skill.sId, skill.toRefJSON()]));
}

function selectSatisfiedUseCases({
  skillsById,
  toolsByKey,
}: {
  skillsById: Map<string, SkillReference>;
  toolsByKey: Map<string, ToolReference>;
}): HomepageUseCaseType[] {
  return HOMEPAGE_USE_CASES.flatMap(({ requires, ...useCase }) => {
    const skills: SkillReference[] = [];
    const tools: ToolReference[] = [];

    for (const requirement of requires) {
      if (requirement.type === "skill") {
        const skill = skillsById.get(requirement.id);
        if (!skill) {
          return [];
        }
        skills.push(skill);
      } else {
        const tool = toolsByKey.get(toolKey(requirement));
        if (!tool) {
          return [];
        }
        tools.push(tool);
      }
    }

    return [{ ...useCase, skills, tools }];
  });
}

export async function listHomepageUseCases(
  auth: Authenticator
): Promise<HomepageUseCaseType[]> {
  const [skillsById, toolsByKey] = await Promise.all([
    getSkillsById(auth),
    getToolsByKey(auth),
  ]);

  return selectSatisfiedUseCases({ skillsById, toolsByKey });
}
