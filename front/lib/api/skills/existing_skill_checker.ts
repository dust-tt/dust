import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import type { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import logger from "@app/logger/logger";
import { getSmallWhitelistedModel } from "@app/types/assistant/assistant";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

// Safeguards to avoid sending a huge number of skills to the LLM
const MAX_SKILLS_SENT_TO_LLM = 100;
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

export async function getSimilarSkills(
  auth: Authenticator,
  inputs: {
    naturalDescription: string;
    excludeSkillId: string | null;
  }
): Promise<Result<{ similar_skills: string[] }, Error>> {
  const owner = auth.getNonNullableWorkspace();

  const model = getSmallWhitelistedModel(owner);
  if (!model) {
    return new Err(
      new Error("Failed to find a whitelisted model to generate cron rule")
    );
  }

  // Retrieve existing skills
  const allSkills: SkillResource[] = await SkillResource.listByWorkspace(auth, {
    limit: MAX_SKILLS_SENT_TO_LLM,
    onlyCustom: true,
  });
  if (allSkills.length === MAX_SKILLS_SENT_TO_LLM) {
    logger.warn(
      { workspaceId: owner.sId },
      "The number of skills fetched reached the limit. Some skills might not be considered in the similarity check."
    );
  }

  const skills = inputs.excludeSkillId
    ? allSkills.filter((s) => s.sId !== inputs.excludeSkillId)
    : allSkills;

  const existingSkills = skills
    .map(
      (s) => `Skill ID ${s.sId}:
"${truncateDescription(s.agentFacingDescription)}"`
    )
    .join("\n---\n");
  const inputText = `Input description:"${inputs.naturalDescription}"
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

  return new Ok({ similar_skills: similar_skills });
}
