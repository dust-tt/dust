import { getInternalMCPServerNameAndWorkspaceId } from "@app/lib/actions/mcp_internal_actions/constants";
import { getDefaultRemoteMCPServerByURL } from "@app/lib/actions/mcp_internal_actions/remote_servers";
import type {
  ToolRequirement,
  UsageMilestone,
  UseCaseAudience,
  UseCaseRequirement,
} from "@app/lib/api/homepage_use_cases/registry";
import {
  HOMEPAGE_USE_CASES,
  isDismissibleAudience,
} from "@app/lib/api/homepage_use_cases/registry";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { SkillReference } from "@app/lib/skills/format";
import type { ToolReference } from "@app/lib/tools/format";
import type {
  HomepageUseCaseTier,
  HomepageUseCaseType,
} from "@app/types/api/homepage_use_cases";
import type { FavoritePlatform } from "@app/types/favorite_platforms";
import { parseFavoritePlatforms } from "@app/types/favorite_platforms";
import type { JobType } from "@app/types/job_type";
import { isJobType } from "@app/types/job_type";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

const DISMISSED_USE_CASES_METADATA_KEY = "homepage_use_cases_dismissed";

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

function getToolAlternatives(
  requirement: UseCaseRequirement
): ToolRequirement[] {
  switch (requirement.type) {
    case "skill":
      return [];
    case "anyOf":
      return requirement.of;
    case "internalServer":
    case "remoteServer":
      return [requirement];
    default:
      assertNever(requirement);
  }
}

const REQUIRED_TOOL_KEYS = new Set(
  HOMEPAGE_USE_CASES.flatMap((useCase) =>
    useCase.requires.flatMap((requirement) =>
      getToolAlternatives(requirement).map(toolKey)
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

async function getUserPreferences(
  auth: Authenticator
): Promise<
  Pick<UserProfile, "dismissedUseCaseIds" | "favoritePlatforms" | "jobType">
> {
  const user = auth.user();
  if (!user) {
    return {
      dismissedUseCaseIds: new Set(),
      favoritePlatforms: [],
      jobType: null,
    };
  }

  const [jobTypeMetadata, favoritePlatformsMetadata, dismissedUseCaseIds] =
    await Promise.all([
      user.getMetadata("job_type"),
      user.getMetadata("favorite_platforms", auth.getNonNullableWorkspace().id),
      user.getMetadataAsArray(DISMISSED_USE_CASES_METADATA_KEY),
    ]);

  return {
    dismissedUseCaseIds: new Set(dismissedUseCaseIds),
    favoritePlatforms: parseFavoritePlatforms(favoritePlatformsMetadata?.value),
    jobType: isJobType(jobTypeMetadata?.value) ? jobTypeMetadata.value : null,
  };
}

async function getReachedMilestones(
  auth: Authenticator
): Promise<Set<UsageMilestone>> {
  const pods = await SpaceResource.listWorkspacePodsAsMember(auth);

  const milestones = new Set<UsageMilestone>();
  if (pods.length > 0) {
    milestones.add("joined_pod");
  }

  return milestones;
}

interface UserProfile {
  dismissedUseCaseIds: Set<string>;
  favoritePlatforms: FavoritePlatform[];
  jobType: JobType | null;
  reachedMilestones: Set<UsageMilestone>;
}

function resolveTool(
  alternatives: ToolRequirement[],
  {
    favoritePlatforms,
    toolsByKey,
  }: {
    favoritePlatforms: FavoritePlatform[];
    toolsByKey: Map<string, ToolReference>;
  }
): ToolReference | null {
  const resolving = alternatives.filter((alternative) =>
    toolsByKey.has(toolKey(alternative))
  );
  const favorites = new Set<string>(favoritePlatforms);
  const chosen =
    resolving.find(
      (alternative) =>
        alternative.type === "internalServer" && favorites.has(alternative.name)
    ) ?? resolving[0];

  return chosen ? (toolsByKey.get(toolKey(chosen)) ?? null) : null;
}

function getAudienceTier(
  audience: UseCaseAudience,
  { jobType, reachedMilestones }: UserProfile
): HomepageUseCaseTier | null {
  switch (audience.type) {
    case "everyone":
      return "general";
    case "featured":
      return "featured";
    case "jobTypes":
      return jobType && audience.jobTypes.includes(jobType) ? "role" : null;
    case "untilMilestone":
      return reachedMilestones.has(audience.milestone) ? null : "milestone";
    default:
      assertNever(audience);
  }
}

function selectSatisfiedUseCases({
  profile,
  skillsById,
  toolsByKey,
}: {
  profile: UserProfile;
  skillsById: Map<string, SkillReference>;
  toolsByKey: Map<string, ToolReference>;
}): HomepageUseCaseType[] {
  return HOMEPAGE_USE_CASES.flatMap(({ audience, requires, ...useCase }) => {
    const tier = getAudienceTier(audience, profile);
    if (!tier) {
      return [];
    }

    const isDismissible = isDismissibleAudience(audience);
    if (isDismissible && profile.dismissedUseCaseIds.has(useCase.id)) {
      return [];
    }

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
        const tool = resolveTool(getToolAlternatives(requirement), {
          favoritePlatforms: profile.favoritePlatforms,
          toolsByKey,
        });
        if (!tool) {
          return [];
        }
        tools.push(tool);
      }
    }

    return [{ ...useCase, skills, tools, tier, isDismissible }];
  });
}

export async function listHomepageUseCases(
  auth: Authenticator
): Promise<HomepageUseCaseType[]> {
  const [skillsById, toolsByKey, preferences, reachedMilestones] =
    await Promise.all([
      getSkillsById(auth),
      getToolsByKey(auth),
      getUserPreferences(auth),
      getReachedMilestones(auth),
    ]);

  return selectSatisfiedUseCases({
    profile: { ...preferences, reachedMilestones },
    skillsById,
    toolsByKey,
  });
}

export class DismissHomepageUseCaseError extends Error {
  constructor(
    readonly type: "use_case_not_found" | "use_case_not_dismissible"
  ) {
    super(type);
  }
}

/**
 * @cc [owner:adrsimon,label:product] dismissal-is-per-user
 * A dismissal MUST hide the use case for the calling user only, in every workspace, and MUST fail
 * without writing anything when the id is unknown or the use case is not dismissible.
 */
export async function dismissHomepageUseCase(
  auth: Authenticator,
  useCaseId: string
): Promise<Result<undefined, DismissHomepageUseCaseError>> {
  const useCase = HOMEPAGE_USE_CASES.find(({ id }) => id === useCaseId);
  if (!useCase) {
    return new Err(new DismissHomepageUseCaseError("use_case_not_found"));
  }
  if (!isDismissibleAudience(useCase.audience)) {
    return new Err(new DismissHomepageUseCaseError("use_case_not_dismissible"));
  }

  await auth
    .getNonNullableUser()
    .upsertMetadataArray(DISMISSED_USE_CASES_METADATA_KEY, useCaseId);

  return new Ok(undefined);
}
