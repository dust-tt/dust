import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import {
  getEffectiveWhiteListedProviders,
  getSmallWhitelistedModel,
} from "@app/lib/api/assistant/models";
import type { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import type { SkillAvailability } from "@app/types/assistant/skill_configuration";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import chunk from "lodash/chunk";
import uniq from "lodash/uniq";

// Safeguards to avoid sending a huge number of skills to a single LLM call:
// skills are checked in batches of this size, one LLM call per batch.
export const SKILLS_PER_LLM_CALL = 100;
const MAX_CONCURRENT_LLM_CALLS = 4;
const MAX_DESCRIPTION_LENGTH = 500;

const SET_SIMILAR_SKILLS_FUNCTION_NAME = "set_similar_skills";

const specifications: AgentActionSpecification[] = [
  {
    name: SET_SIMILAR_SKILLS_FUNCTION_NAME,
    description: "Set the similar skill ids",
    inputSchema: {
      type: "object",
      properties: {
        similar_skills_array: {
          type: "array",
          description: "An array of similar skill ids.",
          items: {
            type: "string",
          },
        },
      },
      required: ["similar_skills_array"],
    },
  },
];

const PROMPT = `# Role
You identify existing skills in a workspace that duplicate or overlap with a new skill being created.

# Similarity Criteria
Skills are similar when they serve the same user need or solve the same problem.
Ask yourself: "Would you be confused about which skill to use?"

Examples of similar skills:
- "Create GitHub issues for bugs" and "Open bug tickets on GitHub" (same outcome)
- "Send weekly reports via email" and "Email team updates every week" (same purpose)

Examples of skills that are NOT similar:
- "Read GitHub PRs" and "Create GitHub issues" (different actions, even if same platform)
- "Create Jira tickets" and "Create GitHub issues" (different tools, even if similar action)

# Instructions
Return skill IDs that would cause confusion about which skill to use.
Prefer precision over recall; only return truly overlapping skills.

IMPORTANT: Returning an empty array is the expected outcome in most cases.
Only return skill IDs when you are confident there is a genuine duplicate. When in doubt, return an empty array.

# Examples
## Example 1 - Clear duplicates
Input: "Create support tickets on GitHub"
Existing skills:
---
Skill ID abc12: "Open support cards on github.com"
---
Skill ID xxx15: "Read and edit Jira tickets"
---
Skill ID 20aaa: "Create issues on GitHub repositories"
---
Skill ID 25iju: "Manage customer support emails"

Output: set_similar_skills({ "similar_skills_array": ["abc12", "20aaa"] })
Reasoning: abc12 and 20aaa both create issues/tickets on GitHub.

## Example 2 - No duplicates
Input: "Create PowerPoint-like presentations"
Existing skills:
---
Skill ID abc12: "Open support cards on github.com"
---
Skill ID xxx15: "Read and edit Jira tickets"

Output: set_similar_skills({ "similar_skills_array": [] })
Reasoning: None of the existing skills handle presentations.

## Example 3 - Same platform, different action
Input: "Delete GitHub repositories"
Existing skills:
---
Skill ID aaa01: "Create issues on GitHub"

Output: set_similar_skills({ "similar_skills_array": [] })
Reasoning: Both use GitHub but actions don't overlap.
`;

function truncateDescription(description: string): string {
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return description.slice(0, MAX_DESCRIPTION_LENGTH);
  }
  return description;
}

async function findSimilarSkillsInBatch(
  auth: Authenticator,
  {
    model,
    naturalDescription,
    skills,
  }: {
    model: ModelConfigurationType;
    naturalDescription: string;
    skills: SkillResource[];
  }
): Promise<Result<string[], Error>> {
  const owner = auth.getNonNullableWorkspace();

  const existingSkills = skills
    .map(
      (s) => `Skill ID ${s.sId}:
"${truncateDescription(s.agentFacingDescription)}"`
    )
    .join("\n---\n");
  const inputText = `Input description:"${naturalDescription}"
Existing skills:
${existingSkills}
`;

  const res = await runMultiActionsAgent(
    auth,
    {
      modelId: model.modelId,
      providerId: model.providerId,
      temperature: 0.2,
      useCache: false,
    },
    {
      conversation: {
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: inputText }],
            name: "",
          },
        ],
      },
      prompt: PROMPT,
      specifications,
      forceToolCall: SET_SIMILAR_SKILLS_FUNCTION_NAME,
    },
    {
      context: {
        operationType: "skills_similarity_checker",
        userId: auth.user()?.sId,
        workspaceId: owner.sId,
      },
    }
  );

  if (res.isErr()) {
    return new Err(res.error);
  }

  let similar_skills: string[] | null = null;

  if (res.value.actions) {
    for (const action of res.value.actions) {
      if (action.name === SET_SIMILAR_SKILLS_FUNCTION_NAME) {
        similar_skills = action.arguments.similar_skills_array;
      }
    }
  }

  if (!similar_skills) {
    return new Err(new Error("No similar skills generated"));
  }

  return new Ok(similar_skills);
}

// By default we compare against all existing published custom skills: unpublished
// (editors-only) skills should not prevent someone else from creating a similar skill.
export const DEFAULT_SIMILAR_SKILLS_AVAILABILITIES: SkillAvailability[] = [
  "workspace_users",
  "users_and_agents",
];

export async function getSimilarSkills(
  auth: Authenticator,
  inputs: {
    naturalDescription: string;
    excludeSkillId: string | null;
    availabilities?: SkillAvailability[];
  }
): Promise<Result<{ similar_skills: string[] }, Error>> {
  const whiteListedProviders = await getEffectiveWhiteListedProviders(auth);
  const model = getSmallWhitelistedModel(auth, undefined, {
    whiteListedProviders,
  });
  if (!model) {
    return new Err(
      new Error("Failed to find a whitelisted model to generate cron rule")
    );
  }

  const allSkills: SkillResource[] = await SkillResource.listByWorkspace(auth, {
    onlyCustom: true,
    availability:
      inputs.availabilities ?? DEFAULT_SIMILAR_SKILLS_AVAILABILITIES,
  });

  const skills = inputs.excludeSkillId
    ? allSkills.filter((s) => s.sId !== inputs.excludeSkillId)
    : allSkills;

  if (skills.length === 0) {
    return new Ok({ similar_skills: [] });
  }

  // Check skills in batches, one LLM call per batch, so all skills are
  // considered regardless of how many the workspace has.
  const batches = chunk(skills, SKILLS_PER_LLM_CALL);
  const results = await concurrentExecutor(
    batches,
    async (batch) =>
      findSimilarSkillsInBatch(auth, {
        model,
        naturalDescription: inputs.naturalDescription,
        skills: batch,
      }),
    { concurrency: MAX_CONCURRENT_LLM_CALLS }
  );

  const similarSkillIds: string[] = [];
  for (const res of results) {
    if (res.isErr()) {
      return new Err(res.error);
    }
    similarSkillIds.push(...res.value);
  }

  return new Ok({ similar_skills: uniq(similarSkillIds) });
}
